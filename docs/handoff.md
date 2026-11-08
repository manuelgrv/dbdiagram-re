# Development handoff

Updated 2026-11-07. The explorer editing update below supersedes the October validation snapshot. Earlier handoff details remain below for reference.

## Explorer editing update — 2026-11-07

Implemented per-file Rename, Move to folder, and recoverable Trash menus, plus folder drop targets. Operations support visible regular filenames; directory mutation is not supported. Unsaved Monaco models/undo history survive rename/move, including later reuse of the original filename. Existing destinations, stale explorer versions, hidden paths, traversal and symlink ancestors are rejected. Imports are not rewritten. Trash is workspace-local `.dbml-studio-trash/item-*/files/`, with original-path metadata in the adjacent `restore.json`; restore with a system file manager. Other browser tabs receive move/trash events and retain unsaved buffers.

Validation: production build succeeded with cached Node 22.23.4; all **71 tests passed, no skips**. The shell defaults to Node 20, which cannot run this Vite build; use Node 22.12+. Yab browser checks covered rename/move with unsaved text and working undo, plus trashing a non-DBML file. Native drag/drop gestures were inconclusive in automation. macOS arm64 and Windows x64 packages rebuilt; relocated macOS check and Windows packaged backend check passed. The Windows check ran under **Mac Node**, not Windows. Windows GUI execution remains unverified.

Refreshed the intentional tracked Windows ZIP/checksum: `739641177d86d5a34f533d34f63e78e35c7610b22d6e5c3e36a19ff44ca31167`. No commit, push or publication. Pre-existing documentation changes from the handoff remain in the working tree.

## Where the project lives

The repository is `dbdiagram-re/` inside the original outer workspace. Run Git/npm commands from that directory. The outer workspace also has original `retail_lineage.dbml` and `.dbdiagram` files; preserve them. Repository-local examples under `examples/` are the build/test fixtures, and no build should require parent files.

At the start of this handoff, the tree was clean at commit `22ac044` (`module-functionality`). The module fix and refreshed Windows ZIP were already committed. This session changes documentation only; no new commit or push has been made. Check `git status` rather than assuming this snapshot stays current.

## What works

- Browser workspace with directory/file explorer, Monaco tabs, explicit save/conflict handling, diagnostics, live unsaved previews, and original interactive renderer.
- Open folder changes the workspace root. Native macOS/Windows hosts own their directory chooser; plain Windows CLI uses a path field. All file access stays within the selected root. Hidden/vendor/generated entries are excluded; non-DBML filenames are visible but disabled.
- Sidebar/editor collapse independently. Light/dark themes and optional Vim bindings apply to the editor; Vim `:w` uses normal safe saving.
- Native DBML `use`/`reuse` modules resolve relative to each importing file, including optional extensions, aliases, nested imports, and parent-relative imports inside the workspace. Open the entrypoint to render its combined model. Preview includes dirty buffers from open imported files. Errors identify their file; imported-file changes refresh previews.
- CLI SVG export, read-only live viewer, graph/lineage tracing, and extension analysis tools.
- Portable macOS Apple Silicon app with menu bar Open/Quit and a bundled runtime. Windows x64 tray app has equivalent host behavior and a bundled runtime.

The parser/interactive renderer still come from official dbdiagram **0.4.0** packages. Static SVG layout is our implementation. Official 0.5.3 has a documented missing-lineage renderer regression; do not silently switch versions. Account/subscription behavior is not part of routine app work.

## Fast restart from source

Use Node.js 22.12+ (or another version supported by the pinned Vite), Git, and npm. Python is only needed for explicit reference downloads or macOS cross-packaging.

```sh
npm ci
# Skip if official 0.4.0 assets are installed/discoverable:
python3 scripts/fetch_reference.py 0.4.0
npm run build
npm run studio -- examples --port 4174
```

On Windows use `npm.cmd` if PowerShell selects a blocked npm.ps1 launcher, and `py -3` instead of python3. Open http://127.0.0.1:4174 and select a workspace. Rebuild the UI after frontend edits in production mode; `npm run dev` uses Vite hot reload and currently starts with the parent directory. For an explicit development root: `npm run studio -- examples --dev --port 4174`.

`src/environment.mjs` discovers official assets under installed VS Code/Cursor extension directories or `artifacts/reference/0.4.0/extension/`. `DBDIAGRAM_EXTENSION_DIR` overrides that path. Acorn 8.19.0 is pinned and installed by npm ci; no separate Acorn install is needed. Network restrictions may require approved sources for npm/official extension assets.

