import React, { useCallback } from "react";
import { Excalidraw } from "@excalidraw/excalidraw";
import type { ExcalidrawScene, ExcalidrawElement, BinaryFileData } from "../types";

type ExcalidrawOnChange = NonNullable<React.ComponentProps<typeof Excalidraw>["onChange"]>;

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

  // Upstream onChange emits concrete types (OrderedExcalidrawElement, AppState,
  // BinaryFiles) that are supersets of our minimal internal types. We accept
  // the upstream shapes and narrow to our internal types for the autosave layer.
  const handleChange: ExcalidrawOnChange = useCallback(
    (elements, appState, files) => {
      onSceneChange?.(
        elements as unknown as readonly ExcalidrawElement[],
        appState as unknown as Record<string, unknown>,
        files as unknown as Record<string, BinaryFileData>,
      );
    },
    [onSceneChange],
  );

  return (
    <div className="excalidraw-wrapper">
      <Excalidraw initialData={initialData} onChange={handleChange} />
    </div>
  );
}
