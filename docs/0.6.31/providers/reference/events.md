# Events
The Events provider watches the Kubernetes API and distributes every change to its subscribers, according to what each one asked for. What it delivers:

  - ADDED / MODIFIED / DELETED changes, just those.
  - Of any Kubernetes object it watches, including CRDs and the instances of every CRD.
  - The cluster's own event log: Kubernetes `Event` objects, delivered with kind `Event`.

It is an **installable extension** (`@kwirthmagnify/kwirth-provider-events`), no longer part of the core. User-facing page: [Events provider](/0.6.31/guide/extensions/providers/events).

## What for
It is intended for the channels that need to know what is taking place inside Kubernetes: Magnify, Topology, Censor, Pinocchio and others.

## Requiring it
A plugin that uses it declares it in its `package.json`, so Kwirth refuses to install the plugin without it:

```json
"requiresExtension": ["provider:events:0.1.0"]
```

## Subscribing (push)
Add yourself as a subscriber with two parameters:

  - **kinds**, an array of Kubernetes kinds you want to receive. It is a **strict opt-in**: a kind not listed is not delivered, and a subscription with no kinds receives nothing. Add `'Event'` to receive the cluster's event log.
  - **syncInstances**, a `boolean`: also receive the instances of the watched CRDs, including those whose CRD is created after your subscription.

```typescript
this.clusterInfo.addSubscriber(
    'events',
    this,
    {
      kinds: ['Deployment', 'Node', 'Pod'],
      syncInstances: false
    }
)
```

Each delivery reaches your `processProviderEvent('events', { type, obj })`, where `type` is `ADDED`, `MODIFIED` or `DELETED` and `obj` is the Kubernetes object.

What to expect:

  - **Changes from now on**, not the current state of the cluster: the watches start with the provider. If you need what already exists, list it once from Kubernetes and then follow the changes.
  - **No replay of the event log.** Kubernetes hands over its retained events (about an hour) whenever a watch starts; the provider discards those.
  - **CRD instances reach every subscriber.** When a CRD appears, its kind is added to the filter of all subscribers, whatever they asked for. It is the long-standing behaviour, kept as it was.

## Reading (pull)
For a one-off read of Kubernetes events — of the whole cluster or about one object — ask through the provider handle. The request takes `{ namespace?, kind?, name?, limit? }` and answers raw `CoreV1Event[]`, newest first:

```typescript
const events = this.clusterInfo.getProvider('events', this)
const recent = await events.getData({ limit: 25 })
const ofPod = await events.getData({ namespace: 'default', kind: 'Pod', name: 'my-pod', limit: 25 })
```

`getData` rejects with a clear error if the provider is not installed or does not serve reads, so wrap it when the provider is optional for you.

The same read is served over HTTP, behind the access key: `GET /core/providerconfig/events?namespace=&kind=&name=&limit=` (`limit` capped at 500).

## Watched kinds
Nodes, Namespaces, Services, Endpoints, ConfigMaps, Secrets, Pods, PersistentVolumes, PersistentVolumeClaims, ServiceAccounts, ReplicationControllers, ResourceQuotas, LimitRanges, Deployments, DaemonSets, StatefulSets, ReplicaSets, Ingresses, IngressClasses, NetworkPolicies, Roles, RoleBindings, ClusterRoles, ClusterRoleBindings, StorageClasses, Jobs, CronJobs, CustomResourceDefinitions (and the instances of each CRD), plus `Event`.

## Without Kubernetes
With no cluster behind Kwirth (ECS, ACI, Helm mode `zero`) the provider logs it once and stays idle: subscriptions are accepted and receive nothing.
