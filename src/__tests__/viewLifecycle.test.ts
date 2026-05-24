import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createAutosavedScene, type AutosaveState } from "../view/useAutosavedScene";
import type { ExcalidrawElement, BinaryFileData } from "../types";

function buildElements(count: number): readonly ExcalidrawElement[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `el-${i}`,
    type: "rectangle",
  }));
}

const emptyAppState: Record<string, unknown> = {};
const emptyFiles: Record<string, BinaryFileData> = {};

type ViewStatus =
  | { type: "loading" }
  | { type: "ready" }
  | { type: "error"; message: string };

/**
 * Mirrors the onClose logic from ExcalidrawMarkdownView.
 * Using a function prevents TS from narrowing the status literal at the call site.
 */
async function simulateOnClose(
  autosave: AutosaveState | null,
  status: ViewStatus,
  hooks?: {
    afterFlush?: () => void;
    afterDestroy?: () => void;
    afterUnmount?: () => void;
    afterDisconnect?: () => void;
  },
): Promise<void> {
  if (autosave && status.type !== "error") {
    await autosave.flush();
  }
  hooks?.afterFlush?.();
  autosave?.destroy();
  hooks?.afterDestroy?.();
  // In the real view: reactRoot?.unmount(); reactRoot = null;
  hooks?.afterUnmount?.();
  // In the real view: wysiwygObserver?.disconnect(); wysiwygObserver = null;
  hooks?.afterDisconnect?.();
}

/**
 * Tests for ExcalidrawMarkdownView.onClose lifecycle behavior.
 * We test the flush/destroy/cleanup ordering logic directly since the view
 * class requires Obsidian's runtime to instantiate.
 */
