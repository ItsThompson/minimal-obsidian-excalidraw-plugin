# Minimal Excalidraw for Obsidian

A lightweight Obsidian plugin that embeds the upstream [Excalidraw](https://excalidraw.com) editor directly inside your vault. Create, edit, and search drawings without leaving Obsidian.

## Why this exists

The existing Obsidian Excalidraw plugin lost the plot a while ago and is still using a legacy version of excalidraw. It seems like a big lump of bloatware that tries to do everything for everyone, but in the process does not have the experience that I expect when using excalidraw. Yes it has a bunch of features that excalidraw doesnt have out of the box but none of them i really need.

This plugin takes a different approach: **do less, stay thin**. It wraps the published `@excalidraw/excalidraw` package with minimal glue code. No fork, no custom tooling, no network calls. Drawings live in your vault as markdown files and stay searchable through Obsidian's built-in search.

## What it does

- **Create drawings**: Run "Create new Excalidraw drawing" from the command palette.
- **Edit in-vault**: Drawings open in a native Excalidraw editor tab inside Obsidian.
- **Autosave**: Changes are saved on a 2-second interval timer. Pending changes flush on tab close.
- **Searchable text**: Text elements from your drawings are projected into a `# Text Elements` markdown section, making them discoverable through Obsidian search.
- **Vault-native files**: Drawings are `.excalidraw.md` files: linkable with wikilinks, readable as markdown if the plugin is disabled.

## What it does not do

No AI, no OCR, no LaTeX, no scripting engine, no custom export pipeline, no sidepanels, no collaboration features, no image extraction to attachments. The editor behaves exactly like upstream Excalidraw.

## Installation

### From source

```sh
npm install
npm run build
```

This produces three files in the project root:

- `main.js` — bundled plugin code
- `styles.css` — combined Excalidraw + plugin styles
- `manifest.json` — already exists in the repo

Copy all three into your vault's plugin folder:

```sh
mkdir -p /path/to/vault/.obsidian/plugins/minimal-excalidraw
cp main.js styles.css manifest.json /path/to/vault/.obsidian/plugins/minimal-excalidraw/
```

Then in Obsidian:

1. Settings → Community Plugins → turn off "Restricted Mode"
2. Find "Minimal Excalidraw" in the installed plugins list and enable it
3. Run "Create new Excalidraw drawing" from the command palette (`Cmd+P`)

### Development workflow

For iterating on the plugin, use `npm run dev` which watches for changes and rebuilds on save. Symlink the project root directly into your vault's plugin folder so you don't need to copy files after each rebuild:

```sh
ln -s /path/to/this/repo /path/to/vault/.obsidian/plugins/minimal-excalidraw
```

Install the [hot-reload](https://github.com/pjeby/hot-reload) plugin in your dev vault for automatic reload on rebuild. Add a `.hotreload` marker file to the project root:

```sh
touch .hotreload
```

### Run tests

```sh
npm test            # single run
npm run test:watch  # watch mode
npm run typecheck   # type checking only
```

## How it works

The plugin registers a custom view for `.excalidraw.md` files. When you open one, the view parses the embedded JSON scene data, mounts a React-rendered Excalidraw editor, and feeds it the saved scene. As you draw, a 2-second interval timer checks for dirty state and writes the latest scene back to the file through Obsidian's vault API. Saves are skipped while you're actively editing text or creating new elements.

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
