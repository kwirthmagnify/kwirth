# Autonomous plugins

Most channel plugins **observe cluster resources**: the user picks a cluster, a namespace, a pod or a container, and the channel streams data about them. An **autonomous plugin** needs **nothing from the cluster** — no namespace, no pod, no container. It is a regular plugin in every other respect, so it runs inside kwirth and reuses the whole framework.

This is what lets you **embed a standalone JavaScript application** as a kwirth channel — a game, a dashboard, a small tool, an external widget — and have it inherit kwirth's sign-in, permissions, persistence and real-time transport for free, instead of hosting and securing it somewhere else.

## What makes a plugin autonomous

A plugin becomes autonomous through its **back-channel data**. In `getChannelData()`, set both flags to `false`:

```ts
getChannelData = (): BackChannelData => ({
    id: 'my-app',
    // …
    cluster: false,     // does not need a cluster-scope access key
    resourced: false    // does not attach to namespaces / pods / containers
})
```

With `cluster` and `resourced` both `false`:

- the channel's only **view** is `EInstanceConfigView.NONE` (`'none'`) — it never asks the user to select a scope, because there is no resource to scope to;
- the core **starts it once**, calling `addObject()` with the three selectors (namespace, pod, container) **empty**;
- `getChannelScopeLevel()` only has to accept `'none'` — there is no `'cluster'` scope to grant.

Everything else is a normal plugin.

## What you still get from the framework

Because an autonomous plugin is a first-class channel, it keeps every service the framework provides — this is the whole point of embedding an app *inside* kwirth rather than hosting it elsewhere:

- **Authentication** — the user is already signed in (password, login extension or SSO); the channel never handles credentials.
- **RBAC** — access is authorized against the user's scopes; declare your own from `getChannelScopeLevel()` so admins can grant them (see [Security](/0.5.287/security)).
- **Persistence** — set `requirements.storage = true` and keep per-user / per-instance state in kwirth's own stores (ConfigMaps, Secrets, a PVC or files) — no external database.
- **Real-time transport** — the multiplexed WebSocket is available (`requirements.webSocket`), so your app can push and receive live data.
- **Providers** — subscribe to any [provider](/0.5.287/providers/index) to feed the app external data.
- **UI integration** — theming / palette, notifications, the settings and setup dialogs — the same as any other channel.

## Minimal skeleton

Back channel (`src/back/index.ts`):

```ts
import { IChannel, BackChannelData, IBackChannelRequirements } from '@kwirthmagnify/kwirth-common-back'
import { EClusterType, EInstanceConfigView } from '@kwirthmagnify/kwirth-common'

class MyAppChannel implements IChannel {
    readonly channelId = 'my-app'
    readonly requirements: IBackChannelRequirements = { storage: true, providers: [] }

    getChannelData = (): BackChannelData => ({
        id: 'my-app',
        routable: false, pauseable: false, modifiable: false,
        reconnectable: true, metrics: false,
        sources: [EClusterType.KUBERNETES, EClusterType.DOCKER],
        endpoints: [], websocket: false,
        cluster: false,      // ← autonomous
        resourced: false     // ← autonomous
    })

    getChannelScopeLevel = (scope: string): number => ['', 'none'].indexOf(scope)

    // Called once, with the three selectors empty — there is nothing from the cluster to attach to.
    addObject = async (ws, instanceConfig, _ns, _pod, _container): Promise<boolean> => {
        // start your app / instance here
        return true
    }

    // …plus the rest of the IChannel contract (startChannel, processCommand, …)
}
export default MyAppChannel
```

On the **front**, implement the channel as usual with its `IChannelRequirements` and render your application inside the content component — a full React/JS surface where you mount the embedded app. Because the view is `none`, the channel opens straight from the resource selector without a scope.

## When to use it

- Bring a **standalone JS app** (game, calculator, status board, embedded third-party widget) into kwirth.
- Ship a **demo or reference** that does not depend on a live cluster.
- Build a tool that only consumes **providers** or external data, not Kubernetes resources.

## Related

- [Developing plugins](/0.5.287/plugins/developing)
- [Managing plugins](/0.5.287/plugins/managing)
- [Providers](/0.5.287/providers/index)
