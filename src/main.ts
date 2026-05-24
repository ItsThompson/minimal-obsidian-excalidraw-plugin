import { Plugin } from "obsidian";
import { ExcalidrawMarkdownView } from "./view/ExcalidrawMarkdownView";
import { VIEW_TYPE, FILE_EXTENSION } from "./constants";

export default class MinimalExcalidrawPlugin extends Plugin {
  async onload(): Promise<void> {
    this.registerView(VIEW_TYPE, (leaf) => new ExcalidrawMarkdownView(leaf));

    this.registerExtensions([FILE_EXTENSION], VIEW_TYPE);
  }

  onunload(): void {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE);
  }
}
