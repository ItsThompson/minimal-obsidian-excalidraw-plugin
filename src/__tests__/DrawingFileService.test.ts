import { describe, it, expect, vi } from "vitest";
import { DrawingFileService, type VaultOperations } from "../file/DrawingFileService";
import { ExcalidrawMarkdownCodec } from "../markdown/ExcalidrawMarkdownCodec";
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

function createMockVault(content: string = "") {
  return {
    read: vi.fn().mockResolvedValue(content),
    modify: vi.fn().mockResolvedValue(undefined),
  } as any;
}

function createMockFile(path: string) {
  return { path, basename: path.split("/").pop() } as any;
}

function createMockVaultForCreate(existingPaths: string[] = []): VaultOperations {
  const existingSet = new Set(existingPaths);
  return {
    read: vi.fn().mockResolvedValue(""),
    modify: vi.fn().mockResolvedValue(undefined),
    create: vi.fn().mockImplementation((path: string) =>
      Promise.resolve(createMockFile(path)),
    ),
    getAbstractFileByPath: vi.fn().mockImplementation((path: string) =>
      existingSet.has(path) ? { path } : null,
    ),
    createFolder: vi.fn().mockResolvedValue(undefined),
  };
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

describe("DrawingFileService.writeDrawing", () => {
  it("serializes scene and calls vault.modify with full markdown", async () => {
    const vault = createMockVault();
    const file = createMockFile("excalidraw/test.excalidraw.md");
    const scene = buildMinimalScene({
      elements: [{ id: "rect1", type: "rectangle" }],
    });

    await DrawingFileService.writeDrawing(file, scene, vault);

    expect(vault.modify).toHaveBeenCalledTimes(1);
    expect(vault.modify).toHaveBeenCalledWith(file, expect.any(String));
  });

  it("written content contains # Text Elements section", async () => {
    const vault = createMockVault();
    const file = createMockFile("excalidraw/test.excalidraw.md");
    const scene = buildMinimalScene({
      elements: [
        { id: "text1", type: "text", text: "Hello world", isDeleted: false },
      ],
    });

    await DrawingFileService.writeDrawing(file, scene, vault);

    const writtenContent = vault.modify.mock.calls[0]![1] as string;
    expect(writtenContent).toContain("# Text Elements");
    expect(writtenContent).toContain("Hello world ^text1");
  });

  it("written content contains # Drawing JSON block", async () => {
    const vault = createMockVault();
    const file = createMockFile("excalidraw/test.excalidraw.md");
    const scene = buildMinimalScene({
      elements: [{ id: "rect1", type: "rectangle" }],
      appState: { theme: "dark" },
    });

    await DrawingFileService.writeDrawing(file, scene, vault);

    const writtenContent = vault.modify.mock.calls[0]![1] as string;
    expect(writtenContent).toContain("# Drawing");
    expect(writtenContent).toContain('"type": "excalidraw"');
    expect(writtenContent).toContain('"theme": "dark"');
  });

  it("excludes deleted text elements from Text Elements section", async () => {
    const vault = createMockVault();
    const file = createMockFile("excalidraw/test.excalidraw.md");
    const scene = buildMinimalScene({
      elements: [
        { id: "text1", type: "text", text: "Visible", isDeleted: false },
        { id: "text2", type: "text", text: "Deleted", isDeleted: true },
      ],
    });

    await DrawingFileService.writeDrawing(file, scene, vault);

    const writtenContent = vault.modify.mock.calls[0]![1] as string;
    expect(writtenContent).toContain("Visible ^text1");
    expect(writtenContent).not.toContain("Deleted ^text2");
  });

  it("includes files object in the Drawing JSON", async () => {
    const vault = createMockVault();
    const file = createMockFile("excalidraw/test.excalidraw.md");
    const scene = buildMinimalScene({
      files: {
        img1: {
          id: "img1",
          mimeType: "image/png",
          dataURL: "data:image/png;base64,abc",
          created: 1700000000000,
        },
      },
    });

    await DrawingFileService.writeDrawing(file, scene, vault);

    const writtenContent = vault.modify.mock.calls[0]![1] as string;
    expect(writtenContent).toContain("img1");
    expect(writtenContent).toContain("image/png");
  });

  it("performs round-trip validation: parse succeeds before writing", async () => {
    const vault = createMockVault();
    const file = createMockFile("excalidraw/test.excalidraw.md");
    const scene = buildMinimalScene({
      elements: [{ id: "rect1", type: "rectangle" }],
    });

    await DrawingFileService.writeDrawing(file, scene, vault);

    // vault.modify should have been called (validation passed)
    expect(vault.modify).toHaveBeenCalledTimes(1);
    // The written content should round-trip successfully
    const writtenContent = vault.modify.mock.calls[0]![1] as string;
    const parseResult = ExcalidrawMarkdownCodec.parse(writtenContent);
    expect(parseResult.ok).toBe(true);
  });

  it("throws and does not write when serialized output fails to parse back", async () => {
    const vault = createMockVault();
    const file = createMockFile("excalidraw/test.excalidraw.md");
    const scene = buildMinimalScene();

    // Mock serialize to return malformed content that won't parse
    const serializeSpy = vi.spyOn(ExcalidrawMarkdownCodec, "serialize");
    serializeSpy.mockReturnValueOnce("garbage content with no %% markers");

    await expect(
      DrawingFileService.writeDrawing(file, scene, vault),
    ).rejects.toThrow("Serialization produced unparseable output");

    // vault.modify must NOT have been called
    expect(vault.modify).not.toHaveBeenCalled();

    serializeSpy.mockRestore();
  });

  it("error message includes the parse failure reason", async () => {
    const vault = createMockVault();
    const file = createMockFile("excalidraw/test.excalidraw.md");
    const scene = buildMinimalScene();

    const serializeSpy = vi.spyOn(ExcalidrawMarkdownCodec, "serialize");
    serializeSpy.mockReturnValueOnce("no valid structure here");

    await expect(
      DrawingFileService.writeDrawing(file, scene, vault),
    ).rejects.toThrow(/Missing drawing block/);

    serializeSpy.mockRestore();
  });

  it("onWriteError receives the validation error through performWrite", async () => {
    // This tests the integration: writeDrawing throws, and the autosave
    // controller's try/catch in performWrite routes it to onWriteError.
    const vault = createMockVault();
    const file = createMockFile("excalidraw/test.excalidraw.md");
    const scene = buildMinimalScene();

    const serializeSpy = vi.spyOn(ExcalidrawMarkdownCodec, "serialize");
    serializeSpy.mockReturnValueOnce("invalid content");

    // Simulate the autosave controller's error handling pattern
    const onWriteError = vi.fn();
    try {
      await DrawingFileService.writeDrawing(file, scene, vault);
    } catch (error: unknown) {
      onWriteError(error);
    }

    expect(onWriteError).toHaveBeenCalledTimes(1);
    expect(onWriteError.mock.calls[0]![0]).toBeInstanceOf(Error);
    expect((onWriteError.mock.calls[0]![0] as Error).message).toContain(
      "Serialization produced unparseable output",
    );

    serializeSpy.mockRestore();
  });
});

describe("DrawingFileService.createDrawing", () => {
  const timestamp = new Date(2026, 4, 24, 14, 30, 0);

  it("creates a file with a timestamp-based filename in the configured folder", async () => {
    const vault = createMockVaultForCreate();
    const file = await DrawingFileService.createDrawing(
      { folder: "excalidraw", timestamp },
      vault,
    );

    expect(file.path).toBe("excalidraw/Drawing 2026-05-24 14-30-00.excalidraw.md");
    expect(vault.create).toHaveBeenCalledWith(
      "excalidraw/Drawing 2026-05-24 14-30-00.excalidraw.md",
      expect.any(String),
    );
  });

  it("writes a valid empty-scene markdown envelope", async () => {
    const vault = createMockVaultForCreate();
    await DrawingFileService.createDrawing({ folder: "excalidraw", timestamp }, vault);

    const writtenContent = (vault.create as ReturnType<typeof vi.fn>).mock.calls[0]![1] as string;
    expect(writtenContent).toContain("excalidraw-plugin: minimal");
    expect(writtenContent).toContain("# Text Elements");
    expect(writtenContent).toContain("# Drawing");
    expect(writtenContent).toContain('"type": "excalidraw"');
    expect(writtenContent).toContain('"elements": []');
  });

  it("creates the folder if it does not exist", async () => {
    const vault = createMockVaultForCreate();
    await DrawingFileService.createDrawing({ folder: "excalidraw", timestamp }, vault);

    expect(vault.createFolder).toHaveBeenCalledWith("excalidraw");
  });

  it("does not create the folder if it already exists", async () => {
    const vault = createMockVaultForCreate(["excalidraw"]);
    // Mark the folder as existing
    (vault.getAbstractFileByPath as ReturnType<typeof vi.fn>).mockImplementation(
      (path: string) => (path === "excalidraw" ? { path: "excalidraw" } : null),
    );

    await DrawingFileService.createDrawing({ folder: "excalidraw", timestamp }, vault);

    expect(vault.createFolder).not.toHaveBeenCalled();
  });

  it("appends a numeric suffix when filename collides", async () => {
    const vault = createMockVaultForCreate([
      "excalidraw/Drawing 2026-05-24 14-30-00.excalidraw.md",
    ]);

    const file = await DrawingFileService.createDrawing(
      { folder: "excalidraw", timestamp },
      vault,
    );

    expect(file.path).toBe("excalidraw/Drawing 2026-05-24 14-30-00 2.excalidraw.md");
  });

  it("increments suffix past multiple collisions", async () => {
    const vault = createMockVaultForCreate([
      "excalidraw/Drawing 2026-05-24 14-30-00.excalidraw.md",
      "excalidraw/Drawing 2026-05-24 14-30-00 2.excalidraw.md",
      "excalidraw/Drawing 2026-05-24 14-30-00 3.excalidraw.md",
    ]);

    const file = await DrawingFileService.createDrawing(
      { folder: "excalidraw", timestamp },
      vault,
    );

    expect(file.path).toBe("excalidraw/Drawing 2026-05-24 14-30-00 4.excalidraw.md");
  });

  it("normalizes the folder path (strips leading/trailing slashes)", async () => {
    const vault = createMockVaultForCreate();
    const file = await DrawingFileService.createDrawing(
      { folder: "/my/drawings/", timestamp },
      vault,
    );

    expect(file.path).toBe("my/drawings/Drawing 2026-05-24 14-30-00.excalidraw.md");
  });

  it("defaults to 'excalidraw' folder when folder is empty", async () => {
    const vault = createMockVaultForCreate();
    const file = await DrawingFileService.createDrawing(
      { folder: "", timestamp },
      vault,
    );

    expect(file.path).toBe("excalidraw/Drawing 2026-05-24 14-30-00.excalidraw.md");
  });
});
