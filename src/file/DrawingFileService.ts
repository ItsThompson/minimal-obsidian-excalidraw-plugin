import type { Vault, TFile, TAbstractFile } from "obsidian";
import { ExcalidrawMarkdownCodec } from "../markdown/ExcalidrawMarkdownCodec";
import { formatTimestamp, generateUniqueFilename, normalizeFolderPath } from "./filename";
import type { ExcalidrawScene, ParseResult } from "../types";

export interface CreateDrawingRequest {
  /** Vault-relative target folder. */
  folder: string;
  /** Optional timestamp override (defaults to now). Used for testing. */
  timestamp?: Date;
}

/**
 * Thin service coordinating vault file I/O with the markdown codec.
 * Owns both read and write paths for .excalidraw.md files.
 */
export interface VaultOperations {
  read(file: TFile): Promise<string>;
  modify(file: TFile, content: string): Promise<void>;
  create(path: string, content: string): Promise<TFile>;
  getAbstractFileByPath(path: string): TAbstractFile | null;
  createFolder(path: string): Promise<unknown>;
}

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

  /**
   * Creates a new drawing file in the configured folder with a unique filename.
   * Creates the folder if it does not exist. Returns the created TFile.
   */
  async createDrawing(
    request: CreateDrawingRequest,
    vault: VaultOperations,
  ): Promise<TFile> {
    const folder = normalizeFolderPath(request.folder || "excalidraw");
    const timestamp = request.timestamp ?? new Date();

    // Create folder if missing
    const folderExists = vault.getAbstractFileByPath(folder);
    if (!folderExists) {
      await vault.createFolder(folder);
    }

    // Build the set of existing paths for collision detection
    const existingPaths = new Set<string>();
    const checkBaseName = `Drawing ${formatTimestamp(timestamp)}`;
    // Check the base and a reasonable number of suffixes
    for (let suffix = 0; suffix <= 100; suffix++) {
      const candidateName = suffix === 0
        ? `${checkBaseName}.excalidraw.md`
        : `${checkBaseName} ${suffix + 1}.excalidraw.md`;
      const candidatePath = `${folder}/${candidateName}`;
      if (vault.getAbstractFileByPath(candidatePath)) {
        existingPaths.add(candidatePath);
      }
    }

    const filename = generateUniqueFilename(timestamp, existingPaths, folder);
    const filePath = `${folder}/${filename}`;
    const content = ExcalidrawMarkdownCodec.createEmptyDocument();

    const file = await vault.create(filePath, content);
    return file;
  },
};


