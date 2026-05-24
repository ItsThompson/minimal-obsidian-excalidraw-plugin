import { describe, it, expect } from "vitest";
import {
  formatTimestamp,
  generateUniqueFilename,
  normalizeFolderPath,
} from "../file/filename";

describe("formatTimestamp", () => {
  it("formats a date as YYYY-MM-DD HH-mm-ss in local time", () => {
    const date = new Date(2026, 4, 24, 14, 30, 5); // May 24, 2026 14:30:05
    expect(formatTimestamp(date)).toBe("2026-05-24 14-30-05");
  });

  it("zero-pads single-digit values", () => {
    const date = new Date(2026, 0, 3, 9, 5, 1); // Jan 3, 2026 09:05:01
    expect(formatTimestamp(date)).toBe("2026-01-03 09-05-01");
  });
});

describe("generateUniqueFilename", () => {
  const timestamp = new Date(2026, 4, 24, 14, 30, 0);
  const folder = "excalidraw";

  it("generates a filename with the timestamp when no collision exists", () => {
    const existing = new Set<string>();
    const result = generateUniqueFilename(timestamp, existing, folder);
    expect(result).toBe("Drawing 2026-05-24 14-30-00.excalidraw.md");
  });

  it("appends ' 2' when the base filename already exists", () => {
    const existing = new Set([
      "excalidraw/Drawing 2026-05-24 14-30-00.excalidraw.md",
    ]);
    const result = generateUniqueFilename(timestamp, existing, folder);
    expect(result).toBe("Drawing 2026-05-24 14-30-00 2.excalidraw.md");
  });

  it("increments suffix until a unique name is found", () => {
    const existing = new Set([
      "excalidraw/Drawing 2026-05-24 14-30-00.excalidraw.md",
      "excalidraw/Drawing 2026-05-24 14-30-00 2.excalidraw.md",
      "excalidraw/Drawing 2026-05-24 14-30-00 3.excalidraw.md",
    ]);
    const result = generateUniqueFilename(timestamp, existing, folder);
    expect(result).toBe("Drawing 2026-05-24 14-30-00 4.excalidraw.md");
  });

  it("uses the provided folder path for collision checking", () => {
    const existing = new Set([
      "drawings/Drawing 2026-05-24 14-30-00.excalidraw.md",
    ]);
    // Different folder: no collision
    const result = generateUniqueFilename(timestamp, existing, "excalidraw");
    expect(result).toBe("Drawing 2026-05-24 14-30-00.excalidraw.md");
  });
});

describe("normalizeFolderPath", () => {
  it("returns a simple path unchanged", () => {
    expect(normalizeFolderPath("excalidraw")).toBe("excalidraw");
  });

  it("strips leading slashes", () => {
    expect(normalizeFolderPath("/excalidraw")).toBe("excalidraw");
  });

  it("strips trailing slashes", () => {
    expect(normalizeFolderPath("excalidraw/")).toBe("excalidraw");
  });

  it("strips both leading and trailing slashes", () => {
    expect(normalizeFolderPath("/excalidraw/")).toBe("excalidraw");
  });

  it("collapses double slashes", () => {
    expect(normalizeFolderPath("my//drawings")).toBe("my/drawings");
  });

  it("handles multiple normalizations at once", () => {
    expect(normalizeFolderPath("///my//excalidraw///drawings///")).toBe(
      "my/excalidraw/drawings",
    );
  });

  it("handles nested paths", () => {
    expect(normalizeFolderPath("notes/drawings")).toBe("notes/drawings");
  });
});
