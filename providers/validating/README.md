# Validating Provider

A Kwirth **provider** that exposes an HTTP endpoint for Kubernetes
[validating admission webhooks](https://kubernetes.io/docs/reference/access-authn-authz/extensible-admission-controllers/).

> ⚠️ **This is a scaffold, not a working admission controller yet.** The endpoint answers, the
> subscription contract exists, and that is all: `/validate` currently returns an empty object to
> every request and **no admission review is dispatched to subscribers**. It is published so the
> route and the contract are in place; do not wire a cluster's admission policy to it expecting it
> to decide anything.

Part of [Kwirth](https://kwirthmagnify.dev) — real-time Kubernetes observability.

## Install

From the Kwirth extension manager, or directly:

```
https://registry.npmjs.org/@kwirthmagnify/kwirth-provider-validating/-/kwirth-provider-validating-<version>.tgz
```

## The endpoint

It provides a **public router** mounted under the alias `validating`:

```
POST /provider/validating/validate
```

Because a provider's router is only mounted when the core starts, **installing or updating this
provider requires a core restart** before the route answers. Without it the endpoint returns 404,
which looks exactly like a misconfigured webhook.

## How a channel subscribes

```ts
{
  kinds: ['Pod', 'Deployment']
}
```

`kinds` is the list of resource kinds the channel is interested in. The contract is in place; the
dispatch that would use it is not implemented yet.

## Development

```
npm install
npm run build      # writes dist/
npm test
```

The build produces `dist/`, which is what gets published.
