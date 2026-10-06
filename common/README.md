# @kwirthmagnify/kwirth-common

The shared vocabulary of [Kwirth](https://kwirthmagnify.dev): the types, enums and small helpers that the
Kwirth core, its web front end and every Kwirth extension agree on.

Kwirth is an observability and operations tool for Kubernetes — logs, metrics, events and a marketplace of
extensions (channels, providers, senders, webhooks, themes, DCEs…) running inside one server. This package
has no runtime dependencies on Node or on the browser, so the same types are used on both ends.

## What is in it

- **Channel messages** — instance configuration, instance and signal messages, route messages: the wire
  format between a channel's front end and its back end.
- **Access** — API keys and access keys, and parsing their resources and scopes.
- **Extensions** — the extension types, their configuration fields and RBAC scopes, marketplace and
  package-registry metadata, configuration bundles.
- **Where Kwirth runs** — the execution environment (`EExecutionEnvironment`: Kubernetes, Docker, desktop,
  ECS, Cloud Run, ACI) and the installation identity (`IInstallationIdentity`, `EInstallationIdSource`): the
  stable id extensions persist and federate by, also when there is no Kubernetes.
- **Contracts the core lends to channels** — sender and webhook access, the published HTTP routes
  (`IRouteAccess`, `ERouteOwnerKind`), the installed DCEs (`IDceAccess`, `IDceMeta`, registry entries) and
  the installed plugins' status (`IPluginAccess`, `IPluginStatus`, `EPluginState`, `IChannelInstances`).

## Who uses it

You do not install this in Kwirth: it is a dependency for **building** extensions. A channel's back end
usually takes it through [`@kwirthmagnify/kwirth-common-back`](https://www.npmjs.com/package/@kwirthmagnify/kwirth-common-back),
which re-exports it.

```bash
npm install @kwirthmagnify/kwirth-common
```

At runtime a plugin does not bundle it: the Kwirth core serves its own copy (`window.__kwirth__.kwirthCommon`
in the browser, `global.__kwirth_back__.kwirthCommon` in the server), so every extension sees the version
of the core it runs in.

## Links

- Kwirth: https://kwirthmagnify.dev
- Source: https://github.com/kwirthmagnify/kwirth (folder `common`)
