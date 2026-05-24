import type { Vault, TFile } from "obsidian";
import { ExcalidrawMarkdownCodec } from "../markdown/ExcalidrawMarkdownCodec";
import type { ParseResult } from "../types";

/**
 * Thin service coordinating vault file I/O with the markdown codec.
 * Currently only owns the read path; createDrawing and writeDrawing
 * will be added by later tickets.
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
};
