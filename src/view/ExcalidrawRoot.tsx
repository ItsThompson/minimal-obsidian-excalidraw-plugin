import React from "react";
import { Excalidraw } from "@excalidraw/excalidraw";
import type { ExcalidrawScene } from "../types";

export interface ExcalidrawRootProps {
  /** Scene loaded from the markdown drawing block. */
  initialScene: ExcalidrawScene;
  /** Receives latest upstream Excalidraw scene data. Optional until autosave is wired. */
  onSceneChange?: (scene: ExcalidrawScene) => void;
}

/**
 * Thin adapter: renders the upstream Excalidraw component with initialData
 * constructed from the parsed scene.
 *
 * The type assertion on initialData is required because our internal
 * ExcalidrawElement is a minimal subset used by the codec/projection layer.
 * At runtime, the actual data contains full upstream element shapes read from files.
 */
export function ExcalidrawRoot({ initialScene }: ExcalidrawRootProps): React.ReactElement {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const initialData: any = {
    elements: initialScene.elements,
    appState: initialScene.appState,
    files: initialScene.files,
  };

  return (
    <div className="excalidraw-wrapper">
      <Excalidraw initialData={initialData} />
    </div>
  );
}
