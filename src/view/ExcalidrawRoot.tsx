import React, { useCallback } from "react";
import { Excalidraw } from "@excalidraw/excalidraw";
import type { ExcalidrawScene, ExcalidrawElement, BinaryFileData } from "../types";

export interface ExcalidrawRootProps {
  /** Scene loaded from the markdown drawing block. */
  initialScene: ExcalidrawScene;
  /** Called when the scene changes (elements, appState, or files). */
  onSceneChange?: (
    elements: readonly ExcalidrawElement[],
    appState: Record<string, unknown>,
    files: Record<string, BinaryFileData>,
  ) => void;
}

/**
 * Thin adapter: renders the upstream Excalidraw component with initialData
 * constructed from the parsed scene.
 *
 * The type assertion on initialData is required because our internal
 * ExcalidrawElement is a minimal subset used by the codec/projection layer.
 * At runtime, the actual data contains full upstream element shapes read from files.
 */
export function ExcalidrawRoot({ initialScene, onSceneChange }: ExcalidrawRootProps): React.ReactElement {
  // Our internal ExcalidrawElement/BinaryFileData are minimal subsets of upstream types.
  // At runtime the actual data contains full upstream shapes read from files.
  // The cast is narrowed to the prop boundary where our types meet upstream's.
  const initialData = {
    elements: initialScene.elements,
    appState: initialScene.appState,
    files: initialScene.files,
  } as React.ComponentProps<typeof Excalidraw>["initialData"];

  const handleChange = useCallback(
    (elements: readonly any[], appState: any, files: any) => {
      onSceneChange?.(elements, appState, files);
    },
    [onSceneChange],
  );

  return (
    <div className="excalidraw-wrapper">
      <Excalidraw initialData={initialData} onChange={handleChange} />
    </div>
  );
}
