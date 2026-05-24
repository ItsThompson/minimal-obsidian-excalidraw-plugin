import { describe, it, expect } from "vitest";
import {
  extractTextProjection,
  renderTextProjectionSection,
  parseTextProjectionSection,
} from "../markdown/textProjection";
import type { ExcalidrawElement } from "../types";

describe("extractTextProjection", () => {
  it("extracts non-deleted text elements", () => {
    const elements: ExcalidrawElement[] = [
      { id: "text1", type: "text", text: "Hello world", isDeleted: false },
      { id: "rect1", type: "rectangle", isDeleted: false },
      { id: "text2", type: "text", text: "Second text", isDeleted: false },
    ];

    const result = extractTextProjection(elements);

    expect(result).toEqual([
      { elementId: "text1", text: "Hello world" },
      { elementId: "text2", text: "Second text" },
    ]);
  });

  it("excludes elements with isDeleted: true", () => {
    const elements: ExcalidrawElement[] = [
      { id: "text1", type: "text", text: "Visible", isDeleted: false },
      { id: "text2", type: "text", text: "Deleted", isDeleted: true },
    ];

    const result = extractTextProjection(elements);

    expect(result).toEqual([{ elementId: "text1", text: "Visible" }]);
  });

  it("includes bound labels (text elements with containerId)", () => {
    const elements: ExcalidrawElement[] = [
      {
        id: "label1",
        type: "text",
        text: "Label text",
        containerId: "rect1",
        isDeleted: false,
      },
    ];

    const result = extractTextProjection(elements);

    expect(result).toEqual([{ elementId: "label1", text: "Label text" }]);
  });

  it("preserves multiline text", () => {
    const elements: ExcalidrawElement[] = [
      {
        id: "multi1",
        type: "text",
        text: "Line one\nLine two\nLine three",
        isDeleted: false,
      },
    ];

    const result = extractTextProjection(elements);

    expect(result).toEqual([
      { elementId: "multi1", text: "Line one\nLine two\nLine three" },
    ]);
  });

  it("returns empty array for no text elements", () => {
    const elements: ExcalidrawElement[] = [
      { id: "rect1", type: "rectangle", isDeleted: false },
      { id: "arrow1", type: "arrow", isDeleted: false },
    ];

    const result = extractTextProjection(elements);

    expect(result).toEqual([]);
  });

  it("excludes text elements with empty text", () => {
    const elements: ExcalidrawElement[] = [
      { id: "text1", type: "text", text: "", isDeleted: false },
      { id: "text2", type: "text", text: "   ", isDeleted: false },
    ];

    const result = extractTextProjection(elements);

    expect(result).toEqual([]);
  });
});

describe("renderTextProjectionSection", () => {
  it("renders entries with block anchors", () => {
    const entries = [
      { elementId: "abc123", text: "Hello world" },
      { elementId: "def456", text: "Second text" },
    ];

    const result = renderTextProjectionSection(entries);

    expect(result).toBe(
      "# Text Elements\nHello world ^abc123\n\nSecond text ^def456\n",
    );
  });

  it("renders empty section with just the header", () => {
    const result = renderTextProjectionSection([]);

    expect(result).toBe("# Text Elements\n");
  });

  it("preserves multiline text with anchor on last line", () => {
    const entries = [
      { elementId: "multi1", text: "Line one\nLine two" },
    ];

    const result = renderTextProjectionSection(entries);

    expect(result).toBe("# Text Elements\nLine one\nLine two ^multi1\n");
  });
});

describe("parseTextProjectionSection", () => {
  it("parses entries from section content", () => {
    const section = "# Text Elements\nHello world ^abc123\n\nSecond text ^def456\n";

    const result = parseTextProjectionSection(section);

    expect(result).toEqual([
      { elementId: "abc123", text: "Hello world" },
      { elementId: "def456", text: "Second text" },
    ]);
  });

  it("returns empty array for header-only section", () => {
    const result = parseTextProjectionSection("# Text Elements\n");

    expect(result).toEqual([]);
  });

  it("parses multiline text entries", () => {
    const section = "# Text Elements\nLine one\nLine two ^multi1\n";

    const result = parseTextProjectionSection(section);

    expect(result).toEqual([
      { elementId: "multi1", text: "Line one\nLine two" },
    ]);
  });
});
