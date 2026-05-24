import React from "react";
import { Excalidraw } from "@excalidraw/excalidraw";
import type { ExcalidrawScene } from "../types";

interface ExcalidrawRootProps {
  initialScene: ExcalidrawScene | null;
}

/**
 * Thin adapter: renders the upstream Excalidraw component.
 *
 * The type assertion on initialData is required because our internal
 * ExcalidrawElement is a minimal subset used by the codec/projection layer.
 * At runtime, the actual data contains full upstream element shapes read from files.
 */
export function ExcalidrawRoot({ initialScene }: ExcalidrawRootProps): React.ReactElement {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = initialScene
    ? { elements: initialScene.elements, appState: initialScene.appState, files: initialScene.files }
    : undefined;

  return (
    <div className="excalidraw-wrapper">
      <Excalidraw initialData={data} />
    </div>
  );
}
