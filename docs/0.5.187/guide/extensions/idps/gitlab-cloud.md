# GitLab Cloud (IdP connector)

> **Type:** Identity provider connector · **Protocol:** OIDC · **Provider id:** `gitlab-cloud`

## What it does

Lets users **sign in with a GitLab.com account** via **OpenID Connect**. Adds a **"Login with GitLab"** button to the sign-in screen.

## Configuration

Open **☰ → Manage extensions → Identity providers → Login with GitLab (gitlab-cloud) → ⚙️**:

![Configure Login with GitLab (cloud)](../../../_media/guide/idp-gitlab-cloud.png)

| Field | What it does |
|---|---|
| **Login button label** | Text on the login-screen button. |
| **Enabled (show on login screen)** | Toggle the connector on/off. |
| **Application ID** * | The **Application ID** of your GitLab OAuth application. |
| **Secret** * | The application **secret**. |
| **Scopes** | OIDC scopes (e.g. `openid email profile`). |

## Setup

Create an **OAuth Application** in your GitLab.com user/group settings, set Kwirth's **redirect URI**, and paste the Application ID/Secret here. See **[Identity Provider integration](../../admin/07-idp-integration)**.

## Notes

- For **self-managed** GitLab use the **[GitLab Self-Managed](gitlab-onprem)** connector instead (it adds a GitLab URL).
- The application secret is a credential — protect it.

---

← Back to [Identity providers](index)
