# DBML Studio

Studio adds an editing workspace to the original read-only viewer and CLI. It uses Vite 8.3.5, Monaco 0.56.0, the existing bundled parser, and the working 0.4.0 renderer. The lockfile pins dependencies; a DOMPurify 3.4.17 override resolves the sanitizer advisories in the editor dependency tree. The final dependency audit reported zero vulnerabilities.

## Run and build

From `dbdiagram-re/`:

```sh
npm ci
npm run build
npm run studio -- examples --port 4174
npm run dev
npm run verify
```

The production Studio serves `dist/studio/`. With `--dev`, or when the built UI is absent, it starts Vite in middleware mode. The example `dev` script starts with the parent directory as the allowed workspace. `--theme light` or `--theme dark` supplies the initial theme; an existing browser preference takes precedence. The toggle changes the interface, Monaco theme, and original renderer through a message, without reloading the document.

## Architecture

- `src/workspace.mjs`: directory discovery, regular DBML file reads, content-version hashes, exclusive creation, optimistic save conflicts, same-directory temp writes and atomic rename.
- `src/studio-server.mjs`: localhost API, recursive watch/SSE, Vite development integration or production assets, original renderer routes, parser-backed unsaved previews.
- `ui/src/main.js`: editor state, independent Monaco models, tabs, explorer, directory modal, create/save/reload/overwrite actions, diagnostics, preview sequencing, theme preference, resizable panes.
- `ui/src/style.css`: light/dark interface tokens and responsive layout.
- `web/studio-bridge.js`: same-origin parent/iframe messages adapted to the original extension protocol; per-file diagram layouts in local storage.
- `vite.config.mjs`: UI root, production output, ES module worker build.

The renderer is reused as a separate iframe application. Editor changes are compiled in memory by the backend, and only the latest requested preview is accepted. Valid snapshots go into the renderer; invalid drafts populate Monaco diagnostics and the problems panel without clearing the last valid diagram. Switching files creates a fresh renderer document to avoid retaining another model in its stores.

## Workspace layout

The full-width header is removed. Branding, workspace name, Save, theme, Vim and editor visibility controls live in the sidebar. Tabs and the workbench start at the top of the window. Collapse the sidebar with its top-right button; restore it from the bottom status bar, including when both sidebar and editor are hidden. Existing browser-local preferences and keyboard save behavior are preserved.

## Files and saves

The directory passed to the CLI defines the initial root. **Open folder** changes that root without restarting: the packaged macOS/Windows hosts use native directory pickers. macOS CLI mode uses its system picker; plain Windows CLI mode accepts an absolute directory path. The chosen directory becomes the boundary for file reads/writes and recursive watching. Selection cancellation preserves the current buffers and root. Successful switches to a different root clear old tabs after confirming unsaved edits and rotate the write token; reselecting the same root retains the token. Other browser tabs retain their buffers but require a reload before using the new workspace. The menu bar app remembers the selected root; initial startup uses the last workspace or an empty application-support workspace.

Discovery is recursive and skips hidden, vendor, and generated directories. The explorer includes the workspace root, expandable directories including empty ones, and non-DBML filenames (disabled). Only DBML files can be read or edited. Listings are bounded to 10,000 entries and 2,000 DBML files. Each file is an entrypoint. The bundled parser project API resolves explicit `use`/`reuse` imports from a virtual workspace file map; directory selection alone does not concatenate unrelated schemas. Import paths are relative to each importing file, including nested parent-relative paths within the root.

Each open file has an independent Monaco model, saved content/version, undo history, and view state. Save uses a captured source buffer and its expected disk version; if the file changed outside Studio, the backend returns HTTP 409 and the interface offers reload or explicit overwrite. Source files are never autosaved. Closing a dirty tab, changing folders, or leaving the page warns about unsaved edits. Unsaved buffers are not durably persisted across a browser restart.

