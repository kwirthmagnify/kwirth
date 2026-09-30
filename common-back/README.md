# @kwirthmagnify/kwirth-common-back

The server-side contracts of [Kwirth](https://kwirthmagnify.dev): the interfaces a Kwirth extension's back
end implements, and the helpers it uses, to run inside the Kwirth core.

Kwirth is an observability and operations tool for Kubernetes — logs, metrics, events and a marketplace of
extensions running inside one server. This package is what an extension's `back.js` is written against.

## What is in it

- **`IChannel`** — a channel (plugin) back end: instances, connections, commands, provider events, and
  `getInstances()`, which tells the Status channel what it has running. **Required since 0.6.0**: a plugin
  moving to this version has to implement it to build.
- **`IProvider`, `IPluvider`** — data producers, and plugins that also publish what they know in-process.
- **`ISender`, `IWebhook`** — outbound notifications and inbound events.
- **`ILogin`, `IIdpConnector`** — login pages and identity-provider connectors, with OIDC, OAuth2 and
  GitHub helpers.
- **`IDce`** — dynamic core extensions: objects the core creates once and other extensions consume by id.
- **`IBackChannelObject`, `IFederation`, Kubernetes helpers** — what the core hands an extension at startup.

It re-exports [`@kwirthmagnify/kwirth-common`](https://www.npmjs.com/package/@kwirthmagnify/kwirth-common),
so one import covers both.

## Who uses it

You do not install this in Kwirth: it is a dependency for **building** extensions.

```bash
npm install @kwirthmagnify/kwirth-common-back
```

At runtime an extension does not bundle it: the Kwirth core serves its own copy at
`global.__kwirth_back__.kwirthCommonBack`, so every extension sees the version of the core it runs in.

## Links

- Kwirth: https://kwirthmagnify.dev
- Source: https://github.com/kwirthmagnify/kwirth (folder `common-back`)
