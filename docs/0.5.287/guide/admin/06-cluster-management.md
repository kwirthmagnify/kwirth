# 6. Cluster management

A single Kwirth can act as the **front door to many clusters**. You add the extra clusters yourself, and — importantly — **clusters belong to your profile**, not to a global Kwirth setting: the list is personal to the logged-in user.

Open it from **☰ → Manage cluster list**.

![Manage clusters dialog](../../_media/guide/admin-cluster-list.png)

## The source cluster

The cluster Kwirth itself runs against is **always present** and is named **`inCluster`** (Kubernetes deployment) or **`inDesktop`** (desktop app). You **cannot rename or delete** it — it's the one you reached by pointing your browser (or desktop app) at this Kwirth. Every other entry is a **remote** cluster you added.

## Add a remote cluster

To observe another cluster from here, that cluster must be running its **own** Kwirth, and you need an **API key** from it.

1. On the **remote** Kwirth, create an API key with the scopes you need (see [API management](05-api-management)) and copy it.
2. Back on **this** Kwirth: **☰ → Manage cluster list → NEW**.
3. Fill:
   - **Name** — any unique name *for your convenience* (it need not match the cluster's real name).
   - **URL** — where the remote Kwirth is published.
   - **API Key** — the key you copied from the remote Kwirth.
4. Click **TEST** to check connectivity, then **SAVE**.

The new cluster now appears in the **Cluster** dropdown of the [resource selector](../user/04-selecting-resources), and you can build tabs against it without logging out of this one.

> Fields shown per cluster: **Name**, **Id**, **URL**, **API Key**. Buttons: **NEW**, **SAVE**, **TEST** (connectivity check), **DELETE**, **CLOSE**. You cannot edit or delete the source `inCluster` / `inDesktop` entry.

## Multi-cluster: one screen, many clusters

The whole point of adding clusters is that **each tab is bound to the cluster it was created against** — so a single Kwirth screen can show **several clusters at the same time**.

- When you [open a channel](../user/05-channels), the tab remembers the **Cluster** you picked in the resource selector. It keeps streaming from *that* cluster regardless of what the Cluster dropdown shows afterwards.
- To watch a different cluster, just change the **Cluster** dropdown and **ADD** another tab. The new tab streams from the new cluster; the previous tabs keep streaming from theirs.
- So you can, for example, have `production-logs` from **cluster A** next to `staging-logs` from **cluster B** and `metrics` from your local `inCluster`, all side by side.
- Tabs are colour-tagged by cluster, so it's easy to tell at a glance which cluster each one belongs to.
- You can then [save that mix as a workspace](../user/06-workspaces) and bring the whole multi-cluster view back with one click.

This is what makes Kwirth a **single pane of glass**: you don't switch context or log in again per cluster — you assemble one view that spans them.

## How cross-cluster access works

When you select a remote cluster in the resource selector, Kwirth transparently uses the **API key you stored** for it — you don't log in again. So a single session can span clusters:

1. You log in to Kwirth on cluster **A**.
2. An admin on cluster **B** gave you an API key, which you added under **Manage cluster list**.
3. Selecting cluster **B** in the resource selector makes Kwirth use that key automatically to stream from **B**.

## Worked example — consolidate a second cluster

1. On cluster **B**'s Kwirth, create a `view,stream` key limited to the namespaces you care about, lease `365` days, and **COPY** it.
2. On cluster **A**'s Kwirth: **Manage cluster list → NEW** → Name `cluster-b`, URL `https://b.example.com/kwirth`, API Key `<paste>`.
3. **TEST** → **SAVE**.
4. In the resource selector, pick **`cluster-b`** and open a Log tab — you are now watching cluster B from cluster A.

> **Desktop note.** In the desktop app you can also pick clusters from your local `kubeconfig` (shown as LOCAL contexts) in addition to remote Kwirth servers. See [Deployment → Desktop](01-deployment).

Next: [Identity Provider integration →](07-idp-integration)
