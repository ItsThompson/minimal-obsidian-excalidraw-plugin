import type {
  ExcalidrawScene,
  MinimalExcalidrawDocument,
  MinimalExcalidrawFrontmatter,
  ParseResult,
} from "../types";
import {
  extractTextProjection,
  renderTextProjectionSection,
  parseTextProjectionSection,
} from "./textProjection";

const FRONTMATTER_DELIMITER = "---";
const DRAWING_COMMENT_OPEN = "%%";
const DRAWING_COMMENT_CLOSE = "%%";
const DRAWING_HEADER = "# Drawing";
const JSON_FENCE_OPEN = "```json";
const JSON_FENCE_CLOSE = "```";

const DEFAULT_FRONTMATTER: MinimalExcalidrawFrontmatter = {
  "excalidraw-plugin": "minimal",
  tags: ["excalidraw"],
};

/**
 * Canonical owner of markdown parsing and serialization for .excalidraw.md files.
 *
 * The codec is stateless: all methods are pure functions operating on string
 * input/output with no Obsidian runtime dependency.
 */
export const ExcalidrawMarkdownCodec = {
  /**
   * Parses a .excalidraw.md file into a structured document.
   * Returns a discriminated union: success with document, or failure with error message.
   */
  parse(markdown: string): ParseResult {
    // Find the hidden drawing block
    const drawingBlockResult = extractDrawingBlock(markdown);
    if (!drawingBlockResult.ok) {
      return { ok: false, error: drawingBlockResult.error };
    }

    // Parse the JSON from the drawing block
    const sceneResult = parseSceneJson(drawingBlockResult.json);
    if (!sceneResult.ok) {
      return { ok: false, error: sceneResult.error };
    }

    // Extract text projection from the markdown (for the document structure)
    const textSection = extractTextSection(markdown);
    const textProjection = parseTextProjectionSection(textSection);

    return {
      ok: true,
      document: {
        frontmatter: DEFAULT_FRONTMATTER,
        textProjection,
        scene: sceneResult.scene,
      },
    };
  },

  /**
   * Serializes an ExcalidrawScene into the full .excalidraw.md envelope format.
   */
  serialize(scene: ExcalidrawScene): string {
    const frontmatter = renderFrontmatter();
    const textEntries = extractTextProjection(scene.elements);
    const textSection = renderTextProjectionSection(textEntries);
    const drawingBlock = renderDrawingBlock(scene);

    return `${frontmatter}\n${textSection}\n${drawingBlock}\n`;
  },

  /**
   * Produces a valid empty-scene markdown string.
   */
  createEmptyDocument(): string {
    const emptyScene: ExcalidrawScene = {
      type: "excalidraw",
      version: 2,
      source: "https://excalidraw.com",
      elements: [],
      appState: {},
      files: {},
    };

    return ExcalidrawMarkdownCodec.serialize(emptyScene);
  },
};

// --- Internal helpers ---

function renderFrontmatter(): string {
  return [
    FRONTMATTER_DELIMITER,
    `excalidraw-plugin: minimal`,
    `tags: [excalidraw]`,
    FRONTMATTER_DELIMITER,
  ].join("\n");
}

function renderDrawingBlock(scene: ExcalidrawScene): string {
  const json = JSON.stringify(scene, null, 2);
  return [
    DRAWING_COMMENT_OPEN,
    DRAWING_HEADER,
    JSON_FENCE_OPEN,
    json,
    JSON_FENCE_CLOSE,
    DRAWING_COMMENT_CLOSE,
  ].join("\n");
}

function extractDrawingBlock(
  markdown: string,
): { ok: true; json: string } | { ok: false; error: string } {
  // Find the %% ... %% comment block containing # Drawing
  const commentStart = markdown.indexOf(DRAWING_COMMENT_OPEN);
  if (commentStart === -1) {
    return { ok: false, error: "Missing drawing block: no %% comment markers found" };
  }

  const commentEnd = markdown.indexOf(
    DRAWING_COMMENT_CLOSE,
    commentStart + DRAWING_COMMENT_OPEN.length,
  );
  if (commentEnd === -1) {
    return { ok: false, error: "Missing drawing block: unclosed %% comment" };
  }

  const commentContent = markdown.slice(
    commentStart + DRAWING_COMMENT_OPEN.length,
    commentEnd,
  );

  // Find the JSON fence within the comment
  const jsonFenceStart = commentContent.indexOf(JSON_FENCE_OPEN);
  if (jsonFenceStart === -1) {
    return { ok: false, error: "Missing drawing block: no ```json fence found" };
  }

  const jsonStart = jsonFenceStart + JSON_FENCE_OPEN.length;
  const jsonEnd = commentContent.indexOf(JSON_FENCE_CLOSE, jsonStart);
  if (jsonEnd === -1) {
    return { ok: false, error: "Missing drawing block: unclosed ```json fence" };
  }

  const json = commentContent.slice(jsonStart, jsonEnd).trim();
  return { ok: true, json };
}

function parseSceneJson(
  json: string,
): { ok: true; scene: ExcalidrawScene } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, error: "Invalid JSON in drawing block" };
  }

  if (typeof parsed !== "object" || parsed === null) {
    return { ok: false, error: "Drawing block JSON is not an object" };
  }

  const obj = parsed as Record<string, unknown>;

  if (obj.type !== "excalidraw") {
    return {
      ok: false,
      error: 'Drawing block JSON missing required type: "excalidraw"',
    };
  }

  if (!Array.isArray(obj.elements)) {
    return { ok: false, error: "Drawing block JSON missing elements array" };
  }

  if (typeof obj.appState !== "object" || obj.appState === null) {
    return { ok: false, error: "Drawing block JSON missing appState object" };
  }

  if (typeof obj.files !== "object" || obj.files === null) {
    return { ok: false, error: "Drawing block JSON missing files object" };
  }

  return {
    ok: true,
    scene: {
      type: "excalidraw",
      version: typeof obj.version === "number" ? obj.version : 2,
      source: typeof obj.source === "string" ? obj.source : "https://excalidraw.com",
      elements: obj.elements as ExcalidrawScene["elements"],
      appState: obj.appState as Record<string, unknown>,
      files: obj.files as Record<string, ExcalidrawScene["files"][string]>,
    },
  };
}

function extractTextSection(markdown: string): string {
  const textHeaderIndex = markdown.indexOf("# Text Elements");
  if (textHeaderIndex === -1) return "";

  // The text section ends at the first %% (start of drawing block)
  const sectionEnd = markdown.indexOf(DRAWING_COMMENT_OPEN, textHeaderIndex);
  if (sectionEnd === -1) {
    return markdown.slice(textHeaderIndex).trim();
  }

  return markdown.slice(textHeaderIndex, sectionEnd).trim();
}
