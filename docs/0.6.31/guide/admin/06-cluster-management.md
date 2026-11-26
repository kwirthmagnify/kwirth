# 6. Cluster management

A single kwirth can act as the **front door to many clusters**. You add the extra clusters yourself, and — importantly — **clusters belong to your profile**, not to a global kwirth setting: the list is personal to the logged-in user.

Open it from **☰ → Manage cluster list**.

![Manage clusters dialog](../../_media/guide/admin-cluster-list.png)

## The source cluster

The cluster kwirth itself runs against is **always present** and is named **`inCluster`** (Kubernetes deployment) or **`inDesktop`** (desktop app). You **cannot rename or delete** it — it's the one you reached by pointing your browser (or desktop app) at this kwirth. Every other entry is a **remote** cluster you added.

## The cluster's own name

`inCluster` is the *entry* name in the cluster list. Separately, kwirth works out the **real name of the cluster** it is running on, and that is what you see in the **title bar** (`Kwirth - <cluster>`), in the **tab labels** and on the **Homepage** (together with an icon for the distribution).

Here is the thing: **Kubernetes has no cluster name**. There is no object in the API holding it, so kwirth has to work it out from the clues each distribution happens to leave on its nodes:

| Distribution | Where the name comes from |
|---|---|
| **AKS** | Node label `kubernetes.azure.com/cluster` (the node resource group prefix is stripped). |
| **EKS** | The `karpenter.sh/discovery` tag of the node, or the `alpha.eksctl.io/cluster-name` label if the cluster was created with eksctl. |
| **GKE** | The node name inside `providerID` (`gke-<cluster>-<nodepool>-…`). |
| **k3d** | The node name, which k3d builds as `<cluster>-server-N` / `<cluster>-agent-N`. |
| **k3s** | Nothing: a k3s node is just the machine's hostname. Kwirth uses the **hostname of the control-plane node**, which is a recognisable name but is the machine's, not the cluster's. |
| **Anything else** | No clue at all. |

When no name can be worked out, kwirth falls back to the **UID of the `kube-system` namespace** — unique and stable across restarts, so the cluster is always identifiable, just not pretty to read.

### Naming it yourself

Because the detection is best-effort, you can state the name and skip the guessing entirely — set **`KWIRTH_CLUSTER_NAME`** on the deployment:

```yaml
env:
  - name: KWIRTH_CLUSTER_NAME
    value: 'shop-prod'
```

It **takes precedence over every heuristic**, so it is also the way to fix a managed cluster whose derived name you don't like (an AKS name carrying its region, or a GKE name carrying its nodepool). Use it on **k3s and bare clusters**, where there is nothing to detect, and whenever you consolidate several clusters here and want names that mean something to your team. The distribution icon keeps being detected either way.

## Add a remote cluster

To observe another cluster from here, that cluster must be running its **own** kwirth, and you need an **API key** from it.

