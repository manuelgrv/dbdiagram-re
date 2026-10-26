# Extension-host / webview protocol

Recovered from the host constants, `resolveCustomTextEditor`, and the renderer application's final message listener. Directions below are from the perspective of the extension host. This is a description of observed payloads, not a published compatibility promise.

## Host to webview

| Type | Fields | Purpose |
| --- | --- | --- |
| `update` | `database`, `errors`, `dbmlSource`, `diagramViews` | Replace normalized model, diagnostics, source text, and view definitions |
| `loadState` | `state` | Hydrate saved visual state |
| `themeChange` | `isDark` | Follow VS Code theme |
| `setFeaturesToggle` | `featuresToggle`, `shouldShowProTag` | Update capability flags and premium badges |

`errors` contain `message`, `startLine`, `startColumn`, `endLine`, and `endColumn`. Positions are one-based in the message. `diagramViews` carry `name` and `visibleEntities`. The database is a normalized set of keyed collections, not a SQL connection.

## Webview to host

| Type | Fields | Host action |
| --- | --- | --- |
| `ready` | none | Send saved state, theme, feature flags, then process the document |
| `saveState` | `state` | Update the cached state and schedule a sidecar write |
| `applyDbmlEdits` | `edits` | Apply text replacements to the current DBML document, then save |
| `requestProFeature` | none | Show upgrade/sign-in prompt |
| `revealError` | start/end line and column | Focus the related source range in an editor |

Each edit has `start`, `end`, and `newText`. The host converts offsets using `document.positionAt`; it binds the edit to the current model's URI rather than accepting a target filename from the message.

## Handshake and lifecycle

The webview calls `acquireVsCodeApi()` and posts `ready` after mounting. The host creates the HTML with script execution enabled and webview resources restricted to the renderer asset directory. Asset paths in the HTML are rewritten to `asWebviewUri` URLs.

On a valid model update the webview synchronizes its diagram views; on an invalid model it presents errors. Feature updates wait for an in-progress display promise before being applied, reducing render-time races. A preview-dispose handler flushes its cached layout immediately and unregisters the panel.

## Gaps

Static analysis does not prove that every message is reachable from every visible control. No hostile-message or renderer injection tests were performed. The protocol is documented to support interoperability and debugging; the tools do not send commands to the running extension.