Check active processes/ports before starting another server; this documentation does not assert which instances are currently running. Close native apps through their tray/menu bar Quit action, or CLI instances with Ctrl+C. Closing a browser does not stop its native host. Do not terminate unrelated processes.

## Current example and module rules

Open `examples/modules/main.dbml` with a workspace containing `examples/modules/`: it imports the `common/` and `sales/` modules and renders **3 tables / 3 lineage edges**. `examples/retail_lineage.dbml` has **19 tables / 15 references / 129 lineage edges**.

Use `Dep` for lineage and `Ref` for foreign keys. Every edge in a single Dep block must have the same table/column level. `use` remains private to the importing file; `reuse` re-exports it. Sources are registered under virtual POSIX `/workspace/` paths on both OSes, preventing host path traversal. Limits are 2 MB/file, 64 MB total workspace DBML source, and 16 MB/preview request. Unrelated files are not concatenated.

## Builds and retrieval

### Ready-to-run Windows build without a compiler

The user's work computer could clone the repository but could not retrieve release attachments. Preserve the explicit regular-Git binary exception: `downloads/DBML-Studio-windows-x64.zip` plus `downloads/SHA256SUMS.txt` and README. It is not Git LFS. See [the download instructions](../downloads/README.md) for pull/extract/run commands. Keep the adjacent resources folder with the executable.

Checksum verified during this doc-only session: `752e3ca38167530c52cdfbc53bb5325e5b9890aebb03d049f498dbc7de83c284`. The archive includes the module fix. Replacing the ZIP requires updating the checksum too; binary revisions grow Git history.

### Package macOS

```sh
npm run package:macos
node scripts/check-macos.mjs
```

Builds `dist/DBML-Studio-macos-arm64.zip` on this machine. `-- x64` selects Intel but is unverified. macOS builds are ad-hoc signed, without Developer ID/notarization.

### Package Windows on this Mac

```sh
npm run package:windows
node "dist/windows-x64/DBML Studio/resources/project/check-windows.mjs"
```

Cross-build uses cached/downloaded LLVM-MinGW and official SHA-256-checked Node 22. Windows PE target/imports are inspected and the compiler runtime is statically linked. The shown check runs under **Mac Node**, not Windows; do not describe it as Windows execution. Output is `dist/windows-x64/DBML Studio/` plus `dist/DBML-Studio-windows-x64.zip`. `-- arm64` selects a separate unverified target.

### Build the exe directly on Windows

Requires Visual Studio Build Tools 2022, Desktop development with C++, and Windows SDK. From **x64 Native Tools Command Prompt for VS 2022**, run `npm.cmd ci`, obtain the official 0.4.0 assets if needed, then `npm.cmd run package:windows`. This uses cl.exe (/MT), built-in PowerShell/.NET ZIP creation, and the installed Node binary plus its LICENSE. Set `DBML_NODE_DIR` to a matching approved distribution if the managed Node installation omits that license. This path is implemented but has not been executed on Windows here. The user's current work computer lacks the C++ tools, hence the tracked ready-made ZIP.

After app changes, build/check packages, replace the tracked Windows ZIP and checksum deliberately, and commit/push only when authorized. GitHub Releases remain the normal place for additional release assets. Do not put node_modules, downloaded compiler/vendor packages, or other dist/artifacts output in Git. Bundled original package redistribution permissions remain a separate unresolved publishing consideration.

## Last validation and limits

Last implementation validation, before this documentation-only session:

- **67 tests passed, zero skipped** via npm run verify; this includes module imports, dirty buffers, path boundaries, diagnostics, live reload, Windows PE inspection, and prior compiler/viewer/workspace checks.
- Production frontend build and macOS/Windows packaging succeeded.
- macOS relocation/safe-save smoke check passed; Windows packaged backend and module example passed under the Mac host runtime.
- Safari visibly rendered the module entrypoint with three tables and lineage. Earlier Safari checks covered both themes, editor diagnostics/undo, explicit save, Vim, collapsible panels, and native folder selection.

No tests or builds were rerun for this doc-only session. The Windows ZIP digest was checked and doc links/content reviewed.

Outstanding validation: actual Windows tray/picker/browser/duplicate-instance/Quit behavior and MSVC compilation; macOS Intel and Windows ARM64. No Windows VM/Wine is available in this workspace. Full browser interaction tests are not automated. Draft buffers are not durable across browser restarts. Preferences/layouts use browser-origin localStorage; native random ports can change that origin across launches. No PNG/PDF export or headless original-renderer capture. Renderer-originated source editing is disabled; use Monaco. Diagram SQL metadata does not execute ETL.

