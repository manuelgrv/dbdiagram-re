# DBML Studio and CLI

A local DBML workspace with a Monaco code editor, directory explorer, live diagrams, safe saves, and synchronized light/dark themes. The project also includes a rendering CLI and reproducible analysis of the official dbdiagram extension.

## Editing workspace

```sh
npm ci
npm run build
npm run studio -- .. --port 4174
```

Open `http://127.0.0.1:4174`. Pass any directory you want to work in instead of `..`. Use **Open folder** to choose a new workspace anywhere on your Mac, without restarting. Other operating systems show an absolute directory path field. The explorer shows the workspace root, expandable directories (including empty ones), and files, excluding hidden, generated, and vendor content. DBML files open in the editor; other filenames are visible but disabled. Each file is a separate diagram; directory discovery does not merge files.

- Open files in tabs with independent undo history and cursor/scroll state.
- Edit in Monaco with DBML highlighting, snippets, search, and clickable compiler diagnostics.
- Preview unsaved changes automatically after a short debounce. The last valid diagram remains visible while fixing syntax errors.
- Save with **Save** or `Cmd/Ctrl+S`. External changes reload clean buffers; dirty buffers show a conflict instead of being overwritten.
- Create `.dbml` files with **New diagram**. Closing a dirty tab or switching folders asks before discarding edits.
- Switch **Light mode / Dark mode** in the header. The preference applies to Monaco, the interface, and the diagram and persists in the browser.
- Use **Sidebar** and **Editor** in the header to collapse either panel independently, or hide both for a diagram-only workspace. The choices persist in your browser; restoring the editor keeps its unsaved buffer, undo history, and split width.
- Toggle **Vim on / Vim off** in the header for modal editing. The preference persists; a status indicator shows Normal/Insert/Visual mode, and `:w` saves the current diagram.
- Drag the center divider to resize the editor and preview.

The application uses Vite and Monaco, with the original working renderer isolated in an iframe. Local Node APIs read/write only `.dbml` files under the CLI-selected root. The existing `serve` command remains a read-only, single-file viewer.

For development with Vite hot reload:

```sh
npm run dev
# Or choose an explicit directory and port:
npm run studio -- /path/to/diagrams --dev --port 4174
```

`studio` uses the built UI when `dist/studio/index.html` exists, otherwise starts Vite in middleware mode. Rebuild after changing frontend source when running production mode. See [studio architecture and behavior](docs/studio.md).

The default target is **0.4.0**, the installed version with working lineage. **0.5.3** is also inspected when its directory remains available. No extension files are modified by these tools. Generated extracts stay under the ignored `artifacts/` directory.

## Portable macOS app

The macOS package includes a standalone official Node runtime, the production frontend, Acorn, and the original 0.4.0 parser/renderer assets. The destination machine needs neither Node/npm nor VS Code. It opens in your default browser and runs offline on localhost.

```sh
npm run package:macos
# Build for Intel instead of the current architecture:
npm run package:macos -- x64
```

Build on macOS after installing development dependencies. Packaging downloads the latest Node 22 runtime for the selected architecture from nodejs.org, verifies its published SHA-256, and records the runtime URL/hash in the app's `PROVENANCE.json`. Generated files are ignored under `dist/`.

For Apple Silicon, use `dist/DBML-Studio-macos-arm64.zip`; Intel builds use `dist/DBML-Studio-macos-x64.zip`. Extract the ZIP, move **DBML Studio.app** anywhere, and double-click it. Use **Open folder** in the browser to choose your workspace; the browser opens on an available local port. Use the **DBML Studio menu bar icon** to reopen the browser or choose **Quit DBML Studio** to stop the server. There is no persistent popup window. The app remembers the last workspace and reopening it reuses the existing menu bar instance. This is an ad-hoc signed local build, without Developer ID signing or notarization. Only Apple Silicon has been tested on this machine; build Intel separately for an Intel Mac.

For terminal use without the native dialogs:

```sh
"dist/macos-arm64/DBML Studio.app/Contents/MacOS/DBML Studio" /path/to/diagrams --headless
```

Press Ctrl+C to stop. The app retains original extension package notices and includes the Node license; it packages the existing renderer rather than replacing it with an independent implementation. Run `node scripts/check-macos.mjs` after packaging to test relocation, startup without system Node or extension discovery, frontend/renderer delivery, lineage preview, and saving.

## Portable Windows app

Use `dist/DBML-Studio-windows-x64.zip` for Windows 10/11 on Intel/AMD x64. Extract the entire ZIP, then double-click **DBML Studio.exe**. Node.js, npm, and VS Code are included or unnecessary on the destination machine. No installation or administrator rights are needed.

