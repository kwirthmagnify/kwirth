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

## GitHub setup

Create an **OAuth App** (Settings → Developer settings → OAuth Apps → New OAuth App), or
an org-owned OAuth App:

- **Authorization callback URL**: your Kwirth IdP callback
  (e.g. `https://<kwirth>/core/auth/<instanceId>/callback`)
- Copy the generated **Client ID** and generate a **Client Secret**

`read:user` + `user:email` let Kwirth read the profile and the verified primary email.

## Build

```bash
npm install
npm run build     # → dist/back.js + dist/package.json
npm run watch     # dev: rebuilds on change (backend hot-reloads)
```
