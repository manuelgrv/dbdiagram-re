# Findings from the completed run

Targets: installed official **0.4.0** and downloaded official **0.5.3**. The latter is a reference package in ignored artifacts; it is not installed or activated by this project.

## Recovered coverage

- **8,403 host symbols and 9,720 renderer symbols** cataloged in 0.4.0: 18,123 top-level initialized definitions.
- **8,421 host symbols and 8,797 renderer symbols** cataloged in 0.5.3.
- Readable extracts for parsing, feature profiles, feature manager, layout persistence, layout decoding, preview provider, diagnostics, authentication provider, callback server, activation, and the webview message listener.
- Source offsets, whole-bundle hashes, per-section hashes, file inventories, manifest contributions, and application endpoint strings recorded in JSON.
- Actual recovered feature and layout implementations exercised with offline fixtures.
- Current retail model exported as normalized JSON, a lineage graph, a Graphviz pipeline, and an upstream column trace.

## Important findings

1. **Lineage is not a paid flag in these builds.** Both local profiles enable relationship mode. The missing lineage UI in 0.5.3 is consistent with its shipped webview lacking the dependency code present in 0.4.0.
2. **Several paid visual features are implemented locally.** Seven flags differ between free and paid profiles. Operation-specific checks also matter; reading a single true flag does not establish visible availability.
3. **Workspace subscriptions qualify.** The actual feature manager accepts personal, owned-workspace, or member-workspace subscriptions with status `subscribed` or `trial`.
4. **The second model file is normal application state.** The actual decoder supports legacy layouts and normalizes them to version 3. The host creates the sibling sidecar and flushes it on close.
5. **DBML compilation and rendering can disagree.** Both host builds parse the current 19-table, 129-edge model, while their webview capabilities differ substantially.
6. **The package is inspectable, but original source is not fully recoverable.** Original local names, TypeScript type information, removed comments, server internals, and complete build history cannot be reconstructed from these bundles alone.

## Validation

The test suite covers static extraction, feature-selection fixtures, parser behavior, custom metadata, exact column tracing, downstream impact, cycle termination, layout migration, and the reference-package regression. A distributed sample of 128 symbol extracts across the four bundles parses as JavaScript. Renderer interaction and complete layout/routing algorithms remain areas for further study, as listed in [the evidence index](evidence.md).

Generated results are in `artifacts/`; rerun `npm run build:artifacts` to reproduce them. `npm run verify` reruns behavioral checks. Tests involving the reference build are explicitly skipped if that package is absent. The project performs no installation patching and no live account requests.
