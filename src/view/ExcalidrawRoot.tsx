import React from "react";
import { Excalidraw } from "@excalidraw/excalidraw";
import type { ExcalidrawScene } from "../types";

export interface ExcalidrawRootProps {
  /** Scene loaded from the markdown drawing block. */
  initialScene: ExcalidrawScene;
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
  // Our internal ExcalidrawElement/BinaryFileData are minimal subsets of upstream types.
  // At runtime the actual data contains full upstream shapes read from files.
  // The cast is narrowed to the prop boundary where our types meet upstream's.
  const initialData = {
    elements: initialScene.elements,
    appState: initialScene.appState,
    files: initialScene.files,
  } as React.ComponentProps<typeof Excalidraw>["initialData"];

  return (
    <div className="excalidraw-wrapper">
      <Excalidraw initialData={initialData} />
    </div>
  );
}
