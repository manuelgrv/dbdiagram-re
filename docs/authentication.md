# Authentication and network boundary

Recovered from the authentication provider, loopback server, and feature manager. This analysis examines code and synthetic fixtures; no account secrets were read and no account API was contacted by the project.

## Sign-in path

The host registers VS Code authentication provider `dbx-auth`, labeled `dbdiagram`, with multiple accounts disabled. Its client identifier is `dbdiagram-vscode-extension`; this is a public application identifier, not an account secret.

The login implementation creates a random state value and a code verifier, derives a SHA-256 challenge, starts a temporary HTTP callback server, and opens the browser login page. The callback checks the returned state and requires a code. Login has a five-minute timeout and supports user cancellation. The browser return page is selected for VS Code, Cursor, or Windsurf.

The callback URL uses `127.0.0.1` and an assigned port. The server calls `listen(0)` without an explicit bind hostname in this inspected build. This is a static observation; local network exposure and exploitability were not tested.

The authorization code is exchanged at `https://api.dbdocs.io/portal/auth/token` with `grantType`, `redirectUri`, `clientId`, `code`, and `codeVerifier`. Account display information is read by decoding the returned JWT; the local account identifier is derived from the email with the SHA-256 helper. This local decoding is not a verification of server-side token acceptance.

The returned session contains an access token, account identity, and scopes. Sessions are stored through VS Code SecretStorage under `dbdiagram.sessions`; they are not stored in `.dbdiagram`. Existing sessions can be restored if reauthentication fails.

## Subscription metadata

An Axios client uses `https://api.dbdiagram.io` as its base URL. The request interceptor attaches the current session access token in the `Authorization` header and sets no-cache headers. The feature manager reads `/subscription` and `/userworkspace`, accepting personal or workspace statuses `subscribed` and `trial`.

See `artifacts/0.4.0/analysis.json` for strings extracted from the feature and authentication classes, and `recovered/loopback.js` and `recovered/auth.js` for the readable code. The endpoint inventory is deliberately scoped to these application classes; bundled database drivers contain many unrelated URLs.

## Limits

The local bundles reveal request construction, callback handling, persistence APIs, and client-side feature selection. They do not expose the service's private signing keys, billing implementation, database contents, subscription mutation logic, hosted diagram renderer state, or cloud collaboration implementation. The offline harness replaces account I/O with fixtures solely to characterize local decision behavior.
