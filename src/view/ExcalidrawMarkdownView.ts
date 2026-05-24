import { TextFileView } from "obsidian";
import { createRoot, Root } from "react-dom/client";
import { createElement } from "react";
import { VIEW_TYPE } from "../constants";
import { ExcalidrawMarkdownCodec } from "../markdown/ExcalidrawMarkdownCodec";
import { ExcalidrawRoot } from "./ExcalidrawRoot";
import type { ExcalidrawScene } from "../types";

type ViewStatus =
  | { type: "loading" }
  | { type: "ready" }
  | { type: "error"; message: string };

export class ExcalidrawMarkdownView extends TextFileView {
  private reactRoot: Root | null = null;
  private status: ViewStatus = { type: "loading" };
  private initialScene: ExcalidrawScene | null = null;

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
  }

  async onClose(): Promise<void> {
    this.reactRoot?.unmount();
    this.reactRoot = null;
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
      createElement(ExcalidrawRoot, { initialScene: this.initialScene! }),
    );
  }
}
