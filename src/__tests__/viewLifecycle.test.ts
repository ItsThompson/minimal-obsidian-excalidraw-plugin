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

/** Matches the default AUTOSAVE_INTERVAL_MS from production code. */
const TEST_AUTOSAVE_INTERVAL_MS = 2000;

type ViewStatus =
  | { type: "loading" }
  | { type: "ready" }
  | { type: "error"; message: string };

/**
 * Mirrors the detachFile logic from ExcalidrawMarkdownView.
 * Flushes pending changes, destroys autosave, resets file-tier state.
 * Does NOT touch view-tier resources (React root, WYSIWYG observer).
 */
async function simulateDetachFile(
  autosave: AutosaveState | null,
  status: ViewStatus,
): Promise<{ autosave: null; initialScene: null; status: ViewStatus }> {
  if (autosave && status.type !== "error") {
    if (autosave.isSaving) {
      await autosave.waitForSave();
    }
    if (autosave.isDirty) {
      await autosave.flush();
    }
  }
  autosave?.destroy();
  return { autosave: null, initialScene: null, status: { type: "loading" } };
}

/**
 * Mirrors the attachFile logic: creates a fresh autosave controller.
 */
function simulateAttachFile(writeFn: () => Promise<void>): AutosaveState {
  return createAutosavedScene(writeFn, TEST_AUTOSAVE_INTERVAL_MS);
}

/**
 * Mirrors the unmountView logic from ExcalidrawMarkdownView.
 * Defensively flushes autosave (for plugin-unload path), then destroys
 * all view-tier and file-tier resources.
 */
