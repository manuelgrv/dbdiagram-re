# Agent context

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

The same `scripts/package-windows.mjs` now supports win32 (MSVC /MT, local Node runtime, built-in PowerShell/.NET ZIP creation) and darwin (LLVM-MinGW cross-build, official runtime ZIP, Python ZIP creation). Do not ask Windows users to use the Mac cross-compiler. `VCToolsInstallDir` must be set by the Native Tools prompt; PE inspection enforces the actual requested architecture and GUI subsystem. `scripts/windows-pe.mjs` performs platform-independent PE/import inspection for both paths. Acorn is now a pinned devDependency, removing the extra npm-install step on a fresh clone. Windows-native execution remains unverified on this Mac; document that limit explicitly. User needs to commit/push these changes before pulling them on the work machine; do not push without authorization.

## Intentional checked-in Windows build

At the user's request, downloads/DBML-Studio-windows-x64.zip is now an explicit exception to source-only tracking, for retrieval through git clone/pull without a C++ compiler or separate Release asset download. Normal Git binary (not LFS); .gitattributes marks downloads/*.zip binary. The .gitignore whitelist allows only this ZIP, its SHA256SUMS.txt, and downloads/README.md. Preserve this user-authorized exception. Other dist/artifacts/node_modules remain ignored. Keep the checksum aligned when replacing the ZIP; Windows UI execution is still unverified. Do not upload/push automatically without clear session authorization.

## DBML module fix

`src/dbml-project.mjs` supplies a workspace-bounded virtual POSIX file map to `runtime.compileProject` (bundled Parser.setDbmlSource + parseDbmlProject). Studio had previously used the stateless single-file API, so imports were never resolved. Keep the original compiler's use/reuse, selective-import, alias, Ref, and Dep semantics; do not replace this with text concatenation. Active source and dirty module buffers are preview overlays, without saves. Payload buffers use workspace-relative paths and go through Workspace.resolve. Source limits: 2 MB/file, 64 MB/project, 16 MB preview request. Imported diagnostics preserve their file path and open the correct editor file; disk changes trigger entrypoint previews. Legacy serve/CLI share project compilation; run CLI from project root when imports use parent paths. Viewer watches project DBML changes with stat-poll fallback. Examples: examples/modules/main.dbml and its common/sales directories. Tests: test/modules.test.mjs. Rebuild both packages and refresh the intentional downloads Windows ZIP/checksum after fixes. Windows UI execution remains unverified.

Module fix validation: all 67 tests passed, no skips. Safari visibly rendered examples/modules/main.dbml with three imported/declared tables and three lineage edges. macOS and Windows packages rebuilt; macOS relocation smoke check passed. Windows packaged backend/module example passed under host Node only, not Windows execution. Refreshed downloads/DBML-Studio-windows-x64.zip and SHA256SUMS.txt. No commit/push performed.
