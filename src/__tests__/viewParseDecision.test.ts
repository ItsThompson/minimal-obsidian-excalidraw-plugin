import { describe, it, expect, vi } from "vitest";
import { ExcalidrawMarkdownCodec } from "../markdown/ExcalidrawMarkdownCodec";

/**
 * Tests the view's parse logic path: given various file contents,
 * verify the codec produces the correct result type that the view
 * will use to decide between rendering the editor or showing an error.
 */
describe("View parse decision: codec drives view status", () => {
  it("valid content produces ok:true (view enters ready state)", () => {
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
      JSON.stringify({
        type: "excalidraw",
        version: 2,
        source: "https://excalidraw.com",
        elements: [{ id: "r1", type: "rectangle", x: 0, y: 0 }],
        appState: { theme: "dark" },
        files: {},
      }, null, 2),
      "```",
      "%%",
      "",
    ].join("\n");

    const result = ExcalidrawMarkdownCodec.parse(markdown);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.scene.elements).toHaveLength(1);
    expect(result.document.scene.appState["theme"]).toBe("dark");
  });

  it("empty string produces ok:false (view enters error state)", () => {
    const result = ExcalidrawMarkdownCodec.parse("");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeTruthy();
  });

  it("missing drawing block produces error with user-safe message", () => {
    const markdown = [
      "---",
      "excalidraw-plugin: minimal",
      "tags: [excalidraw]",
      "---",
      "",
      "# Some random markdown content",
      "No drawing block here.",
    ].join("\n");

    const result = ExcalidrawMarkdownCodec.parse(markdown);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("Missing drawing block");
  });

  it("corrupted JSON produces error with user-safe message", () => {
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
      '{ "type": "excalidraw", broken }}}',
      "```",
      "%%",
      "",
    ].join("\n");

    const result = ExcalidrawMarkdownCodec.parse(markdown);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("Invalid JSON");
  });

  it("non-excalidraw JSON produces error", () => {
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
      JSON.stringify({ type: "something-else", data: [] }),
      "```",
      "%%",
      "",
    ].join("\n");

    const result = ExcalidrawMarkdownCodec.parse(markdown);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('type: "excalidraw"');
  });
});
