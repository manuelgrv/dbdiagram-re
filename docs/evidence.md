# Evidence and remaining work

## Reproduce evidence

Run `npm run analyze` to create an exact bundle inventory, manifest summary, capability signals, profile differences, application endpoints, and source section offsets/hashes. The analysis is local and reproducible for the installed version. Generated extracted code and model data live in ignored `artifacts/`; they can be recreated and are not original project source.

`npm run verify` runs compiler, extraction, feature-selection, migration, and graph tests. Runtime fixtures are synthetic. The tests intentionally execute recovered behavior where available rather than only comparing a rewritten implementation to itself.

## Coverage

| Area | Evidence | Confidence / limit |
| --- | --- | --- |
| Activation and commands | Manifest + recovered activation function | Static; no full VS Code integration test |
| DBML compilation | Actual bundled compiler + current model + invalid fixtures | Runtime verified |
| Feature profiles | Literal objects + actual manager with account fixtures | Runtime verified locally; not live billing |
| Layout migrations | Actual decoder with legacy/current/invalid inputs | Runtime verified |
| Saved state writes | Recovered state manager | Static; application file writes not invoked |
| Host/webview messages | Both message dispatch paths | Static; payload examples documented |
| Renderer dependency support | Bundle symbols, state, props, events, and dep-edge consumers | Static; full browser hit-testing not automated |
| 0.5.3 packaging regression | Side-by-side compiled asset inspection | Reproducible while both builds are available |
| Account authentication | Recovered provider and callback implementation | Static; no sign-in or secret access |
| End-to-end lineage | Compiler output + independent graph traversal | Runtime verified for current endpoint naming |
| Cloud implementation | Not in the package | Unavailable from local reverse engineering |

## Remaining targeted work

- Capture renderer input/event sequences in a dedicated browser harness to verify interactive lineage selection, dragging, and routing.
- Recover selected render classes and their dependencies into independently runnable test fixtures.
- Add structured endpoint encoding for quoted identifiers, names containing dots, and composite dependencies.
- Characterize additional source versions and make discovery independent of current class marker strings.
- Build interoperability tests for view text edits, collapsed-group entries, sticky-note geometry, and reference-path restoration.
- Investigate the exact auto-arrangement and edge-routing helpers, with visual fixtures for overlapping edges.

These are limits of the completed analysis, not claims that every bundled function has been understood. Large third-party database drivers and framework internals are inventoried rather than individually decompiled. The project is useful now for investigating the extension, reproducing the lineage regression, and understanding which features are implemented locally.
