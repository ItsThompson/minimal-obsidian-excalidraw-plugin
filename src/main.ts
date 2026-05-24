import { Notice, Plugin, WorkspaceLeaf, type ViewState } from "obsidian";
import { around } from "monkey-around";
import { ExcalidrawMarkdownView } from "./view/ExcalidrawMarkdownView";
import { VIEW_TYPE, FILE_EXTENSION, CMD_CREATE_DRAWING } from "./constants";
import { DrawingFileService } from "./file/DrawingFileService";
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
    console.log("[minimal-excalidraw] onload: starting plugin initialization");
    await this.loadSettings();

    this.registerView(VIEW_TYPE, (leaf) => {
      console.log("[minimal-excalidraw] registerView: creating ExcalidrawMarkdownView");
      return new ExcalidrawMarkdownView(leaf);
    });

    this.addSettingTab(new MinimalExcalidrawSettingTab(this.app, this));

    this.addCommand({
      id: CMD_CREATE_DRAWING,
      name: "Create new Excalidraw drawing",
      callback: () => this.createNewDrawing(),
    });

    this.patchWorkspaceLeaf();
    this.pluginLoaded = true;
    console.log("[minimal-excalidraw] onload: plugin fully loaded, pluginLoaded =", this.pluginLoaded);
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
            console.log("[minimal-excalidraw] setViewState intercepted:", {
              type: state.type,
              file: state.state?.file,
              pluginLoaded: self.pluginLoaded,
            });

            if (
              self.pluginLoaded &&
              state.type === "markdown" &&
              state.state?.file
            ) {
              const filepath = state.state.file as string;
              const isExcalidraw = self.isExcalidrawFile(filepath);
              console.log("[minimal-excalidraw] checking file:", filepath, "isExcalidraw:", isExcalidraw);

              if (isExcalidraw) {
                const newState = {
                  ...state,
                  type: VIEW_TYPE,
                };
                console.log("[minimal-excalidraw] redirecting to excalidraw view");
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
    const hasExtension = filepath.endsWith(`.${FILE_EXTENSION}`);
    const cache = this.app.metadataCache.getCache(filepath);
    const frontmatter = cache?.frontmatter;
    const hasFrontmatterKey = !!frontmatter?.[FRONTMATTER_KEY];
    console.log("[minimal-excalidraw] isExcalidrawFile:", {
      filepath,
      hasExtension,
      cacheExists: !!cache,
      frontmatter: frontmatter ?? "(null)",
      hasFrontmatterKey,
    });
    if (!hasExtension) return false;
    return hasFrontmatterKey;
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
