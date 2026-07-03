# Identity Provider (IdP) integration

Kwirth can delegate **user authentication** to an external Identity Provider (IdP), so people can sign in with their corporate or personal accounts (Single Sign-On) instead of a Kwirth password.

The important idea is the split between **authentication** and **authorization**:

- **Authentication** is done by the IdP. It only proves *"this person really is `someone@example.com`, and we verified it"*.
- **Authorization** is still done by Kwirth. The person must already exist as a user in Kwirth (see [User management](/0.5.187/usermanagement)) and be bound to that specific IdP, otherwise access is denied.

In other words: the IdP tells Kwirth *who* the person is; Kwirth decides *whether* that person can enter and *what* they can access (through the user's resources).

## How it looks for the user

The Kwirth login screen shows the configured IdPs in addition to the built-in user/password login. With a single IdP it is one button (for example *"Login with Google"*); with several, they are grouped under a *"Log in with..."* dropdown. The user picks the IdP, authenticates on the IdP, and is redirected back to Kwirth already logged in.

The built-in `admin` user and any local user/password accounts keep working as usual. SSO is added *alongside* them, not instead of them.

## How access is granted

For an IdP user to be able to log in, **all** of these must be true:

1. The IdP verifies the identity and reports the email as **verified**.
2. A Kwirth user exists whose **id is that email** (created from [User management](/0.5.187/usermanagement)).
3. That Kwirth user is **bound to the IdP** being used (each user is tied to a single IdP).

Because the email alone is not a trustworthy global identifier across arbitrary providers, Kwirth also checks that the user is using *the exact IdP assigned to them*. A verified email coming from a different provider is rejected.

There is **no auto-provisioning**: users are always created manually by an administrator. Signing in with Google (or any IdP) does not create a Kwirth account by itself.

## Enabling IdPs

IdPs are **extensions** (connectors), managed from the UI — no environment variables or restarts
needed. As an admin, open **menu → Manage extensions → Identity providers**. There you can install
connectors and, on each connector card, click **Settings** (⚙️) to enter its configuration
(client id/secret, and the instance URL for on-prem connectors) and **enable** it. Configuration is
stored in a single Kubernetes secret (`kwirth-idps`); secrets are write-only and shown masked.

The built-in `admin` user and any local user/password accounts keep working regardless — SSO is
added *alongside* them, not instead of them.

## Supported providers

- [Google / Gmail](/0.5.187/idp/google) — OIDC
- [GitLab](/0.5.187/idp/gitlab) — OIDC (cloud + self-managed)
- [GitHub](/0.5.187/idp/github) — OAuth2 (cloud + enterprise server)

More providers (Keycloak, Microsoft Entra ID / Office 365, ...) will be documented here as they
become available. Connectors are packaged independently, so third parties can ship their own.

## Security

For how the SSO flow is protected (PKCE + `state`, back-channel token exchange, single-use
login handoff, anti open-redirect, secret storage, admin-only management), see the
[IdP security notes](/0.5.187/idp/security).
