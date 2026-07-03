# kwirth-idp-github-onprem

GitHub **Enterprise Server** (on-prem) identity provider connector for Kwirth, over
**OAuth2** (GitHub is **not** OIDC).

Same core as [`github-cloud`](../github-cloud), but the **GitHub Enterprise URL**
(`baseUrl`) is required: the OAuth2 endpoints are derived from it and the API defaults to
`<baseUrl>/api/v3` (overridable via `apiBaseUrl`). For GitHub.com use the
[`github-cloud`](../github-cloud) connector instead.

It is a thin wrapper: the OAuth2 flow and the GitHub identity mapper live in
`@kwirthmagnify/kwirth-common-back` (`oauth2*` / `githubIdentityFromToken`), exposed by
the Kwirth backend as a global. The connector ships no runtime dependencies.

The identity is resolved from `GET <apiBaseUrl>/user` + `/user/emails`, taking the
**primary verified** email (the Kwirth gate requires a verified email).

## Configuration

Configured from the connector card in **Manage extensions → Identity providers**.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `baseUrl` | text | yes | Your GHE base URL, e.g. `https://github.mycompany.com` |
| `apiBaseUrl` | text | no | API base; defaults to `<baseUrl>/api/v3` |
| `clientId` | text | yes | GitHub OAuth App Client ID |
| `clientSecret` | password | yes | GitHub OAuth App Client Secret (write-only, masked in the UI) |
| `scopes` | text | no | OAuth scopes; defaults to `read:user user:email` |

## GitHub Enterprise setup

On your GHE, create an **OAuth App** (Settings → Developer settings → OAuth Apps, or an
org/site-admin owned app):

- **Authorization callback URL**: your Kwirth IdP callback
  (e.g. `https://<kwirth>/core/auth/<instanceId>/callback`)
- Copy the **Client ID** and generate a **Client Secret**
- Set **GitHub Enterprise URL** in the card to your GHE base URL

Endpoints used: `<baseUrl>/login/oauth/authorize`, `<baseUrl>/login/oauth/access_token`,
API at `<baseUrl>/api/v3`.

## Build

```bash
npm install
npm run build     # → dist/back.js + dist/package.json
npm run watch     # dev: rebuilds on change (backend hot-reloads)
```