## Source map and next-session checklist

| Area | Start here |
| --- | --- |
| Workspace API, path bounds, safe saves | src/studio-server.mjs, src/workspace.mjs |
| Module registration / compiler harness | src/dbml-project.mjs, src/runtime.mjs |
| Editor, explorer, Vim, diagnostics | ui/src/main.js, ui/src/style.css |
| Renderer adapter | web/studio-bridge.js |
| CLI / SVG / read-only viewer | src/cli.mjs, src/render.mjs, src/server.mjs |
| Native hosts | macos/StudioMenu.swift, windows/StudioTray.cpp |
| Packaging / Windows PE validation | scripts/package-macos.mjs, scripts/package-windows.mjs, scripts/windows-pe.mjs |
| Regression / module checks | test/workspace.test.mjs, test/modules.test.mjs, test/viewer.test.mjs |

1. Read [AGENTS.md](../AGENTS.md), this handoff, then the relevant source; check Git status and existing listeners.
2. Preserve user model edits and the intentional tracked Windows ZIP. Use targeted checks for changes; run full checks when appropriate. Reference-version tests may skip if 0.5.3 assets are absent—report actual skips.
3. Keep historical reverse-engineering reports distinct from current application documentation. Do not claim standalone renderer ownership or Windows validation not performed.
4. Resume the user's next request; do not automatically publish releases, push commits, or make account/system changes.

## Directory editing follow-up — 2026-11-07

Added New folder in the explorer header and folder menus, plus Trash folder and contents. Folder trash moves the whole tree (including hidden/generated files and symlinks without following their targets) into recoverable workspace trash. The workspace root cannot be trashed. Recursive metadata snapshots reject stale contents; local dirty descendants require confirmation, while other tabs retain detached buffers. Folder creation rejects collisions, unsafe paths and symlink parents.

Validation: build and all **75 tests passed, no skips** with Node 22.23.4. Yab verified root/nested folder creation, cancelling the dirty-descendant confirmation, and confirmed recursive trash closing contained tabs. macOS arm64 and Windows x64 packages rebuilt; relocated macOS smoke check and Windows backend check under Mac Node passed. Actual Windows GUI execution remains unverified. Refreshed tracked Windows ZIP SHA-256: `181fc03aa9f2ebc9beb0d0201ed509eab42f53bd46ec038a8bb9b145ac7273c6`. No commit or push.

## Vim newline fix — 2026-11-07

Registered Monaco's `contrib/linesOperations/browser/linesOperations.js` contribution in `ui/src/main.js`. The minimal editor API did not register `editor.action.insertLineAfter`, which monaco-vim uses for `o` and most `O` commands. Before the fix, the browser entered Insert mode without changing the buffer. Keep this import alongside the other Monaco contributions.

Validation: browser reproduced the failure before the fix and verified indented `o`, `O` above an interior line, `O` at the first line, insertion and undo after the fix. Production build and all **75 tests passed, no skips**, under Node 22.23.4. Both packages rebuilt; relocated macOS and Windows backend (under Mac Node) smoke checks passed. Actual Windows GUI execution remains unverified. Refreshed Windows ZIP SHA-256: `e88798986ca89dee208170a6868a693ce8d92762e58db5f83ca5a9a767531350`. No commit or push.

## Sidebar controls layout — 2026-11-07

Removed the full-width header. Branding/workspace name, Save, theme, Vim and editor visibility now live in the sidebar. Tabs/editor/diagram start at the top, recovering the former 64px header area (56px at the narrow breakpoint). Sidebar collapse is at its top-right; a bottom status-bar button restores it when hidden, including when both panels are hidden. Existing preferences and keyboard saving remain. Removed obsolete header CSS.

Validation: production build and all **75 tests passed, no skips** under Node 22.23.4. Browser visually checked both themes and exercised editor collapse/restore, sidebar collapse/restore with both hidden, Vim and Save from the sidebar. Both packages rebuilt and smoke checks passed; Windows backend check used Mac Node, with actual Windows GUI still unverified. Updated tracked Windows ZIP SHA-256: `95e713468cd26e4805412a8eaf8957042cbb17d3592e78e65301edff4beeb172`. No commit or push.

## Directory rename — 2026-11-07

Added Rename folder to non-root folder menus, backed by `POST /api/directories/rename`. Rename stays within the current parent, preserves the entire tree, and rejects existing destinations, unsafe/symlink paths and stale recursive snapshots. Descendant open buffers keep their Monaco models/undo history and receive updated paths in all connected tabs; collapsed folder state follows the new path. DBML imports remain manual edits. Windows uses its native no-replace directory rename behavior after releasing the destination reservation; actual Windows execution is still unverified.

