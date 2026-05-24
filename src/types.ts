/**
 * Excalidraw element type: minimal shape needed for codec and text projection.
 * When @excalidraw/excalidraw is added as a dependency, this can be replaced
 * with the upstream type. For now, we define the subset we need.
 */
export interface ExcalidrawElement {
  id: string;
  type: string;
  isDeleted?: boolean;
  [key: string]: unknown;
}

/**
 * Text element subset used by text projection.
 */
export interface ExcalidrawTextElement extends ExcalidrawElement {
  type: "text";
  text: string;
  containerId?: string | null;
}

/**
 * Binary file data stored in the scene files map.
 */
export interface BinaryFileData {
  mimeType: string;
  id: string;
  dataURL: string;
  created: number;
  lastRetrieved?: number;
}

/**
 * Frontmatter identifying files created by this minimal plugin.
 */
export interface MinimalExcalidrawFrontmatter {
  "excalidraw-plugin": "minimal";
  tags: ["excalidraw"];
}

/**
 * Native Excalidraw scene JSON embedded in the drawing block.
 */
export interface ExcalidrawScene {
  type: "excalidraw";
  version: number;
  source: string;
  elements: readonly ExcalidrawElement[];
  appState: Record<string, unknown>;
  files: Record<string, BinaryFileData>;
}

/**
 * Parsed representation of a .excalidraw.md file.
 */
export interface MinimalExcalidrawDocument {
  frontmatter: MinimalExcalidrawFrontmatter;
  textProjection: TextProjectionEntry[];
  scene: ExcalidrawScene;
}

/**
 * A single entry in the # Text Elements section.
 */
export interface TextProjectionEntry {
  elementId: string;
  text: string;
}

/**
 * Discriminated union for parse results.
 */
export type ParseResult =
  | { ok: true; document: MinimalExcalidrawDocument }
  | { ok: false; error: string };
