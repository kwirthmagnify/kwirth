# Kwirth security
There exist three levels of security that must be taken into account:

  1. Administrators security.
  2. User security.
  3. API security.

In addition, users can authenticate either with a **Kwirth password** or through an **external Identity Provider (Single Sign-On)** — see [Identity providers (SSO)](#identity-providers-sso) below.

### Administrator security
When you first deploy Kwirth there will exist an admin account. The credentials for the admin account are strong credentials like these:

  - User: admin
  - Password: password

The first time you access Kwirth you must use the admin credentials, and Kwirth will force you to change the password. You cannot continue the login process without changing the password.

The admin is the only user who can perform security related activities, like creating other users, managing API keys, or configuring identity providers. These administrative activities are tied to the **`admin` scope**: the built-in admin account carries it (together with the `cluster` scope, which some channels still require). Non-admin users do not see the security menus.

### User security
You can create, modify and delete users using "User security" menu option from the main Kwirth menu. If you are not an admin user you will not see this option. In the initial versions of Kwirth, only one admin user is possible, who is the responsible of creating all non-admin users you need. There is no more RBAC implemented than *being-an-admin* or *just-being-human*.

Each user can log in with a **Kwirth password** or be **bound to an Identity Provider** (Google, GitLab, GitHub, ...). When a user is bound to an IdP, no password is stored for them: they authenticate against the IdP and Kwirth issues the access key. See [Identity providers (SSO)](#identity-providers-sso).

In the near future we plan to add roles and specific object roles, so users could have different permission sets on different log objects or workspaces. For example, a user could edit a workspace in a development cluster but have only viewing permissions on a production cluster.

### API security
You can create, modify and delete API keys using "API security" menu option from the main Kwirth menu. If you are not an admin user you will not see this option.

API Security is the mechanism you use to give API Keys to another external application like Kubelog in order for them to access Kwirth resources like log streams.

On the other side, API security is the way you can use to give access to your Kwirth to users that work with another Kwirth. The diagram below explains how this works (refer to API Management documentation to undertand basic concepts).

![two-cluster](./_media/kwirth-two-cluster.png ':class=imageclass80')

As you can see...:

  1. The user logs to Kwirth at Kubernetes cluster "A".
  2. Another administrator at cluster "B" gave him an API Key that he adds to his "API Security".
  3. When the user wants to see a log stream from cluster "B" he doesn't need to logout cluster "A" nor login cluster "B". When the user selects cluster "B" in his "Resource Selector", Kwirth will use the appropriate API Key.

It's easy to work with. Enjoy!

### Identity providers (SSO)
Kwirth can delegate **authentication** to an external Identity Provider (IdP) while keeping **authorization** in Kwirth. The IdP only proves *who* the person is (a verified email); the user must still exist in Kwirth and be **bound to that exact IdP** to be allowed in. There is **no auto-provisioning**: administrators always create users manually.

IdP connectors are **extensions**, managed by administrators from **Manage extensions → Identity providers** — no environment variables or restarts are needed. Their configuration (client id/secret, and instance URLs for on-prem connectors) is stored in a single Kubernetes secret and shown masked in the UI.

Available connectors:

  - **Google** — Gmail / Google Workspace (OIDC).
  - **GitLab** — GitLab.com and self-managed (OIDC).
  - **GitHub** — GitHub.com and Enterprise Server (OAuth2).

For an IdP user to log in, all of these must hold: the IdP reports the email as **verified**, a Kwirth user exists with that **email as its id**, and that user is **bound to the IdP** being used. A verified email arriving from a different provider than the one assigned to the user is rejected.

See the [IdP integration guide](./idp/index) for concepts and the per-provider setup pages.
