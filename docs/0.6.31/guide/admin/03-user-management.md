# 3. User management

Kwirth users are managed by the **admin** account from **☰ → User security**. If you are not an admin you won't see this option.

![User management dialog](../../_media/guide/admin-user-security.png)

The dialog has two areas: the **list of users** on the left, and the **editor** on the right. There is always a built-in **`admin`** user (the one you first logged in with). When people have asked for access through an Identity Provider, the left column also lists their **Access requests** below the users — see [Access requests (signup)](#access-requests-signup).

The editor's permissions part — **Scopes**, the object filters and their **NEW / SAVE / REMOVE** buttons — sits in its own **box**, apart from the user's own data above it: everything inside the box edits **one resource**, everything outside it edits the **user**.

> **Being an administrator is a scope, not a fixed single account.** Kwirth ships with a built-in `admin` user, but "admin" is really the **`admin` scope** — you can grant it to **any user**, so you can have **as many administrators as you want**. What every user (admin or not) can do is controlled entirely by the **scopes and resources** you assign (see [Security & permissions](04-security-and-permissions)).

## User fields

| Field | Meaning |
|---|---|
| **Id** | The identifier used to **log in**. For IdP-bound users this is the **email**. |
| **Name** | A display name, for your reference. |
| **Password** | The login password (local users). Left unused for IdP-bound users. |
| **IdP** | If set, the user authenticates through that **Identity Provider** instead of a password (see [IdP integration](07-idp-integration)). |
| **Auto-start channel** | If set, the named channel (e.g. `magnify`, `ops`) is launched automatically in **fullscreen mode** immediately after the user logs in. Leave empty to disable. |
| **Enabled channels** | Comma-separated list of channel IDs the user is allowed to open (e.g. `magnify,ops`). Leave empty to allow **all** channels. |
| **Can exit fullscreen** | When unchecked, the user cannot leave fullscreen mode once it starts — useful for kiosk-style deployments. Checked by default. |

## Create a user

1. Open **☰ → User security**.
2. Click **NEW** (bottom-left).
3. Fill **Id**, **Name** and **Password**.
4. Add one or more **resources** (what the user may access) — this is the permissions part, detailed in [Security & permissions](04-security-and-permissions):
   - Click **NEW** on the right side.
   - Pick one or more **Scopes**.
   - Optionally restrict by **Namespaces**, controllers (**Deployments/ReplicaSets/…**), **Pods** and **Containers**. Leave a field **blank to mean "all"**; you can list several values or regexes separated by commas.
   - Click **SAVE** (right side) to add the resource to the list.
5. Repeat step 4 for as many resources as you need.
6. Click **SAVE** (bottom-left) to persist the user.

The **bottom-left buttons** are always all there; what is selected only enables or disables them. They come in two groups, split by a thin line:

- **On a user**: **NEW** (start a new user), **SAVE** (persist the user and all its resources), **COPY PASSWORD** (copy the user's password to share it), **DELETE** (delete the selected user — disabled for the built-in `admin`).
- **On an access request**: **APPROVE**, **REJECT** and **DELETE REQUEST** — enabled only while a request is selected; see [Access requests (signup)](#access-requests-signup).

**CLOSE** is on the far right. *(The **NEW / SAVE / REMOVE** buttons inside the resource editor's box act on a single **resource** — not the user; see below.)*

## Working with resources and scopes

The right-hand side of the editor is where you build what a user may do. A user's permissions are a **list of resources**, and each **resource** couples a set of **scopes** (actions) with **object filters** (which Kubernetes objects). This is the same model described in full in [Security & permissions](04-security-and-permissions); here is how to *operate the editor*.

The controls, top to bottom:

| Control | What it does |
|---|---|
| **Resource List** | Dropdown listing the resources already added to this user. Selecting one **loads it into the fields below** so you can review or edit it. |
| **Scopes** | A **searchable multi-select** of the actions to allow (see picture below). Open it to get a **filter box** and a checkbox per scope; hover a scope for a **tooltip describing it**. You must tick **at least one** scope. |
| **Namespaces / Deployments / ReplicaSets / ReplicationControllers / DaemonSets / StatefulSets / Pods / Containers** | The **object filters**. Each takes a comma-separated list of names or regexes; **blank means "all"**. |
| **NEW** (right) | Clears the fields to start a **brand-new** resource. |
| **SAVE** (right) | Adds the current resource to the list — or, if you loaded one from *Resource List*, **updates** it. Disabled until at least one scope is selected. |
| **REMOVE** (right) | Deletes the currently selected resource from the list. |

Picking scopes:

![Scopes selector](../../_media/guide/admin-scopes.png)

Open the **Scopes** field and you get a **filter box** at the top — start typing to narrow a long catalog — over a **checkbox list**. Tick every action this resource should allow. Each scope shows a readable **label**, and hovering it reveals a **tooltip with its description**, so you don't have to memorize the raw scope ids.

> **The scope catalog is dynamic.** The list isn't hard-coded in the front end — the kwirth core **serves it at runtime** (built-in scopes like `cluster`, `admin`, `api`, `view`, `filter`, `stream`, plus the classic `ops$…` / `trivy$…` actions). **Installed plugins can contribute their own RBAC scopes**, so after installing a channel/plugin you may see **new scopes appear here automatically** — no upgrade of kwirth needed. What each scope means is detailed in [Security & permissions](04-security-and-permissions).

### Create a scope/resource

1. Click **NEW** (right side) to start with empty fields.
2. Open **Scopes** and tick the actions you want (e.g. `view`, `stream`). *(What each scope means → [Security & permissions](04-security-and-permissions).)*
3. Fill the object filters you need; leave the rest blank for "all".
4. Click **SAVE** (right side). The resource now appears in **Resource List**.

### Edit an existing scope/resource

1. Select it from **Resource List** — its scopes and filters load into the fields.
2. Change the **Scopes** ticks and/or the filters.
3. Click **SAVE** (right side) to update it in place.

### Remove a scope/resource

Select it in **Resource List** and click **REMOVE**.

> **Two SAVE buttons, two meanings.** The **right-side SAVE** commits a *resource* into the user's list. The **bottom-left SAVE** commits the *whole user* (including all its resources) to kwirth. Always finish with the bottom-left **SAVE**, or your changes are lost.

## Local users vs IdP-bound users

Every user authenticates in one of two ways, selected with the **IdP** field of the editor:

- **Local user** — the **IdP** field is `Local (user/password)`. They log in with the Id + Password you set here.
- **IdP-bound user** — the **IdP** field points to an Identity Provider connector; they log in through that provider and **only** through it: the user/password login refuses them.

## IdP-bound users

If your organization uses Single Sign-On, you bind a user to an [Identity Provider](07-idp-integration) instead of giving them a password. The **IdP** dropdown in the user editor lists `Local (user/password)` plus every **enabled** IdP connector:

![IdP dropdown in the user editor](../../_media/guide/admin-user-idp.png)

Rules that make an IdP user work (all must hold):

- The **Id must be the user's verified email** — this is what the provider will return and what kwirth matches against.
- The user must be **bound to the exact connector** they will use to sign in. A verified email arriving from a *different* provider is rejected.
- **No password** is used for IdP users; the Password field is irrelevant for them. An IdP-bound user **cannot log in with a password at all**, not even through the API: Kwirth refuses the user/password login (and the password change) for any user bound to an IdP, as it would refuse a wrong password, and logs a warning under the **Authentication** log component. Their only way in is their Identity Provider.
- **No auto-provisioning** — signing in with Google/GitLab/GitHub never creates an account by itself. Either you create the user here first, or — if you enabled **signup** on that IdP — the person **asks for access** and you approve the request: see [Access requests (signup)](#access-requests-signup).

### Create an IdP-bound user (example)

To let `alice@example.com` sign in with Google:

1. First make sure the **Google** connector is installed and **enabled** (see [IdP integration](07-idp-integration)).
2. **☰ → User security → NEW**.
3. **Id** = `alice@example.com` (her verified Google email). **Name** = `Alice`. Leave **Password** empty.
4. Set the **IdP** field to **`Google (Gmail)`**.
5. Add her **resources** (scopes + object filters) exactly as for any user — SSO changes only *how she logs in*, not *what she can do*.
6. **SAVE**.

Alice can now click *"Login with Google"* on the login screen; once Google verifies her, kwirth lets her in with the permissions you assigned.

> The prerequisite is the connector: the **IdP** dropdown only offers providers that are installed **and enabled** in [Manage extensions → Identity providers](07-idp-integration). If Google isn't in the list, enable it there first.

## Access requests (signup)

If you turned **signup** on for an Identity Provider (see [Signup](07-idp-integration#signup-access-requests)), people who sign in through it **without being users** can **ask for access**. Each request waits here, in the left column under the users, until an administrator decides:

![An access request under review](../../_media/guide/admin-signup-request.png)

A request **is not a user**: it lives apart from the users, and the person **cannot get into Kwirth in any way** while it is pending — not through the IdP, and not with a password. The header says how many are **pending**, and each request carries a chip with its state, **pending** or **rejected**.

When you log in as an administrator and there are pending requests, Kwirth tells you so — *"1 access request is waiting for approval…"* — on **every** login while they wait. The notice also stays in the **notifications bell** in the top bar.

Click a request to review it. The editor shows the person's **email** (it will be their Id), the **name** they gave and the **IdP** they came through — all three fixed, because they are the request's and not yours to change here. The small box at the foot of the left column shows **when** they asked and **why**, if they wrote it.

| Action | What it does |
|---|---|
| **APPROVE** | Creates the user — Id = their email, bound to the IdP they came through, **no password** — with the **resources** you set in the editor, and removes the request. Enabled once you have added **at least one resource**: approving with nothing would create a user who can do nothing. Auto-start channel, Enabled channels and Can exit fullscreen are taken from the editor too. The next time they sign in, they get in. |
| **REJECT** | Keeps the request, marked **rejected**. When they sign in they are told *"Your access request was rejected"*, and they **cannot ask again** while the rejected request exists. |
| **DELETE REQUEST** | Removes the request, pending or rejected. They will be able to ask again. |

> **Reject or delete?** Reject when the answer is *no* and you do not want the same person asking again and again. Delete a rejected request when you want to give them another chance.

### Example — approving a request

`jane.doe@example.com` signed in with Google and asked for access:

1. **☰ → User security**. Under **Access requests**, click `jane.doe@example.com`.
2. Read the box at the foot of the left column: when she asked and why.
3. In the resource editor's box, pick her **Scopes** (e.g. `view`, `stream`), optionally narrow the **Namespaces**, and click the box's **SAVE** to add the resource.
4. Click **APPROVE**. The request disappears from *Access requests* and `jane.doe@example.com` appears in the list of users.

Jane can now click *"Login with Google"* and gets in with exactly the permissions you gave her.

## Login behaviour settings

These three fields control what happens when the user logs in:

### Auto-start channel

Set this to a channel ID (e.g. `magnify`, `ops`, `trivy`) to have kwirth open that channel **automatically in fullscreen** as soon as the user authenticates. This is useful for operators who always work in one channel and do not need the full kwirth UI.

- The channel ID must match one of the installed channels.
- If the channel is not available (not installed, or not in the user's **Enabled channels** list), the auto-start is silently skipped.

### Enabled channels

Leave empty to let the user open **any** installed channel. Fill in a comma-separated list to **restrict** them to only those channels:

```
magnify,ops
```

Channels not in the list will not appear in the **Add** menu for that user.

### Can exit fullscreen

Uncheck this to prevent the user from leaving fullscreen mode. Combined with **Auto-start channel**, this creates a **kiosk mode**: the user logs in and is immediately locked to one channel view with no way to navigate away.

> **Tip — kiosk setup:** set **Auto-start channel** = `magnify`, uncheck **Can exit fullscreen**, and assign only the `stream` scope to the user. They will see the log stream from the moment they log in, with no access to the rest of the UI.

## Worked example — a read-only user for one namespace

Create a user who may only *watch* logs and metrics in the `production` namespace:

1. **NEW** user → Id `alice`, Name `Alice`, Password `<set one>`.
2. Add a resource:
   - **Scopes**: `view`, `stream` (watch and receive live streams — no ops, no admin).
   - **Namespaces**: `production`
   - Leave Deployments/Pods/Containers **blank** (= all objects within `production`).
   - **SAVE** the resource.
3. **SAVE** the user.

Alice can now open Log/Metrics channels scoped to `production`, but cannot operate workloads or reach other namespaces. To let her also **restart/delete** workloads you would add the `ops$restart` scope; to make her an administrator, you would add the `admin` scope — both explained next.

Next: [Security & permissions →](04-security-and-permissions)
