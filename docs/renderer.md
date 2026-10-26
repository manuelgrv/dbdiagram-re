# Renderer and version regression

## 0.4.0 application

The webview entry is a Vite-style ES module. The application uses Vue components and Pinia stores for the model, features, VS Code bridge, and diagram views. The manifest lists `@holistics/dbrenderer` 8.1.2 as a development dependency and `dbrenderer-webview` as a workspace dependency; the actual renderer code is bundled into the webview assets.

The application passes both filtered and full normalized databases to its diagram component. It passes `relationship-mode` from the current view and handles `relationshipModeChanged`, which persists the new mode. The renderer consumes `depEdges`; selecting dependency content can display the dependency note and transformation label. The toolbar includes a relationship-mode control. Keyboard shortcut metadata maps relationship mode to `7`, detail level to `6`, focus to `1`, and auto-arrange to `2`.

No claim is made that the full routing or layout algorithm has been reconstructed. The inspected strings expose several arrangement modes and connection-path state, but minified internal helpers have not all been assigned semantic names. Rendering and hit-testing code are available locally for further targeted study.

## Why 0.5.3 parsed lineage but did not display it

The 0.5.3 host contains DBML dependencies and a version-3 layout manager. However, its shipped webview entry lacks `depEdges`, `relationshipMode`, the `relationship-mode` prop, and relationship-mode state persistence. Its application store emits version-2 layout state. In 0.4.0 these dependency-rendering and version-3 state paths are present.

This is evidence of a mismatched packaged webview, not a subscription requirement or invalid DBML. The previous session additionally compared official Marketplace packages and observed the same difference; this project's `compare` command reproduces the local-bundle comparison when both directories exist.

The manifest alone is insufficient to establish renderer capability: both versions can declare similar renderer dependencies while shipping different compiled assets. The analysis records asset hashes and sizes for this reason.

## Readable extraction versus original source

Recovered host sections are pretty-printed using TypeScript's printer. Names and semantics remain those of the bundled code. Source offsets are JavaScript string indices (UTF-16 code units), not byte positions. Whole-file sizes and SHA-256 digests use UTF-8 bytes. Keep this distinction when cross-checking offsets with external tools.
