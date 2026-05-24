import { MarkdownPostProcessorContext, TFile } from "obsidian";
import { exportToSvg } from "@excalidraw/excalidraw";
import { ExcalidrawMarkdownCodec } from "../markdown/ExcalidrawMarkdownCodec";
import { FILE_EXTENSION } from "../constants";
import type MinimalExcalidrawPlugin from "../main";
import type { ExcalidrawScene } from "../types";

const DEFAULT_EMBED_WIDTH = 400;
const FRONTMATTER_KEY = "excalidraw-plugin";

/**
 * Registers a markdown post-processor that renders embedded Excalidraw
 * drawings as SVG images in reading mode and live preview.
 *
 * Handles two cases:
 * 1. `.internal-embed` elements in reading mode (standard embed containers)
 * 2. Inline rendering of .excalidraw.md content in Live Preview embeds,
 *    where Obsidian renders the markdown content directly rather than
 *    creating an `.internal-embed` wrapper.
 */
export function registerEmbedPostProcessor(plugin: MinimalExcalidrawPlugin): void {
  plugin.registerMarkdownPostProcessor(async (el, ctx) => {
    // Case 1: Standard embed containers (reading mode and some Live Preview)
    const embeds = el.querySelectorAll(".internal-embed");
    if (embeds.length > 0) {
      for (const embed of Array.from(embeds)) {
        await processEmbed(embed as HTMLElement, ctx, plugin);
      }
      return;
    }

    // Case 2: Live Preview / Reading mode renders .excalidraw.md content inline.
    // Detect when we're inside an embed of an excalidraw file and replace
    // the rendered markdown sections with a single SVG image.
    await processInlineExcalidrawEmbed(el, ctx, plugin);
  });
}

/**
 * Tracks which embed containers have already been rendered to avoid
 * inserting the SVG multiple times (once per markdown section).
 */
const renderedContainers = new WeakSet<HTMLElement>();

/**
 * When an .excalidraw.md file is embedded, Obsidian renders each markdown
 * section through the post-processor separately. We render the SVG only
 * on the first call (frontmatter section) and hide all subsequent sections.
 */
async function processInlineExcalidrawEmbed(
  el: HTMLElement,
  ctx: MarkdownPostProcessorContext,
  plugin: MinimalExcalidrawPlugin,
): Promise<void> {
  // Only process if the source file is an excalidraw file
  if (!ctx.frontmatter?.[FRONTMATTER_KEY]) return;

  // containerEl exists at runtime but isn't in the official type definition
  const containerEl = (ctx as any).containerEl as HTMLElement | undefined;
  if (!containerEl) return;

  const isInEmbed = isInsideEmbed(containerEl);
  const isInReadingView = isInsideReadingView(containerEl);
  if (!isInEmbed && !isInReadingView) return;

  // If this container has already been rendered, just hide this section
  if (renderedContainers.has(containerEl)) {
    el.style.display = "none";
    return;
  }

  // Only render on the frontmatter section (first section processed)
  const isFrontmatter = el.querySelector(".frontmatter") !== null
    || el.classList.contains("mod-frontmatter");
  if (!isFrontmatter) {
    // Not frontmatter and not yet rendered: hide and wait
    el.style.display = "none";
    return;
  }

  const file = plugin.app.vault.getAbstractFileByPath(ctx.sourcePath);
  if (!file || !(file instanceof TFile)) return;
  if (!file.path.endsWith(`.${FILE_EXTENSION}`)) return;

  // Mark this container as rendered so subsequent sections get hidden
  renderedContainers.add(containerEl);

  // Read and render
  const content = await plugin.app.vault.read(file);
  const result = ExcalidrawMarkdownCodec.parse(content);
  if (!result.ok) return;

  const scene = result.document.scene;
  const elements = scene.elements.filter((e) => !e.isDeleted);
  if (elements.length === 0) {
    el.empty();
    el.createEl("em", { text: "(empty drawing)" });
    return;
  }

  const svg = await renderSceneToSvg(scene, elements);
  if (!svg) return;

  el.empty();

  // Get width from the parent embed element if available
  const embedParent = containerEl.closest(".internal-embed") as HTMLElement;
  const width = embedParent?.getAttribute("width") ?? String(DEFAULT_EMBED_WIDTH);
  applySvgDimensions(svg, width, embedParent?.getAttribute("height"));

  el.appendChild(svg);
}