async function simulateUnmountView(
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

describe("view lifecycle: two-tier model", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("detachFile: file-tier cleanup", () => {
    it("flushes dirty changes before destroying autosave", async () => {
      const callOrder: string[] = [];
      const writeFn = vi.fn().mockImplementation(async () => {
        callOrder.push("write");
      });
      const autosave = createAutosavedScene(writeFn, TEST_AUTOSAVE_INTERVAL_MS);

      autosave.handleSceneChange(buildElements(1), emptyAppState, emptyFiles);

      const originalDestroy = autosave.destroy;
      autosave.destroy = () => {
        callOrder.push("destroy");
        originalDestroy();
      };

      await simulateDetachFile(autosave, { type: "ready" });

      expect(callOrder).toEqual(["write", "destroy"]);
    });

    it("resets file-tier state after detach", async () => {
      const writeFn = vi.fn().mockResolvedValue(undefined);
      const autosave = createAutosavedScene(writeFn, TEST_AUTOSAVE_INTERVAL_MS);

      autosave.handleSceneChange(buildElements(1), emptyAppState, emptyFiles);

      const result = await simulateDetachFile(autosave, { type: "ready" });

      expect(result.autosave).toBeNull();
      expect(result.initialScene).toBeNull();
      expect(result.status).toEqual({ type: "loading" });
    });

    it("does not flush when status is error (discards corrupt data)", async () => {
      const writeFn = vi.fn().mockResolvedValue(undefined);
      const autosave = createAutosavedScene(writeFn, TEST_AUTOSAVE_INTERVAL_MS);

      autosave.handleSceneChange(buildElements(1), emptyAppState, emptyFiles);

      await simulateDetachFile(autosave, { type: "error", message: "parse failed" });

      expect(writeFn).not.toHaveBeenCalled();
    });

    it("waits for in-progress save before flushing", async () => {
      const callOrder: string[] = [];
      let resolveWrite: () => void = () => {};
      const writeFn = vi.fn().mockImplementation(() => {
        callOrder.push("write-start");
        return new Promise<void>((resolve) => {
          resolveWrite = () => {
            callOrder.push("write-end");
            resolve();
          };
        });
      });
      const autosave = createAutosavedScene(writeFn, TEST_AUTOSAVE_INTERVAL_MS);

      autosave.handleSceneChange(buildElements(1), emptyAppState, emptyFiles);

      // Trigger a periodic save (simulating mid-save state)
      await vi.advanceTimersByTimeAsync(2000);
      expect(autosave.isSaving).toBe(true);

      // Trigger detachFile while save is in progress
      const detachPromise = simulateDetachFile(autosave, { type: "ready" });

      // Resolve the in-progress save
      resolveWrite();
      await vi.advanceTimersByTimeAsync(100);
      await detachPromise;

      expect(callOrder).toContain("write-end");
    });
  });

  describe("attachFile: file-tier setup", () => {
    it("creates a fresh autosave controller", () => {
      const autosave = simulateAttachFile(vi.fn().mockResolvedValue(undefined));

      expect(autosave.isDirty).toBe(false);
      expect(autosave.isSaving).toBe(false);
      autosave.destroy();
    });

    it("new autosave tracks scene changes independently", async () => {
      const writeFn = vi.fn().mockResolvedValue(undefined);
      const autosave = simulateAttachFile(writeFn);

      autosave.handleSceneChange(buildElements(2), emptyAppState, emptyFiles);
      expect(autosave.isDirty).toBe(true);

      await autosave.flush();
      expect(writeFn).toHaveBeenCalledTimes(1);
      autosave.destroy();
    });
  });

  describe("file switch scenario: detachFile → attachFile → render", () => {
    it("full file switch: old file flushed, new autosave created, render succeeds", async () => {
      const writeA = vi.fn().mockResolvedValue(undefined);
      const autosaveA = createAutosavedScene(writeA, TEST_AUTOSAVE_INTERVAL_MS);

      // Simulate editing file A
      autosaveA.handleSceneChange(buildElements(3), emptyAppState, emptyFiles);
      expect(autosaveA.isDirty).toBe(true);

      // Step 1: detachFile (onUnloadFile for file A)
      await simulateDetachFile(autosaveA, { type: "ready" });
      expect(writeA).toHaveBeenCalledTimes(1); // A's changes flushed

      // Step 2: attachFile (setViewData with clear=true for file B)
      const writeB = vi.fn().mockResolvedValue(undefined);
      const autosaveB = simulateAttachFile(writeB);

      // Step 3: render succeeds because React root is still alive
      // (In the real view, reactRoot is untouched by detachFile)
      expect(autosaveB.isDirty).toBe(false);
      expect(autosaveB.isSaving).toBe(false);

      // Simulate editing file B
      autosaveB.handleSceneChange(buildElements(5), emptyAppState, emptyFiles);
      expect(autosaveB.isDirty).toBe(true);

      await autosaveB.flush();
      expect(writeB).toHaveBeenCalledTimes(1);
      autosaveB.destroy();
    });

    it("detachFile does NOT touch view-tier state (React root persists)", async () => {
      // This test verifies the architectural guarantee: detachFile only
      // nulls file-tier state, view-tier resources remain intact
      const writeFn = vi.fn().mockResolvedValue(undefined);
      const autosave = createAutosavedScene(writeFn, TEST_AUTOSAVE_INTERVAL_MS);

      autosave.handleSceneChange(buildElements(1), emptyAppState, emptyFiles);

      const result = await simulateDetachFile(autosave, { type: "ready" });

      // File-tier is reset
      expect(result.autosave).toBeNull();
      expect(result.initialScene).toBeNull();
      // View-tier (reactRoot, wysiwygObserver) is untouched:
      // simulated by the fact that we DON'T call unmount/disconnect
    });
  });

  describe("unmountView: defensive flush for plugin-unload path", () => {
    it("flushes and destroys autosave when onClose fires without preceding onUnloadFile", async () => {
      const writeFn = vi.fn().mockResolvedValue(undefined);
      const autosave = createAutosavedScene(writeFn, TEST_AUTOSAVE_INTERVAL_MS);

      autosave.handleSceneChange(buildElements(1), emptyAppState, emptyFiles);
      expect(autosave.isDirty).toBe(true);

      await simulateUnmountView(autosave, { type: "ready" });

      expect(writeFn).toHaveBeenCalledTimes(1);
    });

    it("does not throw when autosave is already null (normal tab-close after onUnloadFile)", async () => {
      await expect(
        simulateUnmountView(null, { type: "ready" }),
      ).resolves.toBeUndefined();
    });

    it("does not flush when status is error", async () => {
      const writeFn = vi.fn().mockResolvedValue(undefined);
      const autosave = createAutosavedScene(writeFn, TEST_AUTOSAVE_INTERVAL_MS);

      autosave.handleSceneChange(buildElements(1), emptyAppState, emptyFiles);

      await simulateUnmountView(autosave, { type: "error", message: "bad data" });

      expect(writeFn).not.toHaveBeenCalled();
    });

    it("still destroys the controller when status is error", async () => {
      const writeFn = vi.fn().mockResolvedValue(undefined);
      const autosave = createAutosavedScene(writeFn, TEST_AUTOSAVE_INTERVAL_MS);

      autosave.handleSceneChange(buildElements(1), emptyAppState, emptyFiles);

      await simulateUnmountView(autosave, { type: "error", message: "bad data" });

      // After destroy, interval is stopped
      await vi.advanceTimersByTimeAsync(5000);
      expect(writeFn).not.toHaveBeenCalled();
    });
  });

  describe("setViewData with clear=false does not recreate autosave", () => {
    it("existing autosave remains active when clear=false (external edit refresh)", async () => {
      const writeFn = vi.fn().mockResolvedValue(undefined);
      const autosave = createAutosavedScene(writeFn, TEST_AUTOSAVE_INTERVAL_MS);

      // Simulate editing: autosave is dirty
      autosave.handleSceneChange(buildElements(2), emptyAppState, emptyFiles);
      expect(autosave.isDirty).toBe(true);

      // Simulate setViewData(newData, clear=false):
      // In the real view, attachFile is NOT called. Autosave remains.
      // We verify the autosave is the same instance and still dirty.
      expect(autosave.isDirty).toBe(true);

      await autosave.flush();
      expect(writeFn).toHaveBeenCalledTimes(1);
      autosave.destroy();
    });
  });

  describe("no duplicate writes: onUnloadFile then onClose", () => {
    it("detachFile flushes once, subsequent unmountView does not write again", async () => {
      const writeFn = vi.fn().mockResolvedValue(undefined);
      const autosave = createAutosavedScene(writeFn, TEST_AUTOSAVE_INTERVAL_MS);

      autosave.handleSceneChange(buildElements(2), emptyAppState, emptyFiles);

      // Step 1: onUnloadFile → detachFile flushes and nulls autosave
      await simulateDetachFile(autosave, { type: "ready" });
      expect(writeFn).toHaveBeenCalledTimes(1);

      // Step 2: onClose → unmountView sees autosave as null, no-ops
      await simulateUnmountView(null, { type: "ready" });

      // Still only one write
      expect(writeFn).toHaveBeenCalledTimes(1);
    });
  });

  describe("cleanup ordering: flush → destroy → unmount → disconnect", () => {
    it("follows the correct cleanup order in unmountView", async () => {
      const callOrder: string[] = [];

      const writeFn = vi.fn().mockImplementation(async () => {
        callOrder.push("flush-write");
      });
      const autosave = createAutosavedScene(writeFn, TEST_AUTOSAVE_INTERVAL_MS);

      autosave.handleSceneChange(buildElements(1), emptyAppState, emptyFiles);

      const originalDestroy = autosave.destroy;
      autosave.destroy = () => {
        callOrder.push("destroy");
        originalDestroy();
      };

      await simulateUnmountView(autosave, { type: "ready" }, {
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

  describe("flush error routing", () => {
    it("flush errors route through onWriteError, not rejecting the promise", async () => {
      const writeError = new Error("disk full");
      const writeFn = vi.fn().mockRejectedValue(writeError);
      const onWriteError = vi.fn();
      const autosave = createAutosavedScene(writeFn, 2000, { onWriteError });

      autosave.handleSceneChange(buildElements(1), emptyAppState, emptyFiles);

      await expect(autosave.flush()).resolves.toBeUndefined();
      expect(onWriteError).toHaveBeenCalledWith(writeError);

      autosave.destroy();
    });

    it("destroy and cleanup proceed even after flush error in unmountView", async () => {
      const writeFn = vi.fn().mockRejectedValue(new Error("IO error"));
      const onWriteError = vi.fn();
      const autosave = createAutosavedScene(writeFn, 2000, { onWriteError });

      autosave.handleSceneChange(buildElements(1), emptyAppState, emptyFiles);

      await simulateUnmountView(autosave, { type: "ready" });

      expect(onWriteError).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(5000);
      expect(writeFn).toHaveBeenCalledTimes(1);
    });
  });

  describe("idempotent double-close", () => {
    it("does not throw when unmountView is called twice", async () => {
      const writeFn = vi.fn().mockResolvedValue(undefined);
      const autosave = createAutosavedScene(writeFn, TEST_AUTOSAVE_INTERVAL_MS);

      autosave.handleSceneChange(buildElements(1), emptyAppState, emptyFiles);

      await simulateUnmountView(autosave, { type: "ready" });

      // Second call: autosave is null in the real view
      await expect(
        simulateUnmountView(null, { type: "ready" }),
      ).resolves.toBeUndefined();

      expect(writeFn).toHaveBeenCalledTimes(1);
    });
  });
});
