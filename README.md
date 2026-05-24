# Minimal Excalidraw for Obsidian

A lightweight Obsidian plugin that embeds the upstream [Excalidraw](https://excalidraw.com) editor directly inside your vault. Create, edit, and search drawings without leaving Obsidian.

## Why this exists

The existing Obsidian Excalidraw plugin lost the plot a while ago and is still using a legacy version of excalidraw. It seems like a big lump of bloatware that tries to do everything for everyone, but in the process does not have the experience that I expect when using excalidraw. Yes it has a bunch of features that excalidraw doesnt have out of the box but none of them i really need.

This plugin takes a different approach: **do less, stay thin**. It wraps the published `@excalidraw/excalidraw` package with minimal glue code. No fork, no custom tooling, no network calls. Drawings live in your vault as markdown files and stay searchable through Obsidian's built-in search.

## What it does

- **Create drawings**: Run "Create new Excalidraw drawing" from the command palette.
- **Edit in-vault**: Drawings open in a native Excalidraw editor tab inside Obsidian.
- **Autosave**: Changes are debounced and written automatically. Pending changes flush on tab close.
- **Searchable text**: Text elements from your drawings are projected into a `# Text Elements` markdown section, making them discoverable through Obsidian search.
- **Vault-native files**: Drawings are `.excalidraw.md` files: linkable with wikilinks, readable as markdown if the plugin is disabled.

## What it does not do

No AI, no OCR, no LaTeX, no scripting engine, no custom export pipeline, no sidepanels, no collaboration features, no image extraction to attachments. The editor behaves exactly like upstream Excalidraw.

## Setup

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- An Obsidian vault for development testing

### Install dependencies

```sh
npm install
```

### Development build

```sh
npm run dev
```

This produces `main.js` and `styles.css` in the project root. Symlink or copy the project directory into your vault's `.obsidian/plugins/minimal-excalidraw/` folder, then enable the plugin in Obsidian settings.

### Production build

```sh
npm run build
```

Runs TypeScript type checking followed by an optimized esbuild bundle.

### Run tests

```sh
npm test
```

Runs the full Vitest suite (112 tests covering the codec, text projection, file service, autosave, filename generation, and error handling).

```sh
npm run test:watch
```

Runs tests in watch mode during development.

### Type checking

```sh
npm run typecheck
```

## How it works

The plugin registers a custom view for `.excalidraw.md` files. When you open one, the view parses the embedded JSON scene data, mounts a React-rendered Excalidraw editor, and feeds it the saved scene. As you draw, an autosave controller debounces changes and writes the latest scene back to the file through Obsidian's vault API.

The `.excalidraw.md` format is a markdown envelope:

- **Frontmatter**: identifies the file as a minimal-excalidraw drawing
- **`# Text Elements`**: searchable text extracted from scene elements (regenerated on every save)
- **Hidden `# Drawing` block**: native Excalidraw JSON wrapped in an Obsidian comment (`%%`)

If the plugin is ever disabled, the file remains a valid markdown document with your text content visible and the drawing JSON preserved for future use.

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| Drawing folder | `excalidraw` | Vault-relative folder where new drawings are created. Created automatically on first use. |

Changing the folder setting affects only new drawings. Existing drawings stay where they are.
