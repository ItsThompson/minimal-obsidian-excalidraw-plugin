import { TextFileView, WorkspaceLeaf } from "obsidian";
import { createRoot, Root } from "react-dom/client";
import { createElement } from "react";
import { VIEW_TYPE } from "../constants";
import { ExcalidrawRoot } from "./ExcalidrawRoot";

export class ExcalidrawMarkdownView extends TextFileView {
  private reactRoot: Root | null = null;

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
    this.renderExcalidraw();
  }

  clear(): void {
    this.data = "";
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

  private renderExcalidraw(): void {
    if (!this.reactRoot) return;

    this.reactRoot.render(
      createElement(ExcalidrawRoot, { initialData: null })
    );
  }
}
