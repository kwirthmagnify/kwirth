# kwirth-idp-gitlab-cloud

GitLab.com (SaaS) identity provider connector for Kwirth, over **OIDC**.

The issuer is fixed to `https://gitlab.com` — the admin only supplies the OAuth
application credentials. For a self-managed GitLab use the
[`gitlab-onprem`](../gitlab-onprem) connector instead.

It is a thin wrapper: all the OIDC logic lives in `@kwirthmagnify/kwirth-common-back`
(`oidc*`), exposed by the Kwirth backend as a global. The connector ships no runtime
dependencies (openid-client is provided by the core).

## Configuration

Configured from the connector card in **Manage extensions → Identity providers**.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `clientId` | text | yes | GitLab Application ID |
| `clientSecret` | password | yes | GitLab Application Secret (write-only, masked in the UI) |
| `scopes` | text | no | OIDC scopes; defaults to `openid email profile` |

## GitLab setup

Create an OAuth **Application** (User settings → Applications, or Admin/Group
applications) with:

- **Redirect URI**: your Kwirth IdP callback (e.g. `https://<kwirth>/core/auth/<instanceId>/callback`)
- **Scopes**: `openid`, `email`, `profile`
- Confidential: yes

Copy the generated **Application ID** and **Secret** into the connector card.

## Build

```bash
npm install
npm run build     # → dist/back.js + dist/package.json
npm run watch     # dev: rebuilds on change (backend hot-reloads)
```
