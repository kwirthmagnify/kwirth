# Events (provider)

> **Type:** Provider<br>
> **Package:** `@kwirthmagnify/kwirth-provider-events`

## What it does

The **Events** provider watches the **Kubernetes API** and tells the channels subscribed to it about every change: an object **ADDED**, **MODIFIED** or **DELETED**. It watches the usual kinds — Pods, Deployments, Services, ConfigMaps, Nodes, Ingresses, Jobs, RBAC objects… — plus the **custom resources** of every CRD in the cluster, and the cluster's own **event log** (the Kubernetes `Event` objects you see with `kubectl get events`).

It works in two ways:

- **Push** — a channel subscribes, says which **kinds** it wants, and from then on receives each change of those kinds as it happens.
- **Read** — a consumer asks once for the recent Kubernetes events, of the whole cluster or of one object, newest first.

It is what feeds:

| Consumer | What it uses |
|---|---|
| **[Magnify](../plugins/magnify)** | The **cluster events** in its overview, and the events of the object whose details you open. |
| **[Topology](../plugins/topology)** | The changes that keep its graph live. |
| **[Censor](../plugins/censor)** | Pods appearing and disappearing, for its cluster-scoped instances. |
| **[Pinocchio](../plugins/pinocchio)** | The pods it analyses as they start. |
| **Home pages** | The cluster events some home pages show. |
| **Agora**, **Excubitor**, **Iter**, **Montag** | Their own views of what changes in the cluster. |

## When you need it

Whenever Kwirth runs **with a Kubernetes cluster behind it** and you use any of the above. Without it those still open, but nothing in them moves — Magnify says so in its overview instead of showing an empty list:

> *The events provider is not installed in this cluster, so there are no cluster events to show. Install it from ☰ → Manage extensions → Providers.*

## Installing it

From **☰ → Manage extensions → Providers**, find **Events** in the marketplace and install it. It **already comes installed** in the images that carry channels (`-readonly` and `-full`, which is also the plain image tag and `latest`) and in the desktop app — see the image variants in [Deployment](../../admin/01-deployment). On a `-core` image you install it yourself.

The plugins that live on it (**Topology**, **Censor**, **Pinocchio**) declare it as a requirement, so the marketplace will not let you install them without it.

## Configuration

**None.** It watches what Kwirth itself can read: it needs no settings, no extra RBAC and no agent in the cluster.

## What a channel receives

- **Only the kinds it asked for.** A subscription lists the kinds it wants (`Pod`, `Deployment`, `Event`…); a subscription that names none receives nothing.
- **Changes from the moment it subscribes**, not a snapshot of what already exists. A channel that needs the current state reads it from Kubernetes once and then follows the changes.
- **The cluster event log is not replayed.** Kubernetes keeps its events for about an hour and hands them all over again whenever a watch starts; the provider drops those, so a restart of Kwirth does not resend an hour of old events.

## Notes

- **Kubernetes keeps its events for about an hour** (the API server's `--event-ttl`). A quiet cluster can therefore have **no events at all**: Magnify's list is empty because there is nothing to show, not because the provider failed. Create or restart something and the list fills again.
- **No Kubernetes behind Kwirth** (ECS, ACI, a container without a kubeconfig, Helm mode `zero`): there is nothing to watch. The provider says so **once** in the log and stays idle, so don't bother installing it there.
- **The API server closes every watch now and then**, and the network can drop one. The provider reconnects on its own; only when the API server cannot be reached for several attempts in a row does it give up on that kind, and says so in the log.
- **Custom resources** are watched as their CRD appears, and stop being watched when it is deleted.

---

← Back to [Providers](index)
