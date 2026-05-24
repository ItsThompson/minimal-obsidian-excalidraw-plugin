import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createAutosavedScene } from "../view/useAutosavedScene";
import { DrawingFileService } from "../file/DrawingFileService";
import { ExcalidrawMarkdownCodec } from "../markdown/ExcalidrawMarkdownCodec";
import type { ExcalidrawElement, BinaryFileData } from "../types";

/**
 * Integration tests verifying the full autosave pipeline:
 * onChange → dirty → debounce → codec serialize → vault write → text projection
 */
describe("Autosave integration", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function createMockVault() {
    return {
      read: vi.fn().mockResolvedValue(""),
      modify: vi.fn().mockResolvedValue(undefined),
    } as any;
  }

  function createMockFile(path: string) {
    return { path, basename: path.split("/").pop() } as any;
  }

  it("adding text to the canvas results in that text appearing in # Text Elements after autosave", async () => {
    const vault = createMockVault();
    const file = createMockFile("excalidraw/test.excalidraw.md");

    const autosave = createAutosavedScene(
      async (scene) => {
        await DrawingFileService.writeDrawing(file, scene, vault);
      },
      1000,
    );

    const elements: readonly ExcalidrawElement[] = [
      { id: "text1", type: "text", text: "Hello Excalidraw", isDeleted: false },
      { id: "rect1", type: "rectangle" },
    ];

    autosave.handleSceneChange(elements, {}, {});
    await vi.advanceTimersByTimeAsync(1000);

    expect(vault.modify).toHaveBeenCalledTimes(1);
    const writtenContent = vault.modify.mock.calls[0]![1] as string;
    expect(writtenContent).toContain("# Text Elements");
    expect(writtenContent).toContain("Hello Excalidraw ^text1");
  });

  it("deleting a text element and saving removes that text from # Text Elements", async () => {
    const vault = createMockVault();
    const file = createMockFile("excalidraw/test.excalidraw.md");

    const autosave = createAutosavedScene(
      async (scene) => {
        await DrawingFileService.writeDrawing(file, scene, vault);
      },
      1000,
    );

    // First save with text present
    const elementsWithText: readonly ExcalidrawElement[] = [
      { id: "text1", type: "text", text: "Keep me", isDeleted: false },
      { id: "text2", type: "text", text: "Delete me", isDeleted: false },
    ];
    autosave.handleSceneChange(elementsWithText, {}, {});
    await vi.advanceTimersByTimeAsync(1000);

    const firstContent = vault.modify.mock.calls[0]![1] as string;
    expect(firstContent).toContain("Keep me ^text1");
    expect(firstContent).toContain("Delete me ^text2");

    // Second save: text2 marked as deleted
    const elementsAfterDelete: readonly ExcalidrawElement[] = [
      { id: "text1", type: "text", text: "Keep me", isDeleted: false },
      { id: "text2", type: "text", text: "Delete me", isDeleted: true },
    ];
    autosave.handleSceneChange(elementsAfterDelete, {}, {});
    await vi.advanceTimersByTimeAsync(1000);

    const secondContent = vault.modify.mock.calls[1]![1] as string;
    expect(secondContent).toContain("Keep me ^text1");
    expect(secondContent).not.toContain("Delete me ^text2");
  });

  it("written file contains updated Drawing JSON with current elements, appState, and files", async () => {
    const vault = createMockVault();
    const file = createMockFile("excalidraw/test.excalidraw.md");

    const autosave = createAutosavedScene(
      async (scene) => {
        await DrawingFileService.writeDrawing(file, scene, vault);
      },
      1000,
    );

    const elements: readonly ExcalidrawElement[] = [
      { id: "rect1", type: "rectangle", x: 10, y: 20, width: 100, height: 50 },
    ];
    const appState = { theme: "dark", zoom: { value: 1.5 } };
    const files: Record<string, BinaryFileData> = {
      img1: { id: "img1", mimeType: "image/png", dataURL: "data:image/png;base64,abc", created: 1 },
    };

    autosave.handleSceneChange(elements, appState, files);
    await vi.advanceTimersByTimeAsync(1000);

    const writtenContent = vault.modify.mock.calls[0]![1] as string;

    // Verify it can be parsed back
    const parseResult = ExcalidrawMarkdownCodec.parse(writtenContent);
    expect(parseResult.ok).toBe(true);
    if (!parseResult.ok) return;

    expect(parseResult.document.scene.elements).toHaveLength(1);
    expect(parseResult.document.scene.elements[0]!.id).toBe("rect1");
    expect(parseResult.document.scene.appState).toEqual(appState);
    expect(parseResult.document.scene.files["img1"]).toBeDefined();
    expect(parseResult.document.scene.files["img1"]!.mimeType).toBe("image/png");
  });

  it("rapid changes coalesce into one write with final state", async () => {
    const vault = createMockVault();
    const file = createMockFile("excalidraw/test.excalidraw.md");

    const autosave = createAutosavedScene(
      async (scene) => {
        await DrawingFileService.writeDrawing(file, scene, vault);
      },
      1000,
    );

    // Simulate rapid typing: multiple text updates
    autosave.handleSceneChange(
      [{ id: "text1", type: "text", text: "H", isDeleted: false }],
      {},
      {},
    );
    autosave.handleSceneChange(
      [{ id: "text1", type: "text", text: "He", isDeleted: false }],
      {},
      {},
    );
    autosave.handleSceneChange(
      [{ id: "text1", type: "text", text: "Hel", isDeleted: false }],
      {},
      {},
    );
    autosave.handleSceneChange(
      [{ id: "text1", type: "text", text: "Hello", isDeleted: false }],
      {},
      {},
    );

    await vi.advanceTimersByTimeAsync(1000);

    // Only one write
    expect(vault.modify).toHaveBeenCalledTimes(1);

    // Written content has the final text
    const writtenContent = vault.modify.mock.calls[0]![1] as string;
    expect(writtenContent).toContain("Hello ^text1");
    expect(writtenContent).not.toContain("Hel ^text1");
  });

  it("written file round-trips through codec parse", async () => {
    const vault = createMockVault();
    const file = createMockFile("excalidraw/test.excalidraw.md");

    const autosave = createAutosavedScene(
      async (scene) => {
        await DrawingFileService.writeDrawing(file, scene, vault);
      },
      1000,
    );

    const elements: readonly ExcalidrawElement[] = [
      { id: "text1", type: "text", text: "Note 1", isDeleted: false },
      { id: "text2", type: "text", text: "Note 2\nLine 2", isDeleted: false },
      { id: "arrow1", type: "arrow" },
    ];

    autosave.handleSceneChange(elements, { scrollX: 50 }, {});
    await vi.advanceTimersByTimeAsync(1000);

    const writtenContent = vault.modify.mock.calls[0]![1] as string;
    const parseResult = ExcalidrawMarkdownCodec.parse(writtenContent);

    expect(parseResult.ok).toBe(true);
    if (!parseResult.ok) return;

    expect(parseResult.document.scene.elements).toHaveLength(3);
    expect(parseResult.document.textProjection).toHaveLength(2);
    expect(parseResult.document.textProjection[0]!.text).toBe("Note 1");
    expect(parseResult.document.textProjection[0]!.elementId).toBe("text1");
  });
});
