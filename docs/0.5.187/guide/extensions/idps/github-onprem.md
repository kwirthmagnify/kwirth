# GitHub Enterprise Server (IdP connector)

> **Type:** Identity provider connector<br>
> **Protocol:** OAuth2<br>
> **Provider id:** `github-onprem`

## What it does

Lets users **sign in with a GitHub Enterprise Server** (self-hosted) instance via **OAuth2** — same as the cloud connector, pointed at **your** GitHub Enterprise URLs.

## Configuration

Open **☰ → Manage extensions → Identity providers → Login with GitHub (github-onprem) → ⚙️**:

![Configure Login with GitHub (Enterprise)](../../../_media/guide/idp-github-onprem.png)

| Field | What it does |
|---|---|
| **Login button label** | Text on the login-screen button. |
| **Enabled (show on login screen)** | Toggle the connector on/off. |
| **GitHub Enterprise URL** * | Base URL of your GHES (e.g. `https://github.example.com`). |
| **API URL** | API base — defaults to `<baseUrl>/api/v3`. |
| **Client ID** * | The OAuth App **client ID**. |
| **Client Secret** * | The OAuth App **client secret**. |
| **Scopes** | OAuth scopes. |

## Setup

Register an **OAuth App** in your GitHub Enterprise instance, set Kwirth's **callback URL**, and fill in the base/API URLs + client id/secret. See **[Identity Provider integration](../../admin/07-idp-integration)**.

## Notes

- Differs from **[GitHub Cloud](github-cloud)** by the **Enterprise URL** and **API URL** fields.
- The client secret is a credential — protect it.

---

← Back to [Identity providers](index)
