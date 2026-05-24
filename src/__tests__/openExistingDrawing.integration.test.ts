import { describe, it, expect } from "vitest";
import { ExcalidrawMarkdownCodec } from "../markdown/ExcalidrawMarkdownCodec";
import type { ExcalidrawScene } from "../types";

/**
 * Integration test: verifies the full read path from a fixture .excalidraw.md
 * string through codec parsing to structured scene data.
 */
describe("Open existing drawing: integration", () => {
  const fixtureMarkdown = [
    "---",
    "excalidraw-plugin: minimal",
    "tags: [excalidraw]",
    "---",
    "",
    "# Text Elements",
    "Hello World ^text1",
    "",
    "%%",
    "# Drawing",
    "```json",
    JSON.stringify(
      {
        type: "excalidraw",
        version: 2,
        source: "https://excalidraw.com",
        elements: [
          {
            id: "rect1",
            type: "rectangle",
            x: 10,
            y: 20,
            width: 200,
            height: 100,
            strokeColor: "#000000",
            backgroundColor: "transparent",
            isDeleted: false,
          },
          {
            id: "text1",
            type: "text",
            x: 50,
            y: 50,
            text: "Hello World",
            fontSize: 20,
            isDeleted: false,
          },
          {
            id: "arrow1",
            type: "arrow",
            x: 220,
            y: 70,
            points: [[0, 0], [100, 50]],
            isDeleted: false,
          },
          {
            id: "deleted1",
            type: "text",
            x: 300,
            y: 300,
            text: "Gone",
            isDeleted: true,
          },
        ],
        appState: {
          viewBackgroundColor: "#f5f5f5",
          zoom: { value: 1.2 },
          scrollX: 50,
          scrollY: -30,
          theme: "light",
        },
        files: {
          img1: {
            mimeType: "image/png",
            id: "img1",
            dataURL: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==",
            created: 1700000000000,
          },
        },
      },
      null,
      2,
    ),
    "```",
    "%%",
    "",
  ].join("\n");

  it("parses fixture into a valid scene with expected element count", () => {
    const result = ExcalidrawMarkdownCodec.parse(fixtureMarkdown);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { scene } = result.document;
    expect(scene.elements).toHaveLength(4);
  });

  it("preserves element types from the fixture", () => {
    const result = ExcalidrawMarkdownCodec.parse(fixtureMarkdown);
    if (!result.ok) return;

    const types = result.document.scene.elements.map((el) => el.type);
    expect(types).toContain("rectangle");
    expect(types).toContain("text");
    expect(types).toContain("arrow");
  });

  it("preserves rectangle element properties", () => {
    const result = ExcalidrawMarkdownCodec.parse(fixtureMarkdown);
    if (!result.ok) return;

    const rect = result.document.scene.elements.find((el) => el.id === "rect1");
    expect(rect).toBeDefined();
    expect(rect!.type).toBe("rectangle");
    expect(rect!["width"]).toBe(200);
    expect(rect!["height"]).toBe(100);
  });

  it("preserves text element content", () => {
    const result = ExcalidrawMarkdownCodec.parse(fixtureMarkdown);
    if (!result.ok) return;

    const textEl = result.document.scene.elements.find((el) => el.id === "text1");
    expect(textEl).toBeDefined();
    expect(textEl!["text"]).toBe("Hello World");
  });

  it("preserves arrow element with points", () => {
    const result = ExcalidrawMarkdownCodec.parse(fixtureMarkdown);
    if (!result.ok) return;

    const arrow = result.document.scene.elements.find((el) => el.id === "arrow1");
    expect(arrow).toBeDefined();
    expect(arrow!.type).toBe("arrow");
    expect(arrow!["points"]).toEqual([[0, 0], [100, 50]]);
  });

  it("includes deleted elements in the scene (codec preserves all)", () => {
    const result = ExcalidrawMarkdownCodec.parse(fixtureMarkdown);
    if (!result.ok) return;

    const deleted = result.document.scene.elements.find((el) => el.id === "deleted1");
    expect(deleted).toBeDefined();
    expect(deleted!["isDeleted"]).toBe(true);
  });

  it("restores appState with zoom, scroll, and theme", () => {
    const result = ExcalidrawMarkdownCodec.parse(fixtureMarkdown);
    if (!result.ok) return;

    const { appState } = result.document.scene;
    expect(appState["viewBackgroundColor"]).toBe("#f5f5f5");
    expect(appState["zoom"]).toEqual({ value: 1.2 });
    expect(appState["scrollX"]).toBe(50);
    expect(appState["scrollY"]).toBe(-30);
    expect(appState["theme"]).toBe("light");
  });

  it("restores binary file data for image elements", () => {
    const result = ExcalidrawMarkdownCodec.parse(fixtureMarkdown);
    if (!result.ok) return;

    const { files } = result.document.scene;
    expect(files["img1"]).toBeDefined();
    expect(files["img1"]!.mimeType).toBe("image/png");
    expect(files["img1"]!.id).toBe("img1");
    expect(files["img1"]!.dataURL).toContain("data:image/png;base64,");
    expect(files["img1"]!.created).toBe(1700000000000);
  });

  it("extracts text projection from non-deleted text elements", () => {
    const result = ExcalidrawMarkdownCodec.parse(fixtureMarkdown);
    if (!result.ok) return;

    const { textProjection } = result.document;
    expect(textProjection).toEqual([{ elementId: "text1", text: "Hello World" }]);
  });

  it("scene data is suitable as Excalidraw initialData", () => {
    const result = ExcalidrawMarkdownCodec.parse(fixtureMarkdown);
    if (!result.ok) return;

    const { scene } = result.document;

    // Verify the shape matches what <Excalidraw initialData=...> expects
    expect(Array.isArray(scene.elements)).toBe(true);
    expect(typeof scene.appState).toBe("object");
    expect(typeof scene.files).toBe("object");
    expect(scene.elements.length).toBeGreaterThan(0);
  });
});
