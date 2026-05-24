import type { ExcalidrawScene, ExcalidrawElement, BinaryFileData } from "../types";

/** Save interval: check every 2 seconds if dirty, then save. */
const AUTOSAVE_INTERVAL_MS = 2000;

/**
 * appState keys that should NOT be persisted. These represent transient
 * editing state that causes glitches on reload.
 */
const VOLATILE_APP_STATE_KEYS: string[] = [
  "editingTextElement",
  "newElement",
  "selectedElementIds",
  "selectedGroupIds",
  "editingGroupId",
  "draggingElement",
  "resizingElement",
  "editingLinearElement",
  "selectionElement",
  "isResizing",
  "isRotating",
  "openMenu",
  "openPopup",
  "openSidebar",
  "openDialog",
  "collaborators",
];

export interface AutosaveWriteFn {
  (scene: ExcalidrawScene): Promise<void>;
}

export interface AutosaveCallbacks {
  /** Called when a write attempt fails. */
  onWriteError?: (error: unknown) => void;
  /** Called when the scene first becomes dirty (for UI indicators). */
  onDirty?: () => void;
}

export interface AutosaveState {
  /** Whether the scene has unsaved changes. */
  isDirty: boolean;
  /** Whether a write is currently in progress. */
  isSaving: boolean;
  /** Called by Excalidraw's onChange with latest scene data. */
  handleSceneChange: (
    elements: readonly ExcalidrawElement[],
    appState: Record<string, unknown>,
    files: Record<string, BinaryFileData>,
  ) => void;
  /** Forces an immediate write of the pending scene if dirty. */
  flush: () => Promise<void>;
  /** Waits for any in-progress save to complete (with timeout). */
  waitForSave: (timeoutMs?: number) => Promise<boolean>;
  /** Stops the autosave interval. Call on cleanup. */
  destroy: () => void;
}

/**
 * Creates an autosave controller that periodically checks for dirty state
 * and writes the latest scene. Uses an interval timer (like the original
 * Excalidraw plugin) rather than debounce, since Excalidraw's onChange
 * fires continuously during pointer movement.
 */
export function createAutosavedScene(
  writeFn: AutosaveWriteFn,
  intervalMs: number = AUTOSAVE_INTERVAL_MS,
  callbacks: AutosaveCallbacks = {},
): AutosaveState {
  let isDirty = false;
  let isSaving = false;
  let pendingScene: ExcalidrawScene | null = null;
  let intervalId: ReturnType<typeof setInterval> | null = null;

  /**
   * Returns true if the scene is in an active editing state that
   * should not be interrupted by a save.
   */
  function isActivelyEditing(): boolean {
    if (!pendingScene) return false;
    const appState = pendingScene.appState;
    return (
      appState.editingTextElement != null ||
      appState.newElement != null
    );
  }

  /**
   * Strips volatile/transient appState fields before writing.
   * This prevents reload from trying to restore mid-edit state.
   */
  function cleanSceneForPersistence(scene: ExcalidrawScene): ExcalidrawScene {
    const cleanAppState = { ...scene.appState };
    for (const key of VOLATILE_APP_STATE_KEYS) {
      delete cleanAppState[key];
    }
    return { ...scene, appState: cleanAppState };
  }

  async function performWrite(): Promise<void> {
    if (!pendingScene || isSaving) return;

    const sceneToWrite = cleanSceneForPersistence(pendingScene);
    isSaving = true;
    try {
      await writeFn(sceneToWrite);
      if (pendingScene.elements === sceneToWrite.elements) {
        isDirty = false;
      }
    } catch (error: unknown) {
      callbacks.onWriteError?.(error);
    } finally {
      isSaving = false;
    }
  }

  function handleSceneChange(
    elements: readonly ExcalidrawElement[],
    appState: Record<string, unknown>,
    files: Record<string, BinaryFileData>,
  ): void {
    pendingScene = {
      type: "excalidraw",
      version: 2,
      source: "https://excalidraw.com",
      elements,
      appState,
      files,
    };
    if (!isDirty) {
      callbacks.onDirty?.();
    }
    isDirty = true;
  }

  async function flush(): Promise<void> {
    if (isSaving) {
      await waitForSave();
    }
    if (isDirty) {
      await performWrite();
    }
  }

  async function waitForSave(timeoutMs = 10000): Promise<boolean> {
    const start = Date.now();
    while (isSaving) {
      if (Date.now() - start > timeoutMs) {
        return false;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return true;
  }

  function destroy(): void {
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }

  // Start periodic check: skip save if actively editing text/new element
  intervalId = setInterval(() => {
    if (isDirty && !isSaving && !isActivelyEditing()) {
      void performWrite();
    }
  }, intervalMs);

  return {
    get isDirty() {
      return isDirty;
    },
    get isSaving() {
      return isSaving;
    },
    handleSceneChange,
    flush,
    waitForSave,
    destroy,
  };
}
