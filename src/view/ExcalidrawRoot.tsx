import React from "react";
import { Excalidraw } from "@excalidraw/excalidraw";

interface ExcalidrawRootProps {
  initialData: null;
}

export function ExcalidrawRoot(_props: ExcalidrawRootProps): React.ReactElement {
  return React.createElement(
    "div",
    { className: "excalidraw-wrapper", style: { width: "100%", height: "100%" } },
    React.createElement(Excalidraw, {
      initialData: { elements: [], appState: {}, files: {} },
    })
  );
}
