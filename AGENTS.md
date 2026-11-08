# Agent context

Updated 2026-11-07. Explorer editing is implemented; start with [docs/handoff.md](docs/handoff.md) for the consolidated resume guide. This repository was clean at commit 22ac044 before the documentation-only handoff; check current status before assuming any pending commit/push work.

This directory is the Git repository root. The original working directory had additional parent files; builds and tests must not require those files. The complete retail test model and optional layout fixture are under `examples/`.

## Project

DBML Studio provides a CLI, Vite/Monaco editor, workspace explorer, live diagram rendering, light/dark themes, Vim toggle, and portable native tray apps. Read `README.md` and `docs/studio.md` for usage and architecture. Source is under `src/`, `ui/`, and `web/`; native hosts are `macos/StudioMenu.swift` and `windows/StudioTray.cpp`.

The interactive renderer and parser still come from the official dbdiagram 0.4.0 extension. The SVG renderer is our own. Do not claim the app is an independent reimplementation. Version 0.5.3 has a known lineage renderer regression; prefer 0.4.0. `src/environment.mjs` discovers installed or archived extension packages and supports `DBDIAGRAM_EXTENSION_DIR` / `ACORN_PATH` overrides. See README for dependency setup; official package artifacts are deliberately ignored.

## Build and verification

- `npm ci`, then `npm run build`; production frontend is `dist/studio/`.
- `npm run studio -- examples --port 4174` starts the local workspace. Check existing listeners before starting services; a CLI instance on 4174 may already exist.
- `npm run verify` runs the full suite (67 tests at the module fix).
- `npm run package:macos` builds a macOS app and ZIP for host architecture; `-- x64` selects Intel.
- `npm run package:windows` builds Windows x64: on Windows use the x64 Native Tools prompt with MSVC C++/Windows SDK; it bundles the installed Node binary and LICENSE (override directory with DBML_NODE_DIR). No cross-toolchain downloads on Windows. On macOS it downloads the official Node runtime/LLVM-MinGW compiler and cross-compiles. `-- arm64` selects ARM64; compiler environment and Node target must match. Python is required only by the macOS packaging path or explicit reference downloader.
- `node scripts/check-macos.mjs` checks the relocated macOS package. Windows packages include `Check Windows.cmd`; the equivalent packaged backend script can run with a host Node for limited checks.

macOS native picker and Vim behavior have been verified in Safari. Windows x64 was cross-compiled and its PE target/imports inspected; Windows GUI execution remains unverified. Never describe Mac-hosted backend checks as Windows execution. Builds are unsigned (macOS is ad-hoc signed), without release certificates/notarization.

## Behavior to preserve

Open folder changes the workspace root, updates its recursive watcher, and rotates the write token. Cancellation retains the current workspace; selecting the same root keeps the token. Other tabs preserve buffers but require reload after another tab changes the root. Explorer includes empty directories and non-DBML filenames; only DBML files are editable. Saves are explicit with content-version conflict checks, path containment, and symlink checks. Do not overwrite user buffers or model files incidentally.

Sidebar and editor collapse independently. Theme, panel, and Vim preferences are browser-local. Vim uses monaco-vim 0.4.4 and `:w` invokes the normal safe save flow. Adapter ESM/Monaco import aliases in Vite are required. The native hosts use stdout/stdin picker messages; Quit owns and stops the backend. Windows uses a Job Object. No account/subscription changes are part of routine work.

Keep `Dep` table-level and column-level declarations in separate blocks; the parser rejects mixing edge levels in a block. Each DBML file is a separate entrypoint; explicit use/reuse imports combine modules for that entrypoint. Preserve package provenance and original notices.

## Git and releases

Track source, build/check scripts, tests, examples, docs, this context, and npm manifests/lockfile. Do not track `dist/`, `artifacts/` (downloaded binaries, vendor assets, recovered code, analysis output), `node_modules/`, local secrets, logs, or caches. Upload generated ZIPs as GitHub Release assets. Check redistribution permissions for bundled official renderer/parser assets before public distribution. Do not publish, commit, or upload unless the session authorizes it.

## Windows-native packaging update