The file **⋯** menu supports rename, move, and trash for all visible regular files; only DBML contents are editable. Dropping files on folders opens move confirmation. Rename/move keeps open editor models and undo history; DBML filenames retain their extension, and imports are not rewritten. Mutations check the explorer version and reject collisions, hidden paths, traversal, and symlinks. Trash stores files under `.dbml-studio-trash/item-*/` with original-path metadata in `restore.json`; recover through the system file manager. Trashing a dirty file confirms discarding local edits; other browser tabs retain detached buffers. Trash is workspace-local, not the operating system recycle bin. Use the explorer’s New folder button or a folder’s ⋯ menu to create directories. Folder menus also support Rename folder, preserving descendant open buffers, cursor state and undo history across browser tabs. Existing destinations and stale directory snapshots are rejected, the workspace root cannot be renamed, and DBML imports are not rewritten. Folder menus can trash the entire directory tree, including hidden/generated content and contained symlinks (links are moved without following their targets). The workspace root cannot be trashed. Folder trash uses a recursive metadata snapshot (up to 100,000 entries), rejects stale contents, confirms discarding local unsaved descendants, and keeps buffers in other tabs detached.

External changes reload an unmodified editor buffer; a dirty buffer receives a conflict. Layout changes are stored separately in browser local storage. The service reads existing sidecars for initial layout and does not rewrite them.

## API

| Endpoint | Behavior |
| --- | --- |
| `GET /api/workspace` | Workspace name/root, initial theme, local display capabilities, workspace write token, native-picker availability |
| `POST /api/workspace/open` | Select a native directory, or accept `{directory: absolutePath}`; replace root and watcher and rotate write token |
| `POST /api/directories` | Create one folder with `{path}`; parent must exist, collisions rejected |
| `GET /api/directory?path=…` | Recursive folder snapshot/version and contained entry count for trash confirmation |
| `POST /api/directories/rename` | Rename within the current parent with `{path, destination, version}`; update descendant tab paths and preserve buffers |
| `POST /api/directories/trash` | Trash a folder and all contents with `{path, version}` |
| `GET /api/directories?path=…` | Subfolders and parent within the allowed root |
| `GET /api/files?path=…` | Recursive `files` (DBML) and `entries` (directories/all regular filenames) within the chosen root |
| `GET /api/file?path=…` | Source, version hash, file identity, initial layout |
| `POST /api/file?path=…` | Create a new file without replacing an existing file |
| `PUT /api/file?path=…` | Save source if the expected version still matches disk |
| `POST /api/files/move` | Rename/move a visible regular file with `{path, destination, version}`; never replace a destination |
| `POST /api/files/trash` | Move a file with `{path, version}` into recoverable workspace trash |
| `POST /api/preview` | Compile an unsaved `{path, source, requestId}` without saving |
| `GET /api/workspace/events` | SSE file-change notifications |
| `GET /renderer/` | Original renderer with the Studio bridge |
| `GET /health` | Local service health |

Write and preview requests require JSON, the current workspace token, and same-origin requests. The server binds to 127.0.0.1, validates Host headers, restricts filesystem paths to the selected root, rejects escaping symlinks, and limits source/request sizes. There is no account connection or subscription API call. These are application boundaries for the local editing tool, not a claim of comprehensive security assessment.

## Verification and limits

Image export update (2026-11-07): production build and all 89 tests passed, no skips. Browser downloaded and visually verified a native-scale 4395 × 1788 dark PNG and light JPEG of the 19-table retail graph, and a 1076 × 1380 visible-area PNG at 2×. Real image formats/dimensions were checked with sips. Live zoom remained at 12% after full export. Both packages rebuilt and smoke checks passed; Windows backend ran under Mac Node, not Windows GUI.

Language intelligence update (2026-11-07): production build and all 84 tests passed, no skips. Browser verified completion, outline, folding, and imported-file definition navigation with a dirty entrypoint preserved. Both packages rebuilt and smoke checks passed; Windows backend ran under Mac Node, not Windows GUI.

