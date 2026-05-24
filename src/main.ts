import { Notice, Plugin, WorkspaceLeaf, type ViewState } from "obsidian";
import { around } from "monkey-around";
import { ExcalidrawMarkdownView } from "./view/ExcalidrawMarkdownView";
import { VIEW_TYPE, FILE_EXTENSION, CMD_CREATE_DRAWING } from "./constants";
import { DrawingFileService } from "./file/DrawingFileService";
import { registerEmbedPostProcessor } from "./embed/EmbedPostProcessor";
import {
  MinimalExcalidrawSettingTab,
  DEFAULT_SETTINGS,
  type MinimalExcalidrawSettings,
} from "./settings";

const FRONTMATTER_KEY = "excalidraw-plugin";

export default class MinimalExcalidrawPlugin extends Plugin {
  settings: MinimalExcalidrawSettings = DEFAULT_SETTINGS;
  /** Tracks whether the plugin is fully loaded (mirrors Plugin._loaded). */
  private pluginLoaded = false;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.registerView(VIEW_TYPE, (leaf) => new ExcalidrawMarkdownView(leaf));

    this.addSettingTab(new MinimalExcalidrawSettingTab(this.app, this));

    this.addCommand({
      id: CMD_CREATE_DRAWING,
      name: "Create new Excalidraw drawing",
      callback: () => this.createNewDrawing(),
    });

    this.patchWorkspaceLeaf();
    registerEmbedPostProcessor(this);
    this.pluginLoaded = true;
  }

  onunload(): void {
    this.pluginLoaded = false;
    this.app.workspace.detachLeavesOfType(VIEW_TYPE);
  }

  /**
   * Monkey-patch WorkspaceLeaf.setViewState so that .excalidraw.md files
   * (which Obsidian sees as .md) open in ExcalidrawMarkdownView instead
   * of the default markdown editor.
   */
  private patchWorkspaceLeaf(): void {
    const self = this;

    this.register(
      around(WorkspaceLeaf.prototype, {
        setViewState(next) {
          return function (this: WorkspaceLeaf, state: ViewState, eState?: unknown) {
            if (
              self.pluginLoaded &&
              state.type === "markdown" &&
              state.state?.file
            ) {
              const filepath = state.state.file as string;
              if (self.isExcalidrawFile(filepath)) {
                const newState = {
                  ...state,
                  type: VIEW_TYPE,
                };
                return next.apply(this, [newState, eState]);
              }
            }
            return next.apply(this, [state, eState]);
          };
        },
      }),
    );
  }

  /**
   * Check whether a file path represents an excalidraw drawing.
   * Uses path suffix and metadata cache frontmatter.
   */
  private isExcalidrawFile(filepath: string): boolean {
    if (!filepath.endsWith(`.${FILE_EXTENSION}`)) return false;

    // If metadata cache hasn't indexed this file yet (e.g., just created),
    // trust the .excalidraw.md extension alone.
    const cache = this.app.metadataCache.getCache(filepath);
    if (!cache) return true;

    // If cache exists, require the frontmatter key to avoid hijacking
    // .excalidraw.md files that don't belong to this plugin.
    return !!cache.frontmatter?.[FRONTMATTER_KEY];
  }

  async loadSettings(): Promise<void> {
    const data = await this.loadData();
    this.settings = { ...DEFAULT_SETTINGS, ...data };
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  private async createNewDrawing(): Promise<void> {
    try {
      const file = await DrawingFileService.createDrawing(
        { folder: this.settings.folder },
        this.app.vault,
      );

      const leaf = this.app.workspace.getLeaf(false);
      await leaf.openFile(file);
    } catch (error) {
      console.error("[minimal-excalidraw]", "create drawing failed", error);
      new Notice(
        `Failed to create drawing: ${error instanceof Error ? error.message : String(error)}`,
        5000,
      );
    }
  }
}