1. On the **remote** kwirth, create an API key with the scopes you need (see [API management](05-api-management)) and copy it.
2. Back on **this** kwirth: **☰ → Manage cluster list → NEW**.
3. Fill:
   - **Name** — any unique name *for your convenience* (it need not match the cluster's real name).
   - **URL** — where the remote kwirth is published.
   - **API Key** — the key you copied from the remote kwirth.
4. Click **TEST** to check connectivity, then **SAVE**.

The new cluster now appears in the **Cluster** dropdown of the [resource selector](../user/04-selecting-resources), and you can build tabs against it without logging out of this one.

> Fields shown per cluster: **Name**, **Id**, **URL**, **API Key**, **Route**, **Credentials**. Buttons: **NEW**, **SAVE**, **TEST** (connectivity check), **DELETE**, **CLOSE**. You cannot edit or delete the source `inCluster` / `inDesktop` entry.

## Signing in to a cluster

An entry does not have to carry an API key. Set its **Credentials** to **Login** instead and kwirth asks for a
**user and password of that cluster's own kwirth** when you use it, signs in there, and keeps the key the remote
hands out. Useful when you have your own user on the remote kwirth and should work with *its* permissions, or when
you would rather not leave a key stored in the list.

**Credentials** are separate from **Route**: how the cluster is *reached* (directly, or through a router such as
Bridge or IRIA Ianus) and how you *sign in* are two different choices, so a cluster behind a router can use Login too.

1. **☰ → Manage cluster list → NEW**, fill **Name** and **URL** (and **Route** if it is reached through a router).
2. Set **Credentials** to **Login**. The **API Key** field stays there but disabled: there is nothing to paste.
3. **TEST** checks that a kwirth answers at that address; **SAVE**.

The entry now reads **login required**, here and in the **Cluster** dropdown of the resource selector. Choose it
there and a **Sign in to &lt;cluster&gt;** dialog opens:

- The user is **the remote kwirth's**, not yours here. You may be logged in to this kwirth as `admin` and sign in to
  the remote one as any of its users — what you can do there is what *that* user may do.
- Once signed in, the entry reads **as &lt;user&gt;** and is used like any other.
- Your password is **never stored**: only the key the remote gives you, saved with your cluster list, so it also
  works from another browser.

**When the session ends.** The remote's key lasts **24 hours**, and the remote's admin can revoke it sooner. When
the remote no longer accepts it, the entry reads **session expired**, and choosing it opens the same dialog *saying
that your session in that cluster has expired*. Sign in again and carry on.

**Signing out.** In **Manage cluster list**, select the entry and press **SIGN OUT**: the key is forgotten and the
next use asks for credentials again — the way to switch to a different remote user.

What the dialog tells you when a sign-in fails:

| Message | What it means |
|---|---|
| *Invalid user or password* | Wrong credentials — or a user who signs in to that kwirth through an identity provider (SSO), who has no password there and cannot sign in from here |
| *This user has to change its password* | First sign-in of that user: change the password by signing in to that kwirth directly, then come back |
| *That Kwirth does not allow signing in from this address* | The remote's **Login access** filter leaves your address out |
| *Too many sign-in attempts* | The remote's protection against password guessing: wait the time it says |
| *That Kwirth could not be reached* | The address, the route or the network |

## Multi-cluster: one screen, many clusters

The whole point of adding clusters is that **each tab is bound to the cluster it was created against** — so a single kwirth screen can show **several clusters at the same time**.

- When you [open a channel](../user/05-channels), the tab remembers the **Cluster** you picked in the resource selector. It keeps streaming from *that* cluster regardless of what the Cluster dropdown shows afterwards.
- To watch a different cluster, just change the **Cluster** dropdown and **ADD** another tab. The new tab streams from the new cluster; the previous tabs keep streaming from theirs.
- So you can, for example, have `production-logs` from **cluster A** next to `staging-logs` from **cluster B** and `metrics` from your local `inCluster`, all side by side.
- Tabs are colour-tagged by cluster, so it's easy to tell at a glance which cluster each one belongs to.
- You can then [save that mix as a workspace](../user/06-workspaces) and bring the whole multi-cluster view back with one click.

This is what makes kwirth a **single pane of glass**: you don't switch context or log in again per cluster — you assemble one view that spans them.

## How cross-cluster access works

When you select a remote cluster in the resource selector, kwirth transparently uses the **API key you stored** for it — you don't log in again. So a single session can span clusters:

1. You log in to kwirth on cluster **A**.
2. An admin on cluster **B** gave you an API key, which you added under **Manage cluster list**.
3. Selecting cluster **B** in the resource selector makes kwirth use that key automatically to stream from **B**.

## Worked example — consolidate a second cluster

1. On cluster **B**'s kwirth, create a `view,stream` key limited to the namespaces you care about, lease `365` days, and **COPY** it.
2. On cluster **A**'s kwirth: **Manage cluster list → NEW** → Name `cluster-b`, URL `https://b.example.com/kwirth`, API Key `<paste>`.
3. **TEST** → **SAVE**.
4. In the resource selector, pick **`cluster-b`** and open a Log tab — you are now watching cluster B from cluster A.

> **Desktop note.** In the desktop app you can also pick clusters from your local `kubeconfig` (shown as LOCAL contexts) in addition to remote kwirth servers. See [Deployment → Desktop](01-deployment).

Next: [Identity Provider integration →](07-idp-integration)
