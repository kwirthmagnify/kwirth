# kwirth-idp-google

Google / Gmail identity provider connector for [Kwirth](https://kwirthmagnify.dev), over **OIDC**.

It lets people sign in to Kwirth with their Google account instead of a Kwirth password. The connector
is a thin wrapper: all the OIDC logic lives in `@kwirthmagnify/kwirth-common-back` (`oidc*`), which the
Kwirth backend exposes as a global, so the package ships **no runtime dependencies** of its own
(`openid-client` is provided by the core). The issuer defaults to `https://accounts.google.com`.

## Install

From Kwirth: **Manage extensions → Identity providers → Marketplace**, and install *Google*. It needs no
restart.

## Configuration

Configured from the connector card in **Manage extensions → Identity providers**.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `clientId` | text | yes | OAuth 2.0 Client ID from the Google Cloud console |
| `clientSecret` | password | yes | Client secret (write-only, masked in the UI) |
| `scopes` | text | no | OIDC scopes; defaults to `openid email profile` |
| `issuer` | text | no | Defaults to `https://accounts.google.com`; there is rarely a reason to change it |
| `redirectUri` | text | no | The **Authorised redirect URI** Google must have registered. Pre-filled with the right value; see below |

## Google setup

In the [Google Cloud console](https://console.cloud.google.com/apis/credentials), create an **OAuth
client ID** of type **Web application**:

- **Authorised redirect URIs**: the value the connector card shows in its **Redirect URI** field — copy
  it from there rather than composing it, and register it unchanged.
- Copy the generated **Client ID** and **Client secret** into the connector card.

You will also need an **OAuth consent screen** configured; for an internal deployment, publishing it as
*Internal* restricts sign-in to your Workspace domain.

### About that redirect URI

Its shape is `<scheme>://<host><ROOTPATH>/core/auth/<instanceId>/callback`, and the two parts people get
wrong are the ones Kwirth cannot work out on its own:

- **`ROOTPATH`** — the subpath Kwirth is served under. It is `/kwirth` in the stock manifest and chart,
  so most deployments need it: `https://kwirth.example.com/kwirth/core/auth/google/callback`. It is
  empty only when Kwirth sits at the root of its host.
- **The scheme** — inside the pod the connection is plain HTTP. If the reverse proxy does not forward
  `X-Forwarded-Proto`, the derived value comes out as `http://…` for a site the browser reached over
  HTTPS, and Google rejects it with *redirect_uri_mismatch*. OAuth2 only allows `http` on loopback, so
  `http://localhost:3883/core/auth/google/callback` is fine for development and nowhere else.

The field exists for exactly that: leave it empty and Kwirth derives the value (guessing the scheme);
fill it in and that string is what travels, in both the authorization request and the token exchange.

## Who gets in

Signing in with Google is **not** by itself permission to use Kwirth. The identity Google returns is
matched against Kwirth's users, and the account must already exist and be bound to this provider. A
verified email that belongs to nobody is refused.

## Build

```bash
npm install
npm run build     # → dist/back.js + dist/package.json + dist/README.md
npm run watch     # dev: rebuilds on change (backend hot-reloads)
```

The publish goes out of `dist/`.

## Links

- Kwirth: <https://kwirthmagnify.dev>
- Source: <https://github.com/jfvilas/kwirth>
