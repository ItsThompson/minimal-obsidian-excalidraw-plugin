import type { ExcalidrawScene, ExcalidrawElement, BinaryFileData } from "../types";

const AUTOSAVE_DEBOUNCE_MS = 1500;

export interface AutosaveWriteFn {
  (scene: ExcalidrawScene): Promise<void>;
}

export interface AutosaveCallbacks {
  /** Called when a write attempt fails. */
  onWriteError?: (error: unknown) => void;
}

export interface AutosaveState {
  /** Whether the scene has unsaved changes. */
  isDirty: boolean;
  /** Called by Excalidraw's onChange with latest scene data. */
  handleSceneChange: (
    elements: readonly ExcalidrawElement[],
    appState: Record<string, unknown>,
    files: Record<string, BinaryFileData>,
  ) => void;
  /** Forces an immediate write of the pending scene if dirty. */
  flush: () => Promise<void>;
}

/**
 * Creates an autosave controller that debounces rapid scene changes into
 * a single write. Stores the latest scene in a ref-like closure to avoid
 * triggering React re-renders on every onChange event.
 *
 * @param writeFn - Called with the latest scene when the debounce timer fires.
 * @param debounceMs - Debounce delay in milliseconds. Defaults to 1500ms.
 */
export function createAutosavedScene(
  writeFn: AutosaveWriteFn,
  debounceMs: number = AUTOSAVE_DEBOUNCE_MS,
  callbacks: AutosaveCallbacks = {},
): AutosaveState {
  let isDirty = false;
  let pendingScene: ExcalidrawScene | null = null;
  let timerId: ReturnType<typeof setTimeout> | null = null;

  async function performWrite(): Promise<void> {
    if (!pendingScene) return;

    const sceneToWrite = pendingScene;
    try {
      await writeFn(sceneToWrite);
      // Only mark clean if this was still the latest scene
      if (pendingScene === sceneToWrite) {
        isDirty = false;
      }
    } catch (error: unknown) {
      // Keep dirty on failure; retry will happen on next debounce cycle
      callbacks.onWriteError?.(error);
    }
  }

  function scheduleWrite(): void {
    if (timerId !== null) {
      clearTimeout(timerId);
    }
    timerId = setTimeout(() => {
      timerId = null;
      void performWrite();
    }, debounceMs);
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
    isDirty = true;
    scheduleWrite();
  }

  async function flush(): Promise<void> {
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
    if (isDirty) {
      await performWrite();
    }
  }

  return {
    get isDirty() {
      return isDirty;
    },
    handleSceneChange,
    flush,
  };
}
