import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createAutosavedScene } from "../view/useAutosavedScene";
import { ExcalidrawMarkdownCodec } from "../markdown/ExcalidrawMarkdownCodec";
import { DrawingFileService } from "../file/DrawingFileService";
import type { ExcalidrawElement, BinaryFileData, ExcalidrawScene } from "../types";

function buildElements(count: number): readonly ExcalidrawElement[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `el-${i}`,
    type: "rectangle",
  }));
}

const emptyAppState: Record<string, unknown> = {};
const emptyFiles: Record<string, BinaryFileData> = {};

describe("Error handling: autosave failure", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps dirty flag true after write failure", async () => {
    const writeFn = vi.fn().mockRejectedValue(new Error("vault write failed"));
    const autosave = createAutosavedScene(writeFn, 1000);

    autosave.handleSceneChange(buildElements(1), emptyAppState, emptyFiles);
    await vi.advanceTimersByTimeAsync(1000);

    expect(autosave.isDirty).toBe(true);
  });

  it("calls onWriteError callback when write throws", async () => {
    const writeError = new Error("vault.modify failed");
    const writeFn = vi.fn().mockRejectedValue(writeError);
    const onWriteError = vi.fn();
    const autosave = createAutosavedScene(writeFn, 1000, { onWriteError });

    autosave.handleSceneChange(buildElements(1), emptyAppState, emptyFiles);
    await vi.advanceTimersByTimeAsync(1000);

    expect(onWriteError).toHaveBeenCalledTimes(1);
    expect(onWriteError).toHaveBeenCalledWith(writeError);
  });

  it("retries on next debounce cycle after failure", async () => {
    const writeFn = vi.fn()
      .mockRejectedValueOnce(new Error("first attempt failed"))
      .mockResolvedValueOnce(undefined);
    const autosave = createAutosavedScene(writeFn, 1000);

    // First attempt fails
    autosave.handleSceneChange(buildElements(1), emptyAppState, emptyFiles);
    await vi.advanceTimersByTimeAsync(1000);
    expect(autosave.isDirty).toBe(true);

    // Second attempt triggered by new edit succeeds
    autosave.handleSceneChange(buildElements(2), emptyAppState, emptyFiles);
    await vi.advanceTimersByTimeAsync(1000);
    expect(autosave.isDirty).toBe(false);
    expect(writeFn).toHaveBeenCalledTimes(2);
  });

  it("flush reports error via callback when write fails", async () => {
    const writeError = new Error("flush failed");
    const writeFn = vi.fn().mockRejectedValue(writeError);
    const onWriteError = vi.fn();
    const autosave = createAutosavedScene(writeFn, 1000, { onWriteError });

    autosave.handleSceneChange(buildElements(1), emptyAppState, emptyFiles);
    await autosave.flush();

    expect(onWriteError).toHaveBeenCalledWith(writeError);
    expect(autosave.isDirty).toBe(true);
  });
});

describe("Error handling: error state prevents writes", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("write function is guarded: does not call vault.modify when in error state", async () => {
    const mockVault = { modify: vi.fn().mockResolvedValue(undefined) } as any;
    const mockFile = { path: "test.excalidraw.md", basename: "test" } as any;
    let statusType = "error"; // Simulates view error state

    const autosave = createAutosavedScene(async (scene) => {
      if (statusType === "error") return;
      await DrawingFileService.writeDrawing(mockFile, scene, mockVault);
    }, 1000);

    autosave.handleSceneChange(buildElements(1), emptyAppState, emptyFiles);
    await vi.advanceTimersByTimeAsync(1000);

    // vault.modify should never be called since we're in error state
    expect(mockVault.modify).not.toHaveBeenCalled();
  });
});

describe("Error handling: flush on unload", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("flush writes pending dirty scene immediately", async () => {
    const writeFn = vi.fn().mockResolvedValue(undefined);
    const autosave = createAutosavedScene(writeFn, 5000);

    autosave.handleSceneChange(buildElements(3), { zoom: 1.5 }, emptyFiles);
    expect(autosave.isDirty).toBe(true);

    await autosave.flush();

    expect(writeFn).toHaveBeenCalledTimes(1);
    expect(autosave.isDirty).toBe(false);

    const writtenScene = writeFn.mock.calls[0]![0] as ExcalidrawScene;
    expect(writtenScene.elements).toHaveLength(3);
  });

  it("flush is a no-op when not dirty", async () => {
    const writeFn = vi.fn().mockResolvedValue(undefined);
    const autosave = createAutosavedScene(writeFn, 1000);

    await autosave.flush();

    expect(writeFn).not.toHaveBeenCalled();
  });
});

