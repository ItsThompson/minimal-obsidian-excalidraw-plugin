import type { Vault, TFile } from "obsidian";
import { ExcalidrawMarkdownCodec } from "../markdown/ExcalidrawMarkdownCodec";
import type { ExcalidrawScene, ParseResult } from "../types";

/**
 * Thin service coordinating vault file I/O with the markdown codec.
 * Owns both read and write paths for .excalidraw.md files.
 */
export const DrawingFileService = {
  /**
   * Reads a drawing file from the vault and parses it into a structured document.
   * Returns a discriminated union: success with document, or failure with error message.
   */
  async readDrawing(file: TFile, vault: Vault): Promise<ParseResult> {
    const content = await vault.read(file);
    return ExcalidrawMarkdownCodec.parse(content);
  },

  /**
   * Serializes the scene through the codec (including text projection regeneration)
   * and writes the full markdown file to the vault atomically.
   */
  async writeDrawing(file: TFile, scene: ExcalidrawScene, vault: Vault): Promise<void> {
    const content = ExcalidrawMarkdownCodec.serialize(scene);
    await vault.modify(file, content);
  },
};