Validation: production build and all **77 tests passed, no skips**. Browser verified parent rename with a dirty descendant, path updates in a second tab and working undo. Both packages rebuilt; relocated macOS and Windows backend smoke checks passed (Windows backend under Mac Node). Refreshed tracked Windows ZIP SHA-256: `4af0de33bc9a1ae27bca3d5948fcaf9d07795fe251a6b1cb009d85ee1a642f0a`. No commit or push.

## DBML intelligence and folding — 2026-11-07

Added local Monaco completion, folding, outline, hover and Go to Definition. Shared tolerant editor metadata lives in `src/dbml-language.mjs`, providers in `ui/src/dbml-language.js`. This is LSP-style editor support, not an external LSP/JSON-RPC server. Original compiler semantics and diagnostics remain unchanged. `workspaceSources`/`compileSources` split source collection from compilation so preview returns scoped `language.symbols` even on parser errors, using the same validated disk/dirty-buffer source map. The editor index follows use/reuse privacy, selective imports and aliases (selective alias names enter the default schema, as verified against the bundled compiler). It excludes unrelated entrypoints; active local edits scan immediately, imported metadata follows preview debounce/watching. The tolerant editing index is approximate for severely malformed/ambiguous syntax, not an independent full DBML compiler.

Suggestions cover declaration snippets, keywords, types, enums, table/column settings, schemas, table aliases, columns, enum members, partials and relative module paths. Folding handles braces/brackets, nested indexes, multiline notes and comments, ignoring braces inside literals/comments. Definition navigation preserves dirty tabs and opens defining module paths. Required explicit Monaco imports now include folding/navigation/context-menu and standalone quick-access contributions. Shortcuts: Ctrl+Space completion, Cmd/Ctrl+Shift+O outline, F12 or DBML: Go to Definition, Cmd/Ctrl+Shift+P commands; fold via gutter arrows or editor commands.

Validation: production build and all **84 tests passed, no skips**, including seven new language-service tests. Browser verified suggestions on an incomplete imported reference, accepting a column, keyword snippets, outline, folding, and cross-file definition navigation retaining a dirty entrypoint. Both packages rebuilt; relocated macOS and Windows packaged backend smoke checks passed (Windows backend under Mac Node). Actual Windows GUI execution remains unverified. Refreshed tracked Windows ZIP SHA-256: `66f119c8d3559859e9ed4307a67b3f1cade00173ddaa144f7eff3b08c5352244`. No commit or push. See docs/studio.md for architecture and non-goals (no formatting, symbol rename refactoring, references search or external LSP endpoint).

## PNG/JPEG UI export — 2026-11-07

Added Export image in the sidebar, with PNG/JPEG, Full diagram/Visible area and 1×/2×/3× resolution (default 1×). Uses the original interactive renderer's Konva stage via `web/diagram-export.mjs`, dynamically imported by the source/origin-checked Studio bridge and served at `/diagram-export.mjs`. Full export uses complete scene bounds in world coordinates and native scale so labels remain readable at low on-screen zoom. Camera position/scale are normalized only for synchronous offscreen capture and restored before yielding; the custom renderer shapes cannot be cloned. Wait for stable bounds/fonts after asynchronous auto-arrangement. Visible export preserves current camera framing; both use opaque theme backgrounds and exclude DOM controls. The displayed last valid graph can be exported when current DBML has errors. No source/layout sidecar writes or external dependencies. Maximum 16 Mi pixels / 16,384px per dimension; clear errors and lower-resolution/visible-area fallback. Details in docs/studio.md.

Validation: production build and all **89 tests passed, no skips**, including five export tests for bounds, limits, camera restoration, encoding failure and same-origin module delivery. Browser downloaded and visually checked the full 19-table retail graph with connections/groups/text as 4395×1788 dark PNG and light JPEG; sips confirmed real codecs/dimensions. Also verified 1076×1380 visible-area PNG at 2× and unchanged live 12% zoom after full exports. Both packages rebuilt; relocated macOS and Windows packaged backend smoke checks passed (Windows backend under Mac Node). Actual Windows GUI execution remains unverified. Refreshed tracked Windows ZIP SHA-256: `d0ec5513830b2fa5d5bb808324dac7ce58551bd613fbf5908e4aa0137ecd5e6a`. No commit or push. Headless/CLI PNG/JPEG and PDF remain unimplemented; earlier handoff statements saying no UI PNG export are superseded by this update.
