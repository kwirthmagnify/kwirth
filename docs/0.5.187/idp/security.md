# IdP integration — security notes

This page describes how Kwirth protects the Single Sign-On (SSO) flow. For the general
concepts and per-provider setup see [IdP integration](/0.5.187/idp/index) and the provider
pages.

## Authentication vs authorization

The IdP only proves **identity** (a verified email). Kwirth keeps **authorization**: the
person must already exist as a Kwirth user *and* be bound to the exact IdP they used.
There is **no auto-provisioning** — administrators create users manually. A verified email
arriving from a different provider than the one assigned to the user is rejected.

The gate requires **all three**:

1. The IdP reports the email as **verified**.
2. A Kwirth user exists with that **email as its id**.
3. That user is **bound to the same IdP connector** being used.

## Authorization code flow hardening

- **PKCE (S256)** on OIDC connectors (Google, GitLab): a per-request `code_verifier` is kept
  server-side and its `S256` challenge travels in the authorization request, so an
  intercepted `code` cannot be exchanged by an attacker.
- **`state`, single-use, 10-minute TTL**: every request carries a random `state`; the callback
  consumes it exactly once (replay/CSRF protection). GitHub (OAuth2, non-OIDC) relies on this
  `state` for CSRF protection since it does not use PKCE.
- **RFC 9207 (`iss`)** is honored on OIDC: the issuer is validated on the callback.
- **Back-channel token exchange**: the `code` is exchanged for tokens **server-side** (the
  Kwirth backend), so the client secret and tokens never reach the browser. The backend must
  be able to reach the IdP (relevant for on-prem/GHE behind a VPN).

## Login handoff (web)

After a successful callback the backend does **not** put the session in the redirect URL.
Instead it stores the result under a **single-use handoff code with a 60-second TTL** and
redirects the SPA with `?sso=<code>`; the front then exchanges that code once at
`/core/auth/exchange` for the login response. A leaked URL is useless after one use or 60s.

- **Anti open-redirect**: the post-login `returnTo` is validated against an allowlist (same
  origin, or `localhost` for dev). An untrusted `returnTo` is ignored and the backend falls
  back to its own front URL.

## Secrets and configuration

- IdP connector configuration (client id/secret, instance URLs) lives in a single Kubernetes
  secret, **`kwirth-idps`**.
- Secret fields (client secrets) are **write-only**: the API masks them on read and, on save,
  a masked value preserves the stored secret. They are never returned to the UI in clear.

## Administrative access

Managing IdP connectors, users and API keys is **admin-only**. The `/idp`, `/user` and `/key`
APIs require the caller's access key to carry the **`admin` scope** (enforced after the normal
access-key validation); the built-in `admin` user holds `admin,cluster`. The UI also hides the
corresponding menus from non-admins.

## Not done yet

- **Binding by immutable subject (`sub`) / TOFU**: today a user is bound to an IdP by email +
  connector id. Pinning the IdP's stable `sub` on first login (trust-on-first-use) would harden
  against email reassignment on the IdP side. Tracked as a future enhancement.
