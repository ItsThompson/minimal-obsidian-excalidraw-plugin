import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createAutosavedScene } from "../view/useAutosavedScene";
import type { ExcalidrawScene, ExcalidrawElement, BinaryFileData } from "../types";

function buildElements(count: number): readonly ExcalidrawElement[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `el-${i}`,
    type: "rectangle",
  }));
}

const emptyAppState: Record<string, unknown> = {};
const emptyFiles: Record<string, BinaryFileData> = {};

describe("createAutosavedScene", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts not dirty", () => {
    const writeFn = vi.fn().mockResolvedValue(undefined);
    const autosave = createAutosavedScene(writeFn);

    expect(autosave.isDirty).toBe(false);
  });

  it("marks dirty after handleSceneChange", () => {
    const writeFn = vi.fn().mockResolvedValue(undefined);
    const autosave = createAutosavedScene(writeFn);

    autosave.handleSceneChange(buildElements(1), emptyAppState, emptyFiles);

    expect(autosave.isDirty).toBe(true);
  });

  it("does not write immediately on change", () => {
    const writeFn = vi.fn().mockResolvedValue(undefined);
    const autosave = createAutosavedScene(writeFn, 1000);

    autosave.handleSceneChange(buildElements(1), emptyAppState, emptyFiles);

    expect(writeFn).not.toHaveBeenCalled();
  });

  it("writes once after debounce timer fires", async () => {
    const writeFn = vi.fn().mockResolvedValue(undefined);
    const autosave = createAutosavedScene(writeFn, 1000);

    autosave.handleSceneChange(buildElements(1), emptyAppState, emptyFiles);
    await vi.advanceTimersByTimeAsync(1000);

    expect(writeFn).toHaveBeenCalledTimes(1);
  });

  it("rapid changes within debounce window result in exactly one write", async () => {
    const writeFn = vi.fn().mockResolvedValue(undefined);
    const autosave = createAutosavedScene(writeFn, 1000);

    autosave.handleSceneChange(buildElements(1), emptyAppState, emptyFiles);
    await vi.advanceTimersByTimeAsync(300);
    autosave.handleSceneChange(buildElements(2), emptyAppState, emptyFiles);
    await vi.advanceTimersByTimeAsync(300);
    autosave.handleSceneChange(buildElements(3), emptyAppState, emptyFiles);
    await vi.advanceTimersByTimeAsync(1000);

    expect(writeFn).toHaveBeenCalledTimes(1);
  });

  it("writes the latest scene state, not an intermediate one", async () => {
    const writeFn = vi.fn().mockResolvedValue(undefined);
    const autosave = createAutosavedScene(writeFn, 1000);

    autosave.handleSceneChange(buildElements(1), emptyAppState, emptyFiles);
    autosave.handleSceneChange(buildElements(2), emptyAppState, emptyFiles);
    autosave.handleSceneChange(buildElements(5), { zoom: 2 }, emptyFiles);
    await vi.advanceTimersByTimeAsync(1000);

    const writtenScene = writeFn.mock.calls[0]![0] as ExcalidrawScene;
    expect(writtenScene.elements).toHaveLength(5);
    expect(writtenScene.appState).toEqual({ zoom: 2 });
  });

  it("clears dirty flag after successful write", async () => {
    const writeFn = vi.fn().mockResolvedValue(undefined);
    const autosave = createAutosavedScene(writeFn, 1000);

    autosave.handleSceneChange(buildElements(1), emptyAppState, emptyFiles);
    expect(autosave.isDirty).toBe(true);

    await vi.advanceTimersByTimeAsync(1000);

    expect(autosave.isDirty).toBe(false);
  });

  it("keeps dirty flag when write fails", async () => {
    const writeFn = vi.fn().mockRejectedValue(new Error("write failed"));
    const autosave = createAutosavedScene(writeFn, 1000);

    autosave.handleSceneChange(buildElements(1), emptyAppState, emptyFiles);
    await vi.advanceTimersByTimeAsync(1000);

    expect(autosave.isDirty).toBe(true);
  });

  it("flush writes immediately without waiting for timer", async () => {
    const writeFn = vi.fn().mockResolvedValue(undefined);
    const autosave = createAutosavedScene(writeFn, 5000);

    autosave.handleSceneChange(buildElements(1), emptyAppState, emptyFiles);
    await autosave.flush();

    expect(writeFn).toHaveBeenCalledTimes(1);
    expect(autosave.isDirty).toBe(false);
  });

  it("flush cancels pending timer", async () => {
    const writeFn = vi.fn().mockResolvedValue(undefined);
    const autosave = createAutosavedScene(writeFn, 1000);

    autosave.handleSceneChange(buildElements(1), emptyAppState, emptyFiles);
    await autosave.flush();
    await vi.advanceTimersByTimeAsync(1000);

    // Should only have been called once from flush, not again from timer
    expect(writeFn).toHaveBeenCalledTimes(1);
  });

  it("flush is a no-op when not dirty", async () => {
    const writeFn = vi.fn().mockResolvedValue(undefined);
    const autosave = createAutosavedScene(writeFn, 1000);

    await autosave.flush();

    expect(writeFn).not.toHaveBeenCalled();
  });

  it("does not clear dirty if scene changed during write", async () => {
    let resolveWrite: () => void;
    const writeFn = vi.fn().mockImplementation(
      () => new Promise<void>((resolve) => { resolveWrite = resolve; }),
    );
    const autosave = createAutosavedScene(writeFn, 1000);

    autosave.handleSceneChange(buildElements(1), emptyAppState, emptyFiles);
    await vi.advanceTimersByTimeAsync(1000);

    // New change arrives while write is in flight
    autosave.handleSceneChange(buildElements(2), emptyAppState, emptyFiles);

    // Now the first write completes
    resolveWrite!();
    await vi.advanceTimersByTimeAsync(0);

    // Should remain dirty because a new scene arrived after the write started
    expect(autosave.isDirty).toBe(true);
  });

  it("constructs a valid ExcalidrawScene for the write function", async () => {
    const writeFn = vi.fn().mockResolvedValue(undefined);
    const autosave = createAutosavedScene(writeFn, 1000);

    const elements: readonly ExcalidrawElement[] = [
      { id: "text1", type: "text", text: "Hello", isDeleted: false },
    ];
    const appState = { theme: "dark" };
    const files: Record<string, BinaryFileData> = {
      img1: { id: "img1", mimeType: "image/png", dataURL: "data:...", created: 1 },
    };

    autosave.handleSceneChange(elements, appState, files);
    await vi.advanceTimersByTimeAsync(1000);

    const scene = writeFn.mock.calls[0]![0] as ExcalidrawScene;
    expect(scene.type).toBe("excalidraw");
    expect(scene.version).toBe(2);
    expect(scene.source).toBe("https://excalidraw.com");
    expect(scene.elements).toEqual(elements);
    expect(scene.appState).toEqual(appState);
    expect(scene.files).toEqual(files);
  });

  it("second debounce cycle works after first completes", async () => {
    const writeFn = vi.fn().mockResolvedValue(undefined);
    const autosave = createAutosavedScene(writeFn, 1000);

    // First cycle
    autosave.handleSceneChange(buildElements(1), emptyAppState, emptyFiles);
    await vi.advanceTimersByTimeAsync(1000);
    expect(writeFn).toHaveBeenCalledTimes(1);
    expect(autosave.isDirty).toBe(false);

    // Second cycle
    autosave.handleSceneChange(buildElements(2), emptyAppState, emptyFiles);
    expect(autosave.isDirty).toBe(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(writeFn).toHaveBeenCalledTimes(2);
    expect(autosave.isDirty).toBe(false);
  });
});
