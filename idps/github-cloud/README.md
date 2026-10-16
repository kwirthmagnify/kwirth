# kwirth-idp-github-cloud

GitHub.com (SaaS) identity provider connector for Kwirth, over **OAuth2** (GitHub is
**not** OIDC).

The OAuth2 endpoints are fixed to github.com / api.github.com — the admin only supplies
the OAuth application credentials. For GitHub Enterprise Server use the
[`github-onprem`](../github-onprem) connector instead.

It is a thin wrapper: the OAuth2 flow and the GitHub identity mapper live in
`@kwirthmagnify/kwirth-common-back` (`oauth2*` / `githubIdentityFromToken`), exposed by
the Kwirth backend as a global. The connector ships no runtime dependencies.

The identity is resolved from `GET /user` + `GET /user/emails`, taking the **primary
verified** email (the Kwirth gate requires a verified email).

## Configuration

Configured from the connector card in **Manage extensions → Identity providers**.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `clientId` | text | yes | GitHub OAuth App Client ID |
| `clientSecret` | password | yes | GitHub OAuth App Client Secret (write-only, masked in the UI) |
| `scopes` | text | no | OAuth scopes; defaults to `read:user user:email` |
| `redirectUri` | text | no | The **Authorization callback URL** GitHub must have registered. Pre-filled with the right value; see below |

## GitHub setup

Create an **OAuth App** (Settings → Developer settings → OAuth Apps → New OAuth App), or
an org-owned OAuth App:

- **Authorization callback URL**: the value the connector card shows in its **Authorization callback
  URL** field — copy it from there rather than composing it, and register it unchanged.
- Copy the generated **Client ID** and generate a **Client Secret**

`read:user` + `user:email` let Kwirth read the profile and the verified primary email.

### About that callback URL

Its shape is `<scheme>://<host><ROOTPATH>/core/auth/<instanceId>/callback`, and the two parts people get
wrong are the ones Kwirth cannot work out on its own:

- **`ROOTPATH`** — the subpath Kwirth is served under. It is `/kwirth` in the stock manifest and chart,
  so most deployments need it: `https://kwirth.example.com/kwirth/core/auth/github-cloud/callback`. It
  is empty only when Kwirth sits at the root of its host.
- **The scheme** — inside the pod the connection is plain HTTP. If the reverse proxy does not forward
  `X-Forwarded-Proto`, the derived value comes out as `http://…` for a site the browser reached over
  HTTPS, and GitHub rejects the redirect. OAuth2 only allows `http` on loopback.

The field exists for exactly that: leave it empty and Kwirth derives the value (guessing the scheme);
fill it in and that string is what travels, in both the authorization request and the token exchange.

## Build

```bash
npm install
npm run build     # → dist/back.js + dist/package.json
npm run watch     # dev: rebuilds on change (backend hot-reloads)
```