Directory follow-up (2026-11-07): build and all 75 tests passed, no skips. Yab verified root/nested creation and recursive trash, including cancellation and confirmation with an unsaved descendant. Both portable packages rebuilt and smoke checks passed; Windows backend checks ran on Mac Node, with Windows GUI still unverified.

Explorer editing update (2026-11-07): production build and all 71 tests passed with Node 22.23.4, no skips. Yab verified rename/move preserving unsaved edits and undo, plus recoverable trash. Both packages rebuilt and backend smoke checks passed; Windows checks ran under Mac Node, not Windows GUI execution. Native drag/drop automation was inconclusive.

The latest implementation validation passed all 67 tests, with no skips (not rerun for the subsequent documentation-only handoff). Production build succeeded. Safari manual checks covered both themes including the actual canvas, directory selection, file creation, editing an unsaved two-table model, saving and reading it back from disk, compiler errors, undo recovery, tab switching, the 19-table retail model, native workspace selection, Vim keybindings, and the three-table module entrypoint.

The original parser and renderer assets remain dependencies. Monaco is a code editor, not the full VS Code extension host. Git integration, durable draft recovery, and headless original-renderer image export are not implemented. The existing SVG exporter remains a separate renderer and layout.

## PNG and JPEG export

Use **Export image** in the sidebar. Select PNG or JPEG, Full diagram or Visible area, and 1×/2×/3× resolution (default 1×). Full diagram includes the complete displayed scene with padding, renders at native scale for readable labels, and retains table/group positions and the selected detail/link mode. Visible area captures the current camera/zoom. Both use the current theme's opaque background, exclude DOM toolbars/editor controls, and download through the browser as `<diagram>.png` or `<diagram>.jpg`. Export does not save DBML or sidecar files. When source errors leave an older valid diagram visible, that displayed diagram is exported.

`web/diagram-export.mjs` uses the original renderer's public Konva stage API; `web/studio-bridge.js` handles same-origin/source-checked export requests and correlated Blob replies. The module is served at `GET /diagram-export.mjs`. It waits for fonts and stable scene bounds before capturing. Full export briefly normalizes the camera for synchronous offscreen drawing, then restores its exact position/scale in `finally` before yielding, preserving the live view. The renderer's custom shapes cannot be cloned safely. Pixel buffers are released after encoding. This captures the interactive renderer, not the independent CLI SVG layout, and adds no external dependencies.

Exports are bounded to 16 Mi pixels and 16,384 pixels per dimension to limit canvas memory. Oversized images offer a lower resolution or Visible area; unavailable/tainted canvases, encoding failures, cancellation and timeout have explicit handling. The implementation targets the known bundled 0.4.0 renderer. Browser export was tested on this Mac; actual Windows browser/tray execution remains unverified. Headless/CLI PNG/JPEG and PDF export are not implemented.

## DBML language intelligence

The editor provides LSP-style features through native Monaco providers, without a separate LSP process or JSON-RPC transport. `src/dbml-language.mjs` is a tolerant lexer/symbol index for editing assistance; it does not replace the original bundled parser. `ui/src/dbml-language.js` registers completion, folding, document-symbol, hover, and definition providers. Explicit Monaco folding, navigation, context-menu and quick-access contribution imports are required with the minimal editor API.

- `Ctrl+Space`: context-aware declaration snippets/keywords, SQL types, enum types, column/table settings, table/schema/alias references, qualified columns, enum members, table partials and relative import paths. Comments and literal/SQL-expression strings suppress ordinary completions.
- Gutter arrows or editor Fold/Unfold commands: brace/bracket blocks, nested indexes, multiline notes and comments; literal/comment braces do not create spurious structural folds. Incomplete blocks can still fold.
- `Cmd/Ctrl+Shift+O`: outline of objects and their columns/enum members.
- Hover: object/column details and definition location. `F12` or **DBML: Go to Definition** opens the correct editor file and line while preserving dirty tabs.
- `Cmd/Ctrl+Shift+P` or the editor context menu: editor commands, including folding and navigation.

