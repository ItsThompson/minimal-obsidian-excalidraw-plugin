import { describe, it, expect } from "vitest";
import { ExcalidrawMarkdownCodec } from "../markdown/ExcalidrawMarkdownCodec";
import type { ExcalidrawScene } from "../types";

function buildMinimalScene(
  overrides?: Partial<ExcalidrawScene>,
): ExcalidrawScene {
  return {
    type: "excalidraw",
    version: 2,
    source: "https://excalidraw.com",
    elements: [],
    appState: {},
    files: {},
    ...overrides,
  };
}

function buildValidMarkdown(sceneJson?: string): string {
  const json =
    sceneJson ??
    JSON.stringify(buildMinimalScene(), null, 2);

  return [
    "---",
    "excalidraw-plugin: minimal",
    "tags: [excalidraw]",
    "---",
    "",
    "# Text Elements",
    "",
    "%%",
    "# Drawing",
    "```json",
    json,
    "```",
    "%%",
    "",
  ].join("\n");
}

describe("ExcalidrawMarkdownCodec.parse", () => {
  it("parses a valid empty-scene document", () => {
    const markdown = buildValidMarkdown();

    const result = ExcalidrawMarkdownCodec.parse(markdown);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.scene.type).toBe("excalidraw");
    expect(result.document.scene.elements).toEqual([]);
    expect(result.document.scene.appState).toEqual({});
    expect(result.document.scene.files).toEqual({});
  });

  it("parses a document with elements", () => {
    const scene = buildMinimalScene({
      elements: [
        { id: "rect1", type: "rectangle", x: 0, y: 0, width: 100, height: 50 },
      ],
    });
    const markdown = buildValidMarkdown(JSON.stringify(scene, null, 2));

    const result = ExcalidrawMarkdownCodec.parse(markdown);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.scene.elements).toHaveLength(1);
    expect(result.document.scene.elements[0]!.id).toBe("rect1");
  });

  it("parses text projection entries", () => {
    const scene = buildMinimalScene({
      elements: [
        { id: "text1", type: "text", text: "Hello", isDeleted: false },
      ],
    });
    const markdown = [
      "---",
      "excalidraw-plugin: minimal",
      "tags: [excalidraw]",
      "---",
      "",
      "# Text Elements",
      "Hello ^text1",
      "",
      "%%",
      "# Drawing",
      "```json",
      JSON.stringify(scene, null, 2),
      "```",
      "%%",
      "",
    ].join("\n");

    const result = ExcalidrawMarkdownCodec.parse(markdown);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.textProjection).toEqual([
      { elementId: "text1", text: "Hello" },
    ]);
  });

  it("rejects markdown with missing drawing block", () => {
    const markdown = [
      "---",
      "excalidraw-plugin: minimal",
      "tags: [excalidraw]",
      "---",
      "",
      "# Text Elements",
      "",
    ].join("\n");

    const result = ExcalidrawMarkdownCodec.parse(markdown);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("Missing drawing block");
  });

  it("rejects invalid JSON in drawing block", () => {
    const markdown = buildValidMarkdown("{ not valid json }}}");

    const result = ExcalidrawMarkdownCodec.parse(markdown);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("Invalid JSON");
  });

  it('rejects JSON missing type: "excalidraw"', () => {
    const markdown = buildValidMarkdown(
      JSON.stringify({ type: "other", elements: [], appState: {}, files: {} }),
    );

    const result = ExcalidrawMarkdownCodec.parse(markdown);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('type: "excalidraw"');
  });

  it("rejects JSON missing elements array", () => {
    const markdown = buildValidMarkdown(
      JSON.stringify({ type: "excalidraw", appState: {}, files: {} }),
    );

    const result = ExcalidrawMarkdownCodec.parse(markdown);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("elements");
  });

  it("rejects JSON missing appState", () => {
    const markdown = buildValidMarkdown(
      JSON.stringify({ type: "excalidraw", elements: [], files: {} }),
    );

    const result = ExcalidrawMarkdownCodec.parse(markdown);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("appState");
  });

  it("rejects JSON missing files object", () => {
    const markdown = buildValidMarkdown(
      JSON.stringify({ type: "excalidraw", elements: [], appState: {} }),
    );

    const result = ExcalidrawMarkdownCodec.parse(markdown);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("files");
  });

  it("returns typed error, not an exception", () => {
    const result = ExcalidrawMarkdownCodec.parse("completely invalid");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(typeof result.error).toBe("string");
  });
});

