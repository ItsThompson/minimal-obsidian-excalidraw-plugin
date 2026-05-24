/**
 * Filename generation and path normalization for .excalidraw.md files.
 * All functions are pure: they accept inputs and return strings with no side effects.
 */

import { FILE_EXTENSION } from "../constants";

/**
 * Formats a Date into a human-readable, sortable timestamp string: YYYY-MM-DD HH-mm-ss
 * Uses local time for readability.
 */
export function formatTimestamp(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");

  return `${year}-${month}-${day} ${hours}-${minutes}-${seconds}`;
}

/**
 * Generates a unique filename for a new drawing given a timestamp and a set
 * of existing file paths in the target folder.
 *
 * Produces filenames like: "Drawing 2026-05-24 14-30-00.excalidraw.md"
 * If that name already exists, appends a numeric suffix: "Drawing 2026-05-24 14-30-00 2.excalidraw.md"
 *
 * @param timestamp - The Date to use for the filename
 * @param existingPaths - Set of vault-relative paths that already exist (used for collision detection)
 * @param folder - Normalized vault-relative folder path
 */
export function generateUniqueFilename(
  timestamp: Date,
  existingPaths: Set<string>,
  folder: string,
): string {
  const base = `Drawing ${formatTimestamp(timestamp)}`;
  const candidate = `${base}.${FILE_EXTENSION}`;
  const candidatePath = `${folder}/${candidate}`;

  if (!existingPaths.has(candidatePath)) {
    return candidate;
  }

  let suffix = 2;
  while (true) {
    const suffixedCandidate = `${base} ${suffix}.${FILE_EXTENSION}`;
    const suffixedPath = `${folder}/${suffixedCandidate}`;
    if (!existingPaths.has(suffixedPath)) {
      return suffixedCandidate;
    }
    suffix++;
  }
}

/**
 * Normalizes a folder path: strips leading/trailing slashes and collapses
 * double slashes into single slashes.
 */
export function normalizeFolderPath(path: string): string {
  return path
    .replace(/\/+/g, "/")
    .replace(/^\//, "")
    .replace(/\/$/, "");
}