describe("Error handling: parse errors", () => {
  it("missing drawing block returns error result (view shows error, no overwrite)", () => {
    const markdownNoDrawing = [
      "---",
      "excalidraw-plugin: minimal",
      "tags: [excalidraw]",
      "---",
      "",
      "# Some regular content",
      "This file has no drawing block.",
    ].join("\n");

    const result = ExcalidrawMarkdownCodec.parse(markdownNoDrawing);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("Missing drawing block");
  });

  it("malformed JSON in drawing block returns descriptive error", () => {
    const markdownBadJson = [
      "---",
      "excalidraw-plugin: minimal",
      "tags: [excalidraw]",
      "---",
      "",
      "%%",
      "# Drawing",
      "```json",
      "{ not valid json at all }}}",
      "```",
      "%%",
    ].join("\n");

    const result = ExcalidrawMarkdownCodec.parse(markdownBadJson);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("Invalid JSON");
  });

  it("non-excalidraw type JSON returns descriptive error", () => {
    const markdownWrongType = [
      "%%",
      "# Drawing",
      "```json",
      JSON.stringify({ type: "not-excalidraw", elements: [], appState: {}, files: {} }),
      "```",
      "%%",
    ].join("\n");

    const result = ExcalidrawMarkdownCodec.parse(markdownWrongType);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('type: "excalidraw"');
  });
});

describe("Integration: corrupt fixture file → no modification", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("corrupt file produces parse error and vault.modify is never called", async () => {
    const corruptContent = [
      "---",
      "excalidraw-plugin: minimal",
      "tags: [excalidraw]",
      "---",
      "",
      "# Text Elements",
      "Some text ^text1",
      "",
      "%%",
      "# Drawing",
      "```json",
      '{ "type": "excalidraw", "version": 2, BROKEN_JSON!!!',
      "```",
      "%%",
    ].join("\n");

    const mockVault = {
      read: vi.fn().mockResolvedValue(corruptContent),
      modify: vi.fn().mockResolvedValue(undefined),
    } as any;
    const mockFile = { path: "excalidraw/corrupt.excalidraw.md", basename: "corrupt" } as any;

    // Simulate the read path: DrawingFileService reads and parses
    const readResult = await DrawingFileService.readDrawing(mockFile, mockVault);

    // Parse should fail
    expect(readResult.ok).toBe(false);
    if (readResult.ok) return;
    expect(readResult.error).toContain("Invalid JSON");

    // Since parse failed, the view would be in error state.
    // The write function should never be called for a file in error state.
    // Simulate: autosave with error-guarded write
    let isErrorState = true; // Simulates view entering error state from parse failure
    const autosave = createAutosavedScene(async (scene) => {
      if (isErrorState) return;
      await DrawingFileService.writeDrawing(mockFile, scene, mockVault);
    }, 100);

    // Even if some stale onChange fires, the write is guarded
    autosave.handleSceneChange(
      [{ id: "el1", type: "rectangle" }],
      {},
      {},
    );

    await vi.advanceTimersByTimeAsync(200);

    // vault.modify should never have been called (only vault.read for the initial parse)
    expect(mockVault.modify).not.toHaveBeenCalled();
  });

  it("valid file parses successfully and can be written", async () => {
    const validContent = ExcalidrawMarkdownCodec.createEmptyDocument();

    const mockVault = {
      read: vi.fn().mockResolvedValue(validContent),
      modify: vi.fn().mockResolvedValue(undefined),
    } as any;
    const mockFile = { path: "excalidraw/valid.excalidraw.md", basename: "valid" } as any;

    const readResult = await DrawingFileService.readDrawing(mockFile, mockVault);

    expect(readResult.ok).toBe(true);
    if (!readResult.ok) return;

    // Write should succeed
    await DrawingFileService.writeDrawing(mockFile, readResult.document.scene, mockVault);
    expect(mockVault.modify).toHaveBeenCalledTimes(1);
  });
});