The same `scripts/package-windows.mjs` now supports win32 (MSVC /MT, local Node runtime, built-in PowerShell/.NET ZIP creation) and darwin (LLVM-MinGW cross-build, official runtime ZIP, Python ZIP creation). Do not ask Windows users to use the Mac cross-compiler. `VCToolsInstallDir` must be set by the Native Tools prompt; PE inspection enforces the actual requested architecture and GUI subsystem. `scripts/windows-pe.mjs` performs platform-independent PE/import inspection for both paths. Acorn is now a pinned devDependency, removing the extra npm-install step on a fresh clone. Windows-native execution remains unverified on this Mac; document that limit explicitly. The native packaging changes were already committed by the user before the handoff. Check actual Git status/history before suggesting another commit; do not push without authorization.

## Intentional checked-in Windows build

At the user's request, downloads/DBML-Studio-windows-x64.zip is now an explicit exception to source-only tracking, for retrieval through git clone/pull without a C++ compiler or separate Release asset download. Normal Git binary (not LFS); .gitattributes marks downloads/*.zip binary. The .gitignore whitelist allows only this ZIP, its SHA256SUMS.txt, and downloads/README.md. Preserve this user-authorized exception. Other dist/artifacts/node_modules remain ignored. Keep the checksum aligned when replacing the ZIP; Windows UI execution is still unverified. Do not upload/push automatically without clear session authorization.

## DBML module fix

`src/dbml-project.mjs` supplies a workspace-bounded virtual POSIX file map to `runtime.compileProject` (bundled Parser.setDbmlSource + parseDbmlProject). Studio had previously used the stateless single-file API, so imports were never resolved. Keep the original compiler's use/reuse, selective-import, alias, Ref, and Dep semantics; do not replace this with text concatenation. Active source and dirty module buffers are preview overlays, without saves. Payload buffers use workspace-relative paths and go through Workspace.resolve. Source limits: 2 MB/file, 64 MB/project, 16 MB preview request. Imported diagnostics preserve their file path and open the correct editor file; disk changes trigger entrypoint previews. Legacy serve/CLI share project compilation; run CLI from project root when imports use parent paths. Viewer watches project DBML changes with stat-poll fallback. Examples: examples/modules/main.dbml and its common/sales directories. Tests: test/modules.test.mjs. Rebuild both packages and refresh the intentional downloads Windows ZIP/checksum after fixes. Windows UI execution remains unverified.

Module fix validation: all 67 tests passed, no skips. Safari visibly rendered examples/modules/main.dbml with three imported/declared tables and three lineage edges. macOS and Windows packages rebuilt; macOS relocation smoke check passed. Windows packaged backend/module example passed under host Node only, not Windows execution. Refreshed downloads/DBML-Studio-windows-x64.zip and SHA256SUMS.txt. The user subsequently committed this work as 22ac044 (module-functionality); no assistant commit/push was performed.

## Resuming after the pause

Read docs/handoff.md before new work. It records the last 67-test baseline, package locations, Windows validation limits, original asset setup, and the tracked ZIP exception. Current product docs are README.md and docs/studio.md; the extension reverse-engineering reports describe the original package investigation. This final session updates documentation only and verifies the tracked ZIP digest; do not claim tests/builds were rerun today. Runtime processes are transient and must be checked afresh. Browser-origin localStorage plus random native ports means cross-launch settings/layout persistence is not guaranteed; unsaved buffers are never durable across restart.

## Explorer editing update — 2026-11-07

Implemented per-file Rename, Move to folder, and recoverable Trash menus, plus folder drop targets. Operations support visible regular filenames; directory mutation is not supported. Unsaved Monaco models/undo history survive rename/move, including later reuse of the original filename. Existing destinations, stale explorer versions, hidden paths, traversal and symlink ancestors are rejected. Imports are not rewritten. Trash is workspace-local `.dbml-studio-trash/item-*/files/`, with original-path metadata in the adjacent `restore.json`; restore with a system file manager. Other browser tabs receive move/trash events and retain unsaved buffers.

Validation: production build succeeded with cached Node 22.23.4; all **71 tests passed, no skips**. The shell defaults to Node 20, which cannot run this Vite build; use Node 22.12+. Yab browser checks covered rename/move with unsaved text and working undo, plus trashing a non-DBML file. Native drag/drop gestures were inconclusive in automation. macOS arm64 and Windows x64 packages rebuilt; relocated macOS check and Windows packaged backend check passed. The Windows check ran under **Mac Node**, not Windows. Windows GUI execution remains unverified.

Refreshed the intentional tracked Windows ZIP/checksum: `739641177d86d5a34f533d34f63e78e35c7610b22d6e5c3e36a19ff44ca31167`. No commit, push or publication. Pre-existing documentation changes from the handoff remain in the working tree.

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
