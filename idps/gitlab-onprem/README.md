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
| `redirectUri` | text | no | The callback GitLab must have registered. Pre-filled with the right value; see below |

## GitLab setup

On your self-managed GitLab, create an OAuth **Application** (User/Group/Admin
applications) with:

- **Redirect URI**: the value the connector card shows in its **Redirect URI** field — copy it from
  there rather than composing it, and register it unchanged.
- **Scopes**: `openid`, `email`, `profile`
- Confidential: yes

Copy the **Application ID** and **Secret** into the connector card, and set the
**GitLab URL** to your instance base URL.

### About that Redirect URI

Its shape is `<scheme>://<host><ROOTPATH>/core/auth/<instanceId>/callback`, and the two parts people
get wrong are the ones Kwirth cannot work out on its own:

- **`ROOTPATH`** — the subpath Kwirth is served under. It is `/kwirth` in the stock manifest and chart,
  so most deployments need it: `https://kwirth.example.com/kwirth/core/auth/gitlab-onprem/callback`.
  It is empty only when Kwirth sits at the root of its host.
- **The scheme** — inside the pod the connection is plain HTTP. If the reverse proxy does not forward
  `X-Forwarded-Proto`, the derived value comes out as `http://…` for a site the browser reached over
  HTTPS, and GitLab rejects it with *invalid redirect uri*. OAuth2 only allows `http` on loopback.

The field exists for exactly that: leave it empty and Kwirth derives the value (guessing the scheme);
fill it in and that string is what travels, in both the authorization request and the token exchange.

## Build

```bash
npm install
npm run build     # → dist/back.js + dist/package.json
npm run watch     # dev: rebuilds on change (backend hot-reloads)
```