describe("onClose flush behavior", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("flush before destroy ordering", () => {
    it("flush is called before destroy when autosave exists and status is not error", async () => {
      const callOrder: string[] = [];
      const writeFn = vi.fn().mockImplementation(async () => {
        callOrder.push("write");
      });
      const autosave = createAutosavedScene(writeFn, 2000);

      autosave.handleSceneChange(buildElements(1), emptyAppState, emptyFiles);

      // Spy on destroy to track ordering
      const originalDestroy = autosave.destroy;
      autosave.destroy = () => {
        callOrder.push("destroy");
        originalDestroy();
      };

      await simulateOnClose(autosave, { type: "ready" });

      expect(callOrder).toEqual(["write", "destroy"]);
    });

    it("flush writes pending dirty state before controller is destroyed", async () => {
      const writeFn = vi.fn().mockResolvedValue(undefined);
      const autosave = createAutosavedScene(writeFn, 2000);

      autosave.handleSceneChange(buildElements(3), { zoom: 1.5 }, emptyFiles);
      expect(autosave.isDirty).toBe(true);

      await simulateOnClose(autosave, { type: "ready" });

      expect(writeFn).toHaveBeenCalledTimes(1);
      expect(autosave.isDirty).toBe(false);
    });
  });

  describe("null safety", () => {
    it("does not throw when autosave is null (already cleaned up)", async () => {
      // Simulate the state after onUnloadFile has already run
      const autosave = createAutosavedScene(vi.fn(), 2000);
      autosave.destroy();

      // onClose fires after onUnloadFile set autosave to null
      await expect(
        simulateOnClose(null, { type: "ready" }),
      ).resolves.toBeUndefined();
    });
  });

  describe("idempotent double-close", () => {
    it("does not throw when onClose is called twice", async () => {
      const writeFn = vi.fn().mockResolvedValue(undefined);
      const autosave = createAutosavedScene(writeFn, 2000);

      autosave.handleSceneChange(buildElements(1), emptyAppState, emptyFiles);

      // First onClose
      await simulateOnClose(autosave, { type: "ready" });

      // Second onClose: autosave would be null in the real view
      await expect(
        simulateOnClose(null, { type: "ready" }),
      ).resolves.toBeUndefined();

      // Write only happened once (from first close)
      expect(writeFn).toHaveBeenCalledTimes(1);
    });
  });

  describe("no duplicate writes from onUnloadFile + onClose", () => {
    it("does not write twice when onUnloadFile flushes then onClose fires", async () => {
      const writeFn = vi.fn().mockResolvedValue(undefined);
      const autosave = createAutosavedScene(writeFn, 2000);

      autosave.handleSceneChange(buildElements(2), emptyAppState, emptyFiles);

      // Simulate onUnloadFile: flush + destroy
      if (autosave.isDirty) {
        await autosave.flush();
      }
      autosave.destroy();

      // Simulate onClose firing after onUnloadFile (autosave is null in view)
      await simulateOnClose(null, { type: "ready" });

      // Only one write from onUnloadFile's flush
      expect(writeFn).toHaveBeenCalledTimes(1);
    });
  });

  describe("error status guard", () => {
    it("does not flush when status is error", async () => {
      const writeFn = vi.fn().mockResolvedValue(undefined);
      const autosave = createAutosavedScene(writeFn, 2000);

      autosave.handleSceneChange(buildElements(1), emptyAppState, emptyFiles);
      expect(autosave.isDirty).toBe(true);

      await simulateOnClose(autosave, { type: "error", message: "parse failed" });

      // Write was never called: dirty state is intentionally discarded
      expect(writeFn).not.toHaveBeenCalled();
    });

    it("still destroys the controller when status is error", async () => {
      const writeFn = vi.fn().mockResolvedValue(undefined);
      const autosave = createAutosavedScene(writeFn, 2000);

      autosave.handleSceneChange(buildElements(1), emptyAppState, emptyFiles);

      await simulateOnClose(autosave, { type: "error", message: "bad data" });

      // After destroy, interval is stopped: advancing timers should not trigger writes
      await vi.advanceTimersByTimeAsync(5000);
      expect(writeFn).not.toHaveBeenCalled();
    });
  });

  describe("flush error routing", () => {
    it("flush errors route through onWriteError, not rejecting the promise", async () => {
      const writeError = new Error("disk full");
      const writeFn = vi.fn().mockRejectedValue(writeError);
      const onWriteError = vi.fn();
      const autosave = createAutosavedScene(writeFn, 2000, { onWriteError });

      autosave.handleSceneChange(buildElements(1), emptyAppState, emptyFiles);

      // flush should not reject: errors go through onWriteError callback
      await expect(autosave.flush()).resolves.toBeUndefined();

      expect(onWriteError).toHaveBeenCalledWith(writeError);

      // Destroy still works after flush error
      autosave.destroy();
    });

    it("destroy and cleanup proceed even after flush error", async () => {
      const writeFn = vi.fn().mockRejectedValue(new Error("IO error"));
      const onWriteError = vi.fn();
      const autosave = createAutosavedScene(writeFn, 2000, { onWriteError });

      autosave.handleSceneChange(buildElements(1), emptyAppState, emptyFiles);

      await simulateOnClose(autosave, { type: "ready" });

      // Verify error was routed and controller is stopped
      expect(onWriteError).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(5000);
      // No additional write attempts after destroy
      expect(writeFn).toHaveBeenCalledTimes(1);
    });
  });

  describe("cleanup ordering: flush → destroy → unmount → disconnect", () => {
    it("follows the correct cleanup order", async () => {
      const callOrder: string[] = [];

      const writeFn = vi.fn().mockImplementation(async () => {
        callOrder.push("flush-write");
      });
      const autosave = createAutosavedScene(writeFn, 2000);

      autosave.handleSceneChange(buildElements(1), emptyAppState, emptyFiles);

      // Wrap destroy to track ordering
      const originalDestroy = autosave.destroy;
      autosave.destroy = () => {
        callOrder.push("destroy");
        originalDestroy();
      };

      await simulateOnClose(autosave, { type: "ready" }, {
        afterUnmount: () => callOrder.push("unmount"),
        afterDisconnect: () => callOrder.push("disconnect"),
      });

      expect(callOrder).toEqual([
        "flush-write",
        "destroy",
        "unmount",
        "disconnect",
      ]);
    });
  });
});
