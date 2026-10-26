# Feature controls

Source: recovered host feature manager, its two literal feature profiles, and the webview wrapper. Exact symbols and offsets are generated in `artifacts/0.4.0/analysis.json`; readable code is in `recovered/feature.js`, `free.js`, and `pro.js`.

## Profile differences in 0.4.0

| Flag | Free | Paid |
| --- | --- | --- |
| `colorHeader` | false | true |
| `colorPicker` | false | true |
| `tableGroup` | false | true |
| `stickyNote` | false | true |
| `diagramViewRestricted` | true | false |
| `tableRename` | false | true |
| `dbmlEditEnabled` | false | true |

Both profiles enable `darkMode`, `dragAndDrop`, `detailLevelsEnabled`, `tableSearch`, `diagramView`, `diagramViewDropdown`, and `relationshipModeEnabled`. A true base flag is not sufficient to infer an unrestricted UI: the webview forces detail level to `All` and intercepts detail-level changes when `diagramViewRestricted` is true. Save-as-new view operations also check this restriction.

This distinction explains why reading one isolated flag can misrepresent product behavior. The code has both feature availability flags and operation-specific guards. `shouldShowProTag` controls visual labeling separately from the capability profile.

## Decision rule, verified using the actual manager

Signed out: emit free flags without requesting account metadata.

Signed in: request `/subscription` and `/userworkspace` concurrently. A personal subscription, an owned workspace subscription, or a member workspace subscription qualifies when its `status` is exactly `subscribed` or `trial`. Otherwise emit free flags. Tests cover signed out, free, personal paid, trial, cancelled, workspace owner, workspace member, expired workspace, and a synthetic network failure.

The manager starts a one-second retry interval, clears it after successful fetching, and creates a new interval after authentication session changes. A caught failure without a `response` is treated as a network error and retried; a failure with a response stops that interval. The test harness verifies selection directly; it stubs timers rather than waiting through the interval loop.

The initial cached profile is the permissive literal profile before fetching completes. A rejected direct fetch leaves the cached value unchanged. This is an observed initialization behavior, not proof of the visible state throughout a real startup: component mounting and subsequent events can affect what users see.

## Local versus remote implementation

The local preview contains grouping, styling, views, and editing controls. Subscription decisions are informed by remote account metadata. Local inspection cannot recover hosted collaboration, cloud persistence, billing, AI services, or their server enforcement. The offline harness exercises selection with fixtures; it does not change a real account, issue tokens, alter installed gates, or establish live feature usability.

## Premium notification

The host detects notes, table groups, or table header colors in a normalized model and can show a premium notification once per document. The setting `dbdiagram.disablePremiumFeaturesNotification` suppresses that notification. It is a notification setting, not an entitlement setting. The prompt can trigger sign-in, open the pricing page, or persist the suppression setting.