describe("ExcalidrawMarkdownCodec.serialize", () => {
  it("produces the correct envelope format", () => {
    const scene = buildMinimalScene();

    const result = ExcalidrawMarkdownCodec.serialize(scene);

    expect(result).toContain("---\nexcalidraw-plugin: minimal\ntags: [excalidraw]\n---");
    expect(result).toContain("# Text Elements");
    expect(result).toContain("%%\n# Drawing\n```json\n");
    expect(result).toContain("```\n%%");
  });

  it("includes text projection for text elements", () => {
    const scene = buildMinimalScene({
      elements: [
        { id: "t1", type: "text", text: "Searchable text", isDeleted: false },
      ],
    });

    const result = ExcalidrawMarkdownCodec.serialize(scene);

    expect(result).toContain("Searchable text ^t1");
  });

  it("excludes deleted text elements from projection", () => {
    const scene = buildMinimalScene({
      elements: [
        { id: "t1", type: "text", text: "Visible", isDeleted: false },
        { id: "t2", type: "text", text: "Deleted", isDeleted: true },
      ],
    });

    const result = ExcalidrawMarkdownCodec.serialize(scene);

    expect(result).toContain("Visible ^t1");
    expect(result).not.toContain("Deleted ^t2");
  });

  it("renders frontmatter with YAML delimiters", () => {
    const scene = buildMinimalScene();

    const result = ExcalidrawMarkdownCodec.serialize(scene);

    const lines = result.split("\n");
    expect(lines[0]).toBe("---");
    expect(lines[1]).toBe("excalidraw-plugin: minimal");
    expect(lines[2]).toBe("tags: [excalidraw]");
    expect(lines[3]).toBe("---");
  });

  it("wraps drawing block in %% comment markers", () => {
    const scene = buildMinimalScene();

    const result = ExcalidrawMarkdownCodec.serialize(scene);

    const commentStart = result.indexOf("%%");
    const commentEnd = result.indexOf("%%", commentStart + 2);
    expect(commentStart).toBeGreaterThan(-1);
    expect(commentEnd).toBeGreaterThan(commentStart);

    const between = result.slice(commentStart, commentEnd + 2);
    expect(between).toContain("# Drawing");
    expect(between).toContain("```json");
  });
});

describe("ExcalidrawMarkdownCodec.createEmptyDocument", () => {
  it("produces a valid empty-scene markdown string", () => {
    const result = ExcalidrawMarkdownCodec.createEmptyDocument();

    expect(result).toContain("---\nexcalidraw-plugin: minimal");
    expect(result).toContain("# Text Elements");
    expect(result).toContain('"type": "excalidraw"');
    expect(result).toContain('"elements": []');
  });

  it("is parseable by parse()", () => {
    const markdown = ExcalidrawMarkdownCodec.createEmptyDocument();

    const result = ExcalidrawMarkdownCodec.parse(markdown);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.scene.elements).toEqual([]);
  });
});

describe("Round-trip: parse(serialize(scene))", () => {
  it("preserves elements without loss", () => {
    const scene = buildMinimalScene({
      elements: [
        { id: "rect1", type: "rectangle", x: 10, y: 20, width: 100, height: 50 },
        { id: "text1", type: "text", text: "Hello", x: 50, y: 30 },
      ],
    });

    const serialized = ExcalidrawMarkdownCodec.serialize(scene);
    const result = ExcalidrawMarkdownCodec.parse(serialized);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.scene.elements).toEqual(scene.elements);
  });

  it("preserves appState without loss", () => {
    const scene = buildMinimalScene({
      appState: { viewBackgroundColor: "#ffffff", zoom: { value: 1.5 } },
    });

    const serialized = ExcalidrawMarkdownCodec.serialize(scene);
    const result = ExcalidrawMarkdownCodec.parse(serialized);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.scene.appState).toEqual(scene.appState);
  });

  it("preserves files without loss", () => {
    const scene = buildMinimalScene({
      files: {
        "file1": {
          mimeType: "image/png",
          id: "file1",
          dataURL: "data:image/png;base64,abc123",
          created: 1700000000000,
        },
      },
    });

    const serialized = ExcalidrawMarkdownCodec.serialize(scene);
    const result = ExcalidrawMarkdownCodec.parse(serialized);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.scene.files).toEqual(scene.files);
  });

  it("preserves version and source", () => {
    const scene = buildMinimalScene({ version: 3, source: "https://custom.source" });

    const serialized = ExcalidrawMarkdownCodec.serialize(scene);
    const result = ExcalidrawMarkdownCodec.parse(serialized);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.scene.version).toBe(3);
    expect(result.document.scene.source).toBe("https://custom.source");
  });
});
