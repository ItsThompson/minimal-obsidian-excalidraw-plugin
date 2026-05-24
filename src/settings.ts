import { App, PluginSettingTab, Setting } from "obsidian";
import type MinimalExcalidrawPlugin from "./main";
import { DEFAULT_FOLDER } from "./constants";

export interface MinimalExcalidrawSettings {
  /** Vault-relative folder where new drawings are created. */
  folder: string;
}

export const DEFAULT_SETTINGS: MinimalExcalidrawSettings = {
  folder: DEFAULT_FOLDER,
};

export class MinimalExcalidrawSettingTab extends PluginSettingTab {
  private plugin: MinimalExcalidrawPlugin;

  constructor(app: App, plugin: MinimalExcalidrawPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Drawing folder")
      .setDesc("Vault folder where new drawings are created")
      .addText((text) =>
        text
          .setPlaceholder(DEFAULT_FOLDER)
          .setValue(this.plugin.settings.folder)
          .onChange(async (value) => {
            this.plugin.settings.folder = value;
            await this.plugin.saveSettings();
          }),
      );
  }
}