The native notification-area icon offers **Open Studio** and **Quit DBML Studio** (check the hidden-icons arrow if needed). Closing the browser keeps the server running; Quit shuts it down. **Open folder** in the browser opens the native Windows directory picker. The last workspace is remembered under `%LOCALAPPDATA%\DBML Studio`; the initial empty workspace is stored there too. Explorer, Monaco/Vim, themes, preview, and saves use the same production frontend/backend as the macOS build.

To build the `.exe` directly on Windows, install Node.js 22.12+ (x64), Git, and **Visual Studio Build Tools 2022** with the **Desktop development with C++** workload and Windows SDK. Open **x64 Native Tools Command Prompt for VS 2022**, then run from the cloned repository:

```bat
npm.cmd ci
py -3 scripts/fetch_reference.py 0.4.0
npm.cmd run package:windows
```

Python 3 is only needed for the reference downloader; skip that command if the official 0.4.0 extension is already available through discovery or `DBDIAGRAM_EXTENSION_DIR`. npm dependencies and those parser/renderer assets must be available through your approved sources. Acorn is now pinned and installed by `npm ci`.

The native Windows build uses `cl.exe` from the developer prompt, links the compiler runtime statically (`/MT`), and bundles the installed Node runtime and its `LICENSE`. It does not download LLVM-MinGW or another Node binary. If Node is managed by a tool that omits its license, set `DBML_NODE_DIR` to a matching approved Node distribution containing `node.exe` and `LICENSE`:

```bat
set "DBML_NODE_DIR=C:\path\to\node-distribution"
npm.cmd run package:windows
```

Output executable: `dist\windows-x64\DBML Studio\DBML Studio.exe`. Portable ZIP: `dist\DBML-Studio-windows-x64.zip`. Keep the adjacent `resources` directory with the executable. Run `Check Windows.cmd` from the output folder to test the bundled backend. The Windows-native build path is implemented but has not been executed from this Mac.

You can also cross-build on macOS with Node, npm dependencies, Python 3, and network access:

```sh
npm run package:windows
# Optional Windows on ARM target (not execution-tested):
npm run package:windows -- arm64
```

When cross-building on macOS, the packager downloads the official Windows Node 22 ZIP, verifies its published SHA-256, and cross-compiles `windows/StudioTray.cpp` using the official LLVM-MinGW macOS toolchain. Runtime/compiler provenance is recorded in `resources/PROVENANCE.json`; `BUILD-CHECKS.json` records the PE target and DLL imports using a platform-independent PE reader. Compiler runtimes are statically linked. A Windows Job Object owns the backend so Quit/launcher exit stops it; normal Quit first closes stdin for graceful shutdown. The native host uses the same folder-picker stdout/stdin protocol as macOS.

The Windows executable is unsigned. It has been cross-compiled and inspected on macOS; **Windows GUI execution is not yet verified**. The packaged backend smoke check passed on macOS with Unicode/space paths, lineage preview, safe save, and workspace switching. Run **Check Windows.cmd** on a Windows machine to test the bundled Windows Node runtime and filesystem behavior, then manually check the tray menu, native folder picker, browser opening, duplicate launch, and Quit. `Studio CLI.cmd [DIRECTORY]` is the terminal launcher.

## Render a diagram or start the web viewer

From this directory:

```sh
# Interactive local service using the original 0.4.0 renderer:
npm run serve -- examples/retail_lineage.dbml --port 4173

# Static SVG export:
npm run render -- examples/retail_lineage.dbml -o artifacts/retail-lineage.svg

# Column-level lineage or a foreign-key ERD:
npm run render -- examples/retail_lineage.dbml --level column -o artifacts/column-lineage.svg
npm run render -- examples/retail_lineage.dbml --links relationships -o artifacts/retail-erd.svg
```

Open `http://127.0.0.1:4173` for the interactive diagram. It uses the same bundled JavaScript/CSS renderer as the working extension, with a local adapter for its message protocol. The service watches the DBML file and streams updates; invalid DBML appears in the original error panel. Pan, zoom, arrangement, link-type switching, and column lineage use the original renderer. It reads an existing `.dbdiagram` layout at startup and saves subsequent viewer layout changes in browser local storage. Source editing from the browser is disabled; edit the file in your editor.

The service binds to `127.0.0.1` only. Use `--port 0` for an available port, `--theme light`, or `--links relationships|all`. It uses local display capability flags and does not connect to an account or the subscription API. Some renderer controls that modify DBML are disabled by this read-only host. Stop with Ctrl+C.

SVG export uses the independent renderer in `src/render.mjs`, with schema colors, columns, primary keys, tooltips, lineage arrows, optional foreign keys, and automatic layered placement. Its appearance differs from the original interactive canvas. Use `--detail tables` for compact cards, `--level column` for column-to-column connections, or `--links all` for both relationship types. SVG output does not require Graphviz, a browser, or another npm dependency.

Both commands currently obtain their DBML parser (and the service obtains its renderer assets) from installed or archived official extension packages. They are functional local tools, not a standalone redistribution of that package. Default target is 0.4.0 because the 0.5.3 webview lacks lineage controls.