Preview responses now include `language.symbols`, even when the compiler reports errors. `workspaceSources` collects the same bounded, validated disk/dirty-buffer source map for both the original compiler and the editor index, without duplicate reads. The editor index follows entrypoint imports, selective aliases, private `use` and re-exporting `reuse`; unrelated workspace files are not offered as objects. Source locations remain in the defining module. Completion rescans the active buffer immediately; imported metadata refreshes through the existing preview debounce and watcher. The tolerant index is an editing aid and can be approximate for ambiguous or severely malformed source. Formatting, symbol rename refactoring, references search and a general-purpose external LSP endpoint are not implemented.

An evaluated standalone [DBML Rust language server](https://github.com/kamal-hamza/dbml-language-server) lists completion and folding in its roadmap; using direct Monaco providers also avoids adding a target-specific executable to portable packages. Keyword/syntax references: [official DBML syntax](https://dbml.dbdiagram.io/docs/). The bundled 0.4.0 compiler remains the authority for this app's accepted syntax and module semantics.

## Vim mode

The sidebar Vim toggle uses `monaco-vim` 0.4.4, with the preference stored under `dbml-studio:vim`. The editor adapter is disposed/recreated when switching files, and disabled mode restores ordinary Monaco bindings. Normal/Insert/Visual and command/search status appear in the footer. `:w` calls the normal explicit-save flow, including conflict protection; Cmd/Ctrl+S remains available. The explicit Monaco `linesOperations` contribution import is required for Vim `o`/`O` to create lines; the minimal editor API alone does not register the adapter's insert-line action. Browser verification covered both commands, indentation, insertion and undo. Vite aliases the package ESM entry and its extensionless Monaco imports to the same Monaco modules used by Studio. This is a Vim keybinding adapter, not a full Vim runtime or plugin host.

## Module compilation

`src/dbml-project.mjs` registers workspace DBML sources beneath virtual POSIX `/workspace/` paths, keeping module resolution consistent on Windows and macOS without exposing the host filesystem to import traversal. `runtime.compileProject` creates a new bundled Parser, calls setDbmlSource for each source, and parses the selected entrypoint via parseDbmlProject. This preserves native selective-import, alias, use/reuse, references, and lineage semantics. A fresh parser per compilation avoids stale modules after deletion or workspace switches. Sources are bounded to 2 MB per file and 64 MB total. Hidden/vendor/generated paths remain excluded.

`POST /api/preview` accepts optional `buffers: [{path, source}]` for dirty open modules, overlays these on disk sources, and applies the active source last. Preview bodies allow up to 16 MB; all override paths are checked against the selected workspace. No preview writes files. Original compiler diagnostics retain the importing file path through the project compiler result, since the bundled public diagnostic conversion drops filenames. Monaco markers are scoped to their actual file and problems open imported files before revealing their line. External module changes schedule an active entrypoint preview even when its own buffer is unchanged. The legacy viewer also watches imported DBML files recursively, with a stat-based fallback for missed native filesystem events.

## Resume and platform status

See [handoff.md](handoff.md) for setup, artifact locations, last validation, and remaining work. Builds require original 0.4.0 assets; fresh source clones do not include those ignored archives. Acorn is a pinned npm dependency. The Windows x64 ZIP under `downloads/` is an intentional tracked artifact and must stay aligned with its SHA256SUMS.txt. Native Windows packaging is supported using the MSVC Native Tools prompt, but Windows compilation/execution has not been performed from this Mac. macOS Intel and Windows ARM64 are also unverified. Browser preferences are origin-local; native hosts currently use available random ports, so preference/layout persistence across native app restarts is not guaranteed.
