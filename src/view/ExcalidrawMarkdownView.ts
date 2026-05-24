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

  getViewType(): string {
    return VIEW_TYPE;
  }

  getDisplayText(): string {
    return this.file?.basename ?? "Excalidraw";
  }

  getViewData(): string {
    return this.data;
  }

  setViewData(data: string, _clear: boolean): void {
    this.data = data;
    this.parseAndRender();
  }

  clear(): void {
    this.data = "";
    this.initialScene = null;
    this.status = { type: "loading" };
  }

  async onOpen(): Promise<void> {
    const container = this.contentEl;
    container.empty();
    container.addClass("excalidraw-view-container");

    const reactContainer = container.createDiv({ cls: "excalidraw-react-root" });
    this.reactRoot = createRoot(reactContainer);

    this.autosave = createAutosavedScene(
      async (scene) => {
        if (!this.file) return;
        if (this.status.type === "error") return;
        await DrawingFileService.writeDrawing(this.file, scene, this.app.vault);
      },
      undefined,
      {
        onWriteError: (error) => {
          const filepath = this.file?.path ?? "unknown";
          console.error(LOG_PREFIX, "autosave failed", filepath, error);
          new Notice(`Failed to save drawing: ${filepath}`, NOTICE_DURATION_MS);
        },
      },
    );
  }

  async onUnloadFile(file: TFile): Promise<void> {
    if (this.autosave?.isDirty && this.status.type !== "error") {
      try {
        await this.autosave.flush();
      } catch (error: unknown) {
        const filepath = file?.path ?? "unknown";
        console.error(LOG_PREFIX, "flush on unload failed", filepath, error);
        new Notice(`Failed to save drawing on close: ${filepath}`, NOTICE_DURATION_MS);
      }
    }

    this.reactRoot?.unmount();
    this.reactRoot = null;
    this.autosave = null;

    await super.onUnloadFile(file);
  }

  async onClose(): Promise<void> {
    // Cleanup is handled in onUnloadFile; unmount React if still present
    if (this.reactRoot) {
      this.reactRoot.unmount();
      this.reactRoot = null;
    }
    this.autosave = null;
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
        initialScene: this.initialScene!,
        onSceneChange: this.autosave?.handleSceneChange,
      }),
    );
  }
}
