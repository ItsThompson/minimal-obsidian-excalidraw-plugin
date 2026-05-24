import { TextFileView, Notice, TFile } from "obsidian";
import { createRoot, Root } from "react-dom/client";
import { createElement } from "react";
import { VIEW_TYPE } from "../constants";
import { ExcalidrawMarkdownCodec } from "../markdown/ExcalidrawMarkdownCodec";
import { DrawingFileService } from "../file/DrawingFileService";
import { ExcalidrawRoot } from "./ExcalidrawRoot";
import { createAutosavedScene, type AutosaveState } from "./useAutosavedScene";
import type { ExcalidrawScene } from "../types";

const LOG_PREFIX = "[minimal-excalidraw]";
const NOTICE_DURATION_MS = 5000;

type ViewStatus =
  | { type: "loading" }
  | { type: "ready" }
  | { type: "error"; message: string };

export class ExcalidrawMarkdownView extends TextFileView {
  private reactRoot: Root | null = null;
  private status: ViewStatus = { type: "loading" };
  private initialScene: ExcalidrawScene | null = null;
  private autosave: AutosaveState | null = null;
  private wysiwygObserver: MutationObserver | null = null;

  getViewType(): string {
    return VIEW_TYPE;
  }

  getDisplayText(): string {
    const name = this.file?.basename ?? "Excalidraw";
    if (this.autosave?.isSaving) {
      return `↻ ${name}`;
    }
    if (this.autosave?.isDirty) {
      return `● ${name}`;
    }
    return name;
  }

  getViewData(): string {
    return this.data;
  }

  setViewData(data: string, clear: boolean): void {
    if (clear) {
      this.attachFile();
    }
    this.data = data;
    this.parseAndRender();
  }

  clear(): void {
    this.data = "";
    this.initialScene = null;
    this.status = { type: "loading" };
  }

  async onOpen(): Promise<void> {
    this.mountView();
  }

  async onUnloadFile(file: TFile): Promise<void> {
    await this.detachFile();
    await super.onUnloadFile(file);
  }

  async onClose(): Promise<void> {
    this.unmountView();
  }

  // ─── View-tier: lives for the tab's lifespan ───────────────────────

  private mountView(): void {
    const container = this.contentEl;
    container.empty();
    container.addClass("excalidraw-view-container");

    const reactContainer = container.createDiv({ cls: "excalidraw-react-root" });
    this.reactRoot = createRoot(reactContainer);
    this.wysiwygObserver = this.createWysiwygObserver(container);
  }

  private unmountView(): void {
    // Defensive flush: handles plugin-unload path where onClose fires
    // without a preceding onUnloadFile
    if (this.autosave && this.status.type !== "error") {
      // Cannot await in sync-shaped onClose, but flush is best-effort here.
      // In practice, Obsidian awaits onClose.
      void this.autosave.flush();
    }
    this.autosave?.destroy();
    this.autosave = null;

    this.reactRoot?.unmount();
    this.reactRoot = null;
    this.wysiwygObserver?.disconnect();
    this.wysiwygObserver = null;
  }

  // ─── File-tier: lives per file switch ──────────────────────────────

  private attachFile(): void {
    this.autosave?.destroy();
    this.autosave = createAutosavedScene(
      async (scene) => {
        if (!this.file) return;
        if (this.status.type === "error") return;
        await DrawingFileService.writeDrawing(this.file, scene, this.app.vault);
        (this.leaf as any).updateHeader();
      },
      undefined,
      {
        onWriteError: (error) => {
          const filepath = this.file?.path ?? "unknown";
          console.error(LOG_PREFIX, "autosave failed", filepath, error);
          new Notice(`Failed to save drawing: ${filepath}`, NOTICE_DURATION_MS);
          (this.leaf as any).updateHeader();
        },
        onDirty: () => {
          (this.leaf as any).updateHeader();
        },
      },
    );
  }

  private async detachFile(): Promise<void> {
    if (this.autosave && this.status.type !== "error") {
      if (this.autosave.isSaving) {
        console.log(LOG_PREFIX, "waiting for in-progress save before unload");
        new Notice("Saving drawing…", NOTICE_DURATION_MS);
        const finished = await this.autosave.waitForSave();
        if (!finished) {
          new Notice("Save is taking too long, data may be lost", NOTICE_DURATION_MS);
        }
      }
      if (this.autosave.isDirty) {
        await this.autosave.flush();
      }
    }
    this.autosave?.destroy();
    this.autosave = null;
    this.initialScene = null;
    this.status = { type: "loading" };
  }

  /**
   * Creates a MutationObserver that watches for Excalidraw's WYSIWYG textarea
   * and forces color + caret-color with inline !important to beat Obsidian's
   * global textarea styles. Also observes attribute changes since Excalidraw
   * updates style.color when the element's strokeColor changes.
   */
  private createWysiwygObserver(container: HTMLElement): MutationObserver {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (
            node instanceof HTMLTextAreaElement &&
            node.classList.contains("excalidraw-wysiwyg")
          ) {
            this.fixWysiwygColors(node);
          }
        });
        if (
          mutation.type === "attributes" &&
          mutation.attributeName === "style" &&
          mutation.target instanceof HTMLTextAreaElement &&
          mutation.target.classList.contains("excalidraw-wysiwyg")
        ) {
          this.fixWysiwygColors(mutation.target);
        }
      });
    });
    observer.observe(container, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["style"],
    });
    return observer;
  }

  /**
   * Force textarea color and caret-color to match Excalidraw's inline
   * style.color (the element's strokeColor). Uses inline !important to
   * beat Obsidian's global textarea styles.
   */
  private fixWysiwygColors(textarea: HTMLTextAreaElement): void {
    const color = textarea.style.color;
    if (!color) return;
    textarea.style.setProperty("color", color, "important");
    textarea.style.setProperty("-webkit-text-fill-color", color, "important");
    textarea.style.setProperty("caret-color", color, "important");
  }

  private parseAndRender(): void {
    if (!this.data) {
      this.status = { type: "loading" };
      this.render();
      return;
    }

    const result = ExcalidrawMarkdownCodec.parse(this.data);

    if (result.ok) {
      this.initialScene = result.document.scene;
      this.status = { type: "ready" };
    } else {
      this.initialScene = null;
      this.status = { type: "error", message: result.error };
    }

    this.render();
  }

  private render(): void {
    if (!this.reactRoot) return;

    if (this.status.type === "error") {
      this.reactRoot.render(
        createElement("div", { className: "excalidraw-error" },
          createElement("p", null, "Drawing could not be loaded"),
          createElement("p", { className: "excalidraw-error-detail" }, this.status.message),
        ),
      );
      return;
    }

    if (this.status.type === "loading") {
      this.reactRoot.render(
        createElement("div", { className: "excalidraw-loading" }, "Loading drawing…"),
      );
      return;
    }

    this.reactRoot.render(
      createElement(ExcalidrawRoot, {
        key: this.file?.path ?? "",
        initialScene: this.initialScene!,
        onSceneChange: this.autosave?.handleSceneChange,
      }),
    );
  }
}
