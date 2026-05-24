import { Plugin } from "obsidian";
import { ExcalidrawMarkdownView } from "./view/ExcalidrawMarkdownView";
import { VIEW_TYPE, FILE_EXTENSION, CMD_CREATE_DRAWING } from "./constants";
import { DrawingFileService } from "./file/DrawingFileService";
import {
  MinimalExcalidrawSettingTab,
  DEFAULT_SETTINGS,
  type MinimalExcalidrawSettings,
} from "./settings";

export default class MinimalExcalidrawPlugin extends Plugin {
  settings: MinimalExcalidrawSettings = DEFAULT_SETTINGS;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.registerView(VIEW_TYPE, (leaf) => new ExcalidrawMarkdownView(leaf));
    this.registerExtensions([FILE_EXTENSION], VIEW_TYPE);

    this.addSettingTab(new MinimalExcalidrawSettingTab(this.app, this));

    this.addCommand({
      id: CMD_CREATE_DRAWING,
      name: "Create new Excalidraw drawing",
      callback: () => this.createNewDrawing(),
    });
  }

  onunload(): void {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE);
  }

  async loadSettings(): Promise<void> {
    const data = await this.loadData();
    this.settings = { ...DEFAULT_SETTINGS, ...data };
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  private async createNewDrawing(): Promise<void> {
    const file = await DrawingFileService.createDrawing(
      { folder: this.settings.folder },
      this.app.vault,
    );

    const leaf = this.app.workspace.getLeaf(false);
    await leaf.openFile(file);
  }
}