async function processEmbed(
  embedEl: HTMLElement,
  ctx: MarkdownPostProcessorContext,
  plugin: MinimalExcalidrawPlugin,
): Promise<void> {
  const src = embedEl.getAttribute("src")?.split("#")[0];
  if (!src) return;

  const file = plugin.app.metadataCache.getFirstLinkpathDest(src, ctx.sourcePath);
  if (!file || !(file instanceof TFile)) return;
  if (!file.path.endsWith(`.${FILE_EXTENSION}`)) return;

  // Read and parse the drawing file
  const content = await plugin.app.vault.read(file);
  const result = ExcalidrawMarkdownCodec.parse(content);
  if (!result.ok) return;

  const scene = result.document.scene;

  // Filter out deleted elements for export
  const elements = scene.elements.filter((el) => !el.isDeleted);
  if (elements.length === 0) {
    embedEl.empty();
    embedEl.createEl("em", { text: "(empty drawing)" });
    return;
  }

  // Generate SVG from the scene
  const svg = await renderSceneToSvg(scene, elements);
  if (!svg) return;

  // Style the embed container as an image embed
  embedEl.empty();
  embedEl.removeClass("markdown-embed");
  embedEl.removeClass("inline-embed");
  embedEl.addClass("media-embed");
  embedEl.addClass("image-embed");
  embedEl.addClass("excalidraw-embedded-img");

  // Apply dimensions
  const width = embedEl.getAttribute("width") ?? String(DEFAULT_EMBED_WIDTH);
  applySvgDimensions(svg, width, embedEl.getAttribute("height"));

  embedEl.appendChild(svg);

  // Make clicking the embed open the drawing
  embedEl.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const leaf = plugin.app.workspace.getLeaf(false);
    leaf.openFile(file);
  });
}

function applySvgDimensions(svg: SVGSVGElement, width: string, height: string | null): void {
  // Remove explicit width/height set by exportToSvg.
  // The viewBox preserves the aspect ratio; we control size via CSS.
  svg.removeAttribute("width");
  svg.removeAttribute("height");

  svg.style.width = `${width}px`;
  svg.style.maxWidth = "100%";
  svg.style.height = "auto";

  if (height) {
    svg.style.maxHeight = `${height}px`;
  }
}

function isInsideEmbed(el: HTMLElement): boolean {
  let current: HTMLElement | null = el;
  while (current) {
    if (current.classList.contains("internal-embed")) return true;
    if (current.classList.contains("markdown-embed")) return true;
    current = current.parentElement;
  }
  return false;
}

function isInsideReadingView(el: HTMLElement): boolean {
  let current: HTMLElement | null = el;
  while (current) {
    if (current.classList.contains("markdown-reading-view")) return true;
    current = current.parentElement;
  }
  return false;
}

async function renderSceneToSvg(
  scene: ExcalidrawScene,
  elements: readonly ExcalidrawScene["elements"][number][],
): Promise<SVGSVGElement | null> {
  try {
    const isDark = scene.appState?.theme === "dark";
    const svg = await exportToSvg({
      elements: elements as any,
      appState: {
        exportBackground: true,
        exportWithDarkMode: isDark,
        viewBackgroundColor: (scene.appState?.viewBackgroundColor as string)
          ?? (isDark ? "#121212" : "#ffffff"),
      } as any,
      files: scene.files ?? {},
      exportPadding: 16,
    });
    return svg;
  } catch (error) {
    console.error("[minimal-excalidraw] embed SVG export failed:", error);
    return null;
  }
}
