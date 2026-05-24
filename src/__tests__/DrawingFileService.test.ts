import { describe, it, expect, vi } from "vitest";
import { DrawingFileService } from "../file/DrawingFileService";
import type { ExcalidrawScene } from "../types";

function buildMinimalScene(overrides?: Partial<ExcalidrawScene>): ExcalidrawScene {
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

function buildValidMarkdown(scene?: ExcalidrawScene): string {
  const sceneData = scene ?? buildMinimalScene();
  const json = JSON.stringify(sceneData, null, 2);

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

function createMockVault(content: string) {
  return {
    read: vi.fn().mockResolvedValue(content),
  } as any;
}

function createMockFile(path: string) {
  return { path, basename: path.split("/").pop() } as any;
}

describe("DrawingFileService.readDrawing", () => {
  it("reads file from vault and parses successfully", async () => {
    const scene = buildMinimalScene({
      elements: [
        { id: "rect1", type: "rectangle", x: 0, y: 0, width: 100, height: 50 },
      ],
    });
    const markdown = buildValidMarkdown(scene);
    const vault = createMockVault(markdown);
    const file = createMockFile("excalidraw/Drawing 2026.excalidraw.md");

    const result = await DrawingFileService.readDrawing(file, vault);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.scene.elements).toHaveLength(1);
    expect(result.document.scene.elements[0]!.id).toBe("rect1");
  });

  it("passes the file to vault.read", async () => {
    const vault = createMockVault(buildValidMarkdown());
    const file = createMockFile("excalidraw/test.excalidraw.md");

    await DrawingFileService.readDrawing(file, vault);

    expect(vault.read).toHaveBeenCalledWith(file);
  });

  it("returns parse error for invalid content", async () => {
    const vault = createMockVault("not a valid excalidraw markdown file");
    const file = createMockFile("excalidraw/broken.excalidraw.md");

    const result = await DrawingFileService.readDrawing(file, vault);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("Missing drawing block");
  });

  it("returns parse error for invalid JSON in drawing block", async () => {
    const markdown = [
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
      "{ invalid json !!!",
      "```",
      "%%",
      "",
    ].join("\n");
    const vault = createMockVault(markdown);
    const file = createMockFile("excalidraw/bad-json.excalidraw.md");

    const result = await DrawingFileService.readDrawing(file, vault);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("Invalid JSON");
  });

  it("preserves appState from the parsed document", async () => {
    const scene = buildMinimalScene({
      appState: { zoom: { value: 1.5 }, scrollX: 100, scrollY: 200, theme: "dark" },
    });
    const vault = createMockVault(buildValidMarkdown(scene));
    const file = createMockFile("excalidraw/with-state.excalidraw.md");

    const result = await DrawingFileService.readDrawing(file, vault);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.scene.appState).toEqual({
      zoom: { value: 1.5 },
      scrollX: 100,
      scrollY: 200,
      theme: "dark",
    });
  });

  it("preserves files (images) from the parsed document", async () => {
    const scene = buildMinimalScene({
      files: {
        img1: {
          mimeType: "image/png",
          id: "img1",
          dataURL: "data:image/png;base64,iVBORw0KGgo=",
          created: 1700000000000,
        },
      },
    });
    const vault = createMockVault(buildValidMarkdown(scene));
    const file = createMockFile("excalidraw/with-image.excalidraw.md");

    const result = await DrawingFileService.readDrawing(file, vault);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.scene.files["img1"]).toBeDefined();
    expect(result.document.scene.files["img1"]!.mimeType).toBe("image/png");
  });
});
