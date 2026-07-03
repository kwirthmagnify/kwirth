# kwirth-idp-gitlab-onprem

GitLab **self-managed** (on-prem) identity provider connector for Kwirth, over **OIDC**.

Same OIDC core as [`gitlab-cloud`](../gitlab-cloud) and `google`, but the **issuer is
required** (the URL of your GitLab, e.g. `https://gitlab.mycompany.com`) and there is no
default — without an issuer configured the helper throws. For GitLab.com (SaaS) use the
[`gitlab-cloud`](../gitlab-cloud) connector instead.

It is a thin wrapper: all the OIDC logic lives in `@kwirthmagnify/kwirth-common-back`
(`oidc*`), exposed by the Kwirth backend as a global. The connector ships no runtime
dependencies (openid-client is provided by the core).

## Configuration

Configured from the connector card in **Manage extensions → Identity providers**.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `issuer` | text | yes | Your GitLab base URL, e.g. `https://gitlab.mycompany.com` |
| `clientId` | text | yes | GitLab Application ID |
| `clientSecret` | password | yes | GitLab Application Secret (write-only, masked in the UI) |
| `scopes` | text | no | OIDC scopes; defaults to `openid email profile` |

## GitLab setup

On your self-managed GitLab, create an OAuth **Application** (User/Group/Admin
applications) with:

- **Redirect URI**: your Kwirth IdP callback (e.g. `https://<kwirth>/core/auth/<instanceId>/callback`)
- **Scopes**: `openid`, `email`, `profile`
- Confidential: yes

Copy the **Application ID** and **Secret** into the connector card, and set the
**GitLab URL** to your instance base URL.

## Build

```bash
npm install
npm run build     # → dist/back.js + dist/package.json
npm run watch     # dev: rebuilds on change (backend hot-reloads)
```
