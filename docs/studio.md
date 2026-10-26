# DBML Studio

Studio adds an editing workspace to the original read-only viewer and CLI. It uses Vite 8.3.5, Monaco 0.56.0, the existing bundled parser, and the working 0.4.0 renderer. The lockfile pins dependencies; a DOMPurify 3.4.17 override resolves the sanitizer advisories in the editor dependency tree. The final dependency audit reported zero vulnerabilities.

## Run and build

From `dbdiagram-re/`:

```sh
npm ci
npm run build
npm run studio -- .. --port 4174
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

## Files and saves

The directory passed to the CLI defines the initial root. **Open folder** changes that root without restarting: macOS uses a native directory picker, while other platforms accept an absolute directory path. The chosen directory becomes the boundary for file reads/writes and recursive watching. Selection cancellation preserves the current buffers and root. Successful switches clear old tabs after confirming unsaved edits and rotate the write token. Other browser tabs retain their buffers but require a reload before using the new workspace. The menu bar app remembers the selected root; initial startup uses the last workspace or an empty application-support workspace.

Discovery is recursive and skips hidden, vendor, and generated directories. The explorer includes the workspace root, expandable directories including empty ones, and non-DBML filenames (disabled). Only DBML files can be read or edited. Listings are bounded to 10,000 entries and 2,000 DBML files. Files are independent models. Directory selection does not concatenate schemas or implement cross-file imports.

Each open file has an independent Monaco model, saved content/version, undo history, and view state. Save uses a captured source buffer and its expected disk version; if the file changed outside Studio, the backend returns HTTP 409 and the interface offers reload or explicit overwrite. Source files are never autosaved. Closing a dirty tab, changing folders, or leaving the page warns about unsaved edits. Unsaved buffers are not durably persisted across a browser restart.

External changes reload an unmodified editor buffer; a dirty buffer receives a conflict. Layout changes are stored separately in browser local storage. The service reads existing sidecars for initial layout and does not rewrite them.

## API

| Endpoint | Behavior |
| --- | --- |
| `GET /api/workspace` | Workspace name/root, initial theme, local display capabilities, workspace write token, native-picker availability |
| `POST /api/workspace/open` | Select a native directory, or accept `{directory: absolutePath}`; replace root and watcher and rotate write token |
| `GET /api/directories?path=…` | Subfolders and parent within the allowed root |
| `GET /api/files?path=…` | Recursive `files` (DBML) and `entries` (directories/all regular filenames) within the chosen root |
| `GET /api/file?path=…` | Source, version hash, file identity, initial layout |
| `POST /api/file?path=…` | Create a new file without replacing an existing file |
| `PUT /api/file?path=…` | Save source if the expected version still matches disk |
| `POST /api/preview` | Compile an unsaved `{path, source, requestId}` without saving |
| `GET /api/workspace/events` | SSE file-change notifications |
| `GET /renderer/` | Original renderer with the Studio bridge |
| `GET /health` | Local service health |

Write and preview requests require JSON, the current workspace token, and same-origin requests. The server binds to 127.0.0.1, validates Host headers, restricts filesystem paths to the selected root, rejects escaping symlinks, and limits source/request sizes. There is no account connection or subscription API call. These are application boundaries for the local editing tool, not a claim of comprehensive security assessment.

## Verification and limits

All 57 tests passed, with no skips. Production build succeeded. Safari manual checks covered both themes including the actual canvas, directory selection, file creation, editing an unsaved two-table model, saving and reading it back from disk, compiler errors, undo recovery, tab switching, and the 19-table retail model.

The original parser and renderer assets remain dependencies. Monaco is a code editor, not the full VS Code extension host. Cross-file model composition, Git integration, durable draft recovery, file deletion/rename, and headless original-renderer image export are not implemented. The existing SVG exporter remains a separate renderer and layout.

## Vim mode

The header Vim toggle uses `monaco-vim` 0.4.4, with the preference stored under `dbml-studio:vim`. The editor adapter is disposed/recreated when switching files, and disabled mode restores ordinary Monaco bindings. Normal/Insert/Visual and command/search status appear in the footer. `:w` calls the normal explicit-save flow, including conflict protection; Cmd/Ctrl+S remains available. Vite aliases the package ESM entry and its extensionless Monaco imports to the same Monaco modules used by Studio. This is a Vim keybinding adapter, not a full Vim runtime or plugin host.
