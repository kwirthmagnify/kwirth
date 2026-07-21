# GitLab

This page explains how to let users sign in to Kwirth with their **GitLab** account, over
OIDC. There are two connectors depending on where your GitLab lives:

- **GitLab Cloud** (`gitlab-cloud`) — for **gitlab.com** (SaaS). The issuer is fixed.
- **GitLab Self-Managed** (`gitlab-onprem`) — for a **self-hosted / on-prem** GitLab. You
  provide your instance URL.

You can enable **both at the same time** (they are independent connectors), so users can
come from gitlab.com and from your on-prem GitLab simultaneously.

> You do **not** create user accounts in GitLab. Users sign in with their own GitLab
> accounts. What you register in GitLab is *your application* (an OAuth application).

## Step 1 — Register Kwirth as an application in GitLab

In GitLab, create an OAuth **Application** (as an instance/admin application, a group
application, or under your user *Preferences → Applications*):

- **Name**: `Kwirth`
- **Redirect URI** — the Kwirth callback for the connector you are configuring:
  - GitLab Cloud: `https://<your-kwirth-host>/core/auth/gitlab-cloud/callback`
  - GitLab Self-Managed: `https://<your-kwirth-host>/core/auth/gitlab-onprem/callback`
  - For local development the redirect points at the **backend**:
    `http://localhost:3883/core/auth/gitlab-onprem/callback`
  - If Kwirth is served under a sub-path (`ROOTPATH`), include it.
- **Confidential**: yes.
- **Scopes**: `openid`, `email`, `profile`.

On save, GitLab gives you an **Application ID** and a **Secret**. Keep them for Step 2.

> The Kwirth **backend** performs the OIDC discovery (`<gitlab>/.well-known/openid-configuration`)
> and the token exchange server-side, so the machine running the backend must be able to reach
> your GitLab (relevant for on-prem behind a VPN).

## Step 2 — Configure the connector in Kwirth

As an admin, open **menu → Manage extensions → Identity providers**, then on the connector
card (**GitLab Cloud** or **GitLab Self-Managed**) click **Settings** (⚙️):

- **GitLab Self-Managed only** — **GitLab URL**: your instance base URL, e.g.
  `https://gitlab.mycompany.com` (no `/.well-known` suffix).
- **Application ID**: the value from Step 1.
- **Secret**: the value from Step 1 (write-only, shown masked afterwards).
- **Scopes**: leave empty to use the default `openid email profile`.
- **Enable** the instance and save.

A **"Login with GitLab"** entry now appears on the login screen (as its own button, or
inside the *"Log in with..."* dropdown when several IdPs are enabled).

## Step 3 — Create the users in Kwirth

GitLab only proves identity; the user must exist in Kwirth. From **User security** (admins only):

1. Create a **New** user.
2. Set the **Id** to the user's **email address** (this is how Kwirth matches the GitLab identity).
3. Select the matching **IdP** (`gitlab-cloud` or `gitlab-onprem`). When an IdP is selected, a
   password is **not** required.
4. Add the **resources** (scopes, namespaces, ...) that define what the user can access.
5. **Save**.

## Access control

For a GitLab user to actually log in, all of the following must hold:

1. GitLab reports the email as **verified**.
2. A Kwirth user exists with that **email as its id**.
3. That user is **bound to the same connector** being used (`gitlab-cloud` vs `gitlab-onprem`
   are distinct bindings).

So any GitLab account can *authenticate*, but only the users you explicitly created (bound to
the right connector) can *enter* Kwirth.

See [IdP integration](/0.5.287/idp/index) for the general concepts.
