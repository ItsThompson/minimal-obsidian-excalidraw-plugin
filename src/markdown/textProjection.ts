import type { ExcalidrawElement, TextProjectionEntry } from "../types";

/**
 * Determines whether an element is a non-deleted text element
 * eligible for text projection.
 */
function isProjectableTextElement(
  element: ExcalidrawElement,
): element is ExcalidrawElement & { type: "text"; text: string } {
  if (element.type !== "text") return false;
  if (element.isDeleted === true) return false;
  const text = (element as { text?: string }).text;
  if (!text || text.trim() === "") return false;
  return true;
}

/**
 * Extracts searchable text entries from scene elements.
 *
 * Includes:
 * - Non-deleted text elements (including bound labels with containerId)
 *
 * Excludes:
 * - Elements with isDeleted: true
 * - Non-text elements
 * - Text elements with empty text
 */
export function extractTextProjection(
  elements: readonly ExcalidrawElement[],
): TextProjectionEntry[] {
  return elements.reduce<TextProjectionEntry[]>((entries, element) => {
    if (isProjectableTextElement(element)) {
      entries.push({
        elementId: element.id,
        text: (element as { text: string }).text,
      });
    }
    return entries;
  }, []);
}

/**
 * Renders text projection entries into the markdown format
 * used in the # Text Elements section.
 *
 * Each entry becomes:
 * ```
 * <text content> ^elementId
 * ```
 *
 * Multiline text is preserved with the block anchor on the last line.
 */
export function renderTextProjectionSection(
  entries: TextProjectionEntry[],
): string {
  if (entries.length === 0) {
    return "# Text Elements\n";
  }

  const lines = entries.map((entry) => {
    return `${entry.text} ^${entry.elementId}`;
  });

  return `# Text Elements\n${lines.join("\n\n")}\n`;
}

/**
 * Parses the # Text Elements section back into entries.
 * Each entry ends with ^elementId on its last line.
 */
export function parseTextProjectionSection(
  sectionContent: string,
): TextProjectionEntry[] {
  const trimmed = sectionContent.trim();
  if (trimmed === "" || trimmed === "# Text Elements") {
    return [];
  }

  // Remove the header if present
  const content = trimmed.startsWith("# Text Elements")
    ? trimmed.slice("# Text Elements".length).trim()
    : trimmed;

  if (content === "") return [];

  // Split on double newlines to get individual entries
  const blocks = content.split(/\n\n/);

  return blocks.reduce<TextProjectionEntry[]>((entries, block) => {
    const cleaned = block.trim();
    if (cleaned === "") return entries;

    // The block anchor pattern is ^elementId at the end of the last line
    const anchorMatch = cleaned.match(/\s\^([^\s]+)$/);
    if (!anchorMatch?.[1]) return entries;

    const elementId = anchorMatch[1];
    const text = cleaned.slice(0, cleaned.length - anchorMatch[0].length);

    entries.push({ elementId, text });
    return entries;
  }, []);
}
