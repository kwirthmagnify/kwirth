# GitHub

This page explains how to let users sign in to Kwirth with their **GitHub** account. GitHub
uses **OAuth2** (it is not an OIDC provider), so Kwirth reads the identity from the GitHub API
(`/user` + `/user/emails`) and uses the **primary verified** email. There are two connectors:

- **GitHub Cloud** (`github-cloud`) — for **github.com** (SaaS). Endpoints are fixed.
- **GitHub Enterprise Server** (`github-onprem`) — for a **self-hosted GHE**. You provide your
  GHE URL.

You can enable **both at the same time** (independent connectors).

> You do **not** create user accounts in GitHub. Users sign in with their own GitHub accounts.
> What you register in GitHub is *your application* (an OAuth App).

## Step 1 — Register Kwirth as an OAuth App in GitHub

In GitHub, go to **Settings → Developer settings → OAuth Apps → New OAuth App** (or an
organization-owned OAuth App; on GHE, the same under your enterprise host):

- **Application name**: `Kwirth`
- **Authorization callback URL** — the Kwirth callback for the connector you are configuring:
  - GitHub Cloud: `https://<your-kwirth-host>/core/auth/github-cloud/callback`
  - GitHub Enterprise: `https://<your-kwirth-host>/core/auth/github-onprem/callback`
  - For local development the redirect points at the **backend**:
    `http://localhost:3883/core/auth/github-cloud/callback`
  - If Kwirth is served under a sub-path (`ROOTPATH`), include it.
- Register the app, then **generate a Client Secret**.

Copy the **Client ID** and **Client Secret** for Step 2.

> The Kwirth **backend** exchanges the code for a token and calls the GitHub API server-side,
> so the machine running the backend must be able to reach GitHub (relevant for GHE behind a VPN).

## Step 2 — Configure the connector in Kwirth

As an admin, open **menu → Manage extensions → Identity providers**, then on the connector
card (**GitHub Cloud** or **GitHub Enterprise Server**) click **Settings** (⚙️):

- **GitHub Enterprise only** — **GitHub Enterprise URL**: e.g. `https://github.mycompany.com`.
  Optionally set **API URL** (defaults to `<baseUrl>/api/v3`).
- **Client ID** and **Client Secret**: the values from Step 1 (secret is write-only, masked afterwards).
- **Scopes**: leave empty to use the default `read:user user:email` (needed to read the verified email).
- **Enable** the instance and save.

A **"Login with GitHub"** entry now appears on the login screen (as its own button, or inside
the *"Log in with..."* dropdown when several IdPs are enabled).

## Step 3 — Create the users in Kwirth

GitHub only proves identity; the user must exist in Kwirth. From **User security** (admins only):

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
2. A Kwirth user exists with that **email as its id**.
3. That user is **bound to the same connector** being used (`github-cloud` vs `github-onprem`).

So any GitHub account can *authenticate*, but only the users you explicitly created (bound to the
right connector) can *enter* Kwirth.

See [IdP integration](/0.5.187/idp/index) for the general concepts.
