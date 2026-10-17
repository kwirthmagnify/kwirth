# GitHub

This page explains how to let users sign in to kwirth with their **GitHub** account. GitHub
uses **OAuth2** (it is not an OIDC provider), so kwirth reads the identity from the GitHub API
(`/user` + `/user/emails`) and uses the **primary verified** email. There are two connectors:

- **GitHub Cloud** (`github-cloud`) — for **github.com** (SaaS). Endpoints are fixed.
- **GitHub Enterprise Server** (`github-onprem`) — for a **self-hosted GHE**. You provide your
  GHE URL.

You can enable **both at the same time** (independent connectors).

> You do **not** create user accounts in GitHub. Users sign in with their own GitHub accounts.
> What you register in GitHub is *your application* (an OAuth App).

## Step 1 — Register kwirth as an OAuth App in GitHub

> ⚠️ **It must be an *OAuth App*, not a *GitHub App*.** They are different things. A *GitHub
> App* ignores the OAuth `scope` parameter (it uses per-app permissions instead), so
> `user:email` is never granted and login fails with `unverified`. You can tell them apart by
> the **Client ID**: GitHub Apps start with `Iv...` (e.g. `Iv23li...`); OAuth Apps do not.
> If your consent screen says *"Know which resources you can access"* instead of listing
> *"Email addresses (read-only)"*, you registered a GitHub App by mistake.

In GitHub, go to **Settings → Developer settings → OAuth Apps → New OAuth App** (or an
organization-owned OAuth App; on GHE, the same under your enterprise host):

- **Application name**: `Kwirth`
- **Authorization callback URL** — **copy the value from the connector's own field** (Step 2) and
  register it unchanged; do not compose it by hand. Its shape is
  `<scheme>://<host><ROOTPATH>/core/auth/<github-cloud|github-onprem>/callback`, and the two parts that
  go wrong are the ones kwirth cannot work out on its own:
  - the **`ROOTPATH`** subpath — `/kwirth` in the stock manifest and chart, so **most deployments need
    it**: `https://kwirth.example.com/kwirth/core/auth/github-cloud/callback`;
  - the **scheme** — inside the pod the connection is plain HTTP, so a proxy that does not forward
    `X-Forwarded-Proto` yields `http://…` for a site reached over HTTPS.
  - Local development is the exception on both counts:
    `http://localhost:3883/core/auth/github-cloud/callback`.
  - ⚠️ For GitHub Enterprise it is the URL of **kwirth**, not of your GHE.
- Register the app, then **generate a Client Secret**.

Copy the **Client ID** and **Client Secret** for Step 2.

> The kwirth **backend** exchanges the code for a token and calls the GitHub API server-side,
> so the machine running the backend must be able to reach GitHub (relevant for GHE behind a VPN).

## Step 2 — Configure the connector in kwirth

As an admin, open **menu → Manage extensions → Identity providers**, then on the connector
card (**GitHub Cloud** or **GitHub Enterprise Server**) click **Settings** (⚙️):

- **GitHub Enterprise only** — **GitHub Enterprise URL**: e.g. `https://github.mycompany.com`.
  Optionally set **API URL** (defaults to `<baseUrl>/api/v3`).
- **Client ID** and **Client Secret**: the values from Step 1 (secret is write-only, masked afterwards).
- **Scopes**: leave empty to use the default `read:user user:email` (needed to read the verified email).
- **Enable** the instance and save.

A **"Login with GitHub"** entry now appears on the login screen (as its own button, or inside
the *"Log in with..."* dropdown when several IdPs are enabled).

## Step 3 — Create the users in kwirth

GitHub only proves identity; the user must exist in kwirth. From **User security** (admins only):

1. Create a **New** user.
2. Set the **Id** to the user's **email address** — it must be the **primary, verified** email of
   their GitHub account.
3. Select the matching **IdP** (`github-cloud` or `github-onprem`). When an IdP is selected, a
   password is **not** required.
4. Add the **resources** that define what the user can access.
5. **Save**.

## Access control

For a GitHub user to actually log in, all of the following must hold:

1. GitHub reports the primary email as **verified**.
2. A kwirth user exists with that **email as its id**.
3. That user is **bound to the same connector** being used (`github-cloud` vs `github-onprem`).

So any GitHub account can *authenticate*, but only the users you explicitly created (bound to the
right connector) can *enter* kwirth.

See [IdP integration](/0.6.31/idp/index) for the general concepts.