## Run

From this directory, with Node 22 or newer:

```sh
npm run verify
npm run analyze
npm run build:artifacts
npm run model
npm run trace
npm run compare
node src/cli.mjs symbols renderer
node src/cli.mjs symbol host Am
node src/cli.mjs layout examples/retail_lineage.dbdiagram
node src/cli.mjs trace examples/retail_lineage.dbml source.refunds.amount downstream
```

`analyze` writes `artifacts/0.4.0/analysis.json`, `entitlement-behavior.json`, and readable recovered sections under `recovered/`. `model` writes the normalized database, a table/column graph, and a Graphviz `.dot` diagram under `artifacts/model/`. `trace` follows exact declared edges at the selected endpoint level; it does not invent column dependencies from table edges or infer lineage from SQL.

## Tool dependencies

The original analysis-only tools needed no package installation on the development machine. The new Studio application requires `npm ci` for the pinned Vite and Monaco dependencies; `package-lock.json` is included. Static extraction uses the Acorn parser bundled with VS Code's JavaScript debugger. Readable printing uses VS Code's bundled TypeScript, when present. Node's built-in test runner runs the tests. The DBML runtime is taken from the installed extension.

For another machine, install `acorn` locally or set `ACORN_PATH`; optionally install `typescript` or set `TYPESCRIPT_PATH`. Set `DBDIAGRAM_EXTENSION_DIR` to override extension discovery. Default discovery checks `.vscode`, `.vscode-insiders`, and `.cursor` under the current user's home directory. The explicit directory must have the requested version in its manifest.

This is a tool for the known installed builds, not a universal decompiler. Discovery uses AST parsing plus semantic marker strings and fails when expected structures change. Run tests after changing extension versions.

## Read the findings

Start with [the completed-run findings](docs/findings.md).

- [Architecture and behavior](docs/architecture.md)
- [Feature controls and offline results](docs/features.md)
- [Webview message protocol](docs/protocol.md)
- [Saved layout format and migrations](docs/layout.md)
- [Parser and lineage representation](docs/lineage.md)
- [Authentication and network boundary](docs/authentication.md)
- [Renderer and version regression](docs/renderer.md)
- [Evidence index and remaining work](docs/evidence.md)

## Runtime boundaries

The parser harness evaluates a prefix of the known local host bundle, stopping before the authentication/HTTP initialization. It permits a listed set of Node modules and supplies an empty VS Code stub. Node's `vm` is an instrumentation context, **not a security sandbox**; only use trusted installed bundles. Parser file APIs may read referenced files. The feature harness evaluates the recovered manager with synthetic sessions, API replies, timers, and events. It never contacts the service or reads account secrets. Tests use the actual recovered manager, not a rewritten approximation.

Both the original viewer and the Monaco workspace were manually verified in Safari. Studio checks included directory selection, file creation, unsaved editing, saving, diagnostics/undo recovery, tab switching, and light/dark synchronization. Generated SVG output was also visually inspected. The 54 automated tests cover HTTP/SSE, recursive directory watching, safe saves and conflicts, unsaved previews, Vite development mode, compiler behavior, SVG generation, and the analysis harnesses; full browser interaction is not yet automated. Cloud implementation and live account behavior remain unverified. See the workspace `AGENTS.md` for current agent context and the evidence document for analysis coverage and limits.

## Archived package comparison

VS Code may remove old version directories after reload. To retrieve an official package into the ignored reference directory without installing it:

```sh
python3 scripts/fetch_reference.py 0.5.3
npm run compare
```

The downloader records the package URL and SHA-256, restricts archive paths and extracted size, and never executes downloaded files. Only this explicit download command requires network access. The regular analysis and tests are offline.

## Broader symbol recovery

Analysis also writes `host-symbols.json` and `renderer-symbols.json`: streaming token catalogs of top-level initialized variables, functions, and classes. The catalog respects string, template, comment, and regex boundaries. Use `symbol` to recover and format any listed definition on demand. This exposes far more bundled code than the named application extracts, without storing a second full vendor tree in project source. Symbol extraction may include dependencies by reference; individual definitions are not necessarily standalone modules.

## Repository and release files

The Git repository root is this directory (`dbdiagram-re/` in the original workspace). Keep source, UI/native launchers, build/check scripts, tests, documentation, examples, `package.json`, and `package-lock.json` in Git. Retail model/layout fixtures live in `examples/`; the tests and example commands use these repository-local files. `AGENTS.md` provides session context for future development.

Generated `dist/` releases, installed `node_modules/`, and downloaded/recovered `artifacts/` content are ignored. Attach the ZIPs from `dist/` to a GitHub Release rather than committing them. Local environment files, caches, logs, and OS/editor working files are also ignored; `.env.example` templates may be committed. Required original extension assets must be installed or fetched explicitly and are not included in source control.
