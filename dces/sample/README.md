# Kwirth Sample DCE

A **dynamic core extension** (DCE) for [Kwirth](https://kwirthmagnify.dev), and the reference for writing one.

A DCE brings **objects**, not data and not screens: Kwirth calls its factory **once**, keeps what it returns, and any other extension can ask for it by id. Code that several extensions share but that does not belong in the Kwirth core — a suite's icon set, a client, a cache, a registry — lives in a DCE, so it is downloaded once and instantiated once.

This one hands out a **shared counter**. Two consumers calling `next()` see `1` and `2`: they hold the same instance. Two copies would each say `1`.

## What it provides

```ts
interface ISampleDce {
    id: string           // 'sample'
    createdAt: number    // the same for every consumer: there is one instance
    boots: number        // how many times the back-end factory has run on this Kwirth (persisted)
    next(): number       // the shared counter
    greet(name: string): string
}
```

## Consuming it

Declare the dependency in the consumer's `package.json`, with the minimum version:

```json
"requiresExtension": ["dce:sample:0.1.0"]
```

Kwirth refuses to install a consumer whose DCE is missing or too old, and refuses to uninstall a DCE that somebody requires.

In the back end:

```ts
import { getDce } from '@kwirthmagnify/kwirth-common-back'
const sample = getDce<ISampleDce>('sample')   // throws if it is not loaded, and says why
sample.next()
```

`getDce()` never returns `undefined`: a DCE that is not installed, or whose factory failed, is an error with its cause.

## Installing

From **☰ → Manage extensions → DCE** in Kwirth, or from the API:

```
POST /core/dce/install   { "url": "<tgz url>" }
```

Updating a DCE needs the Kwirth back end **restarted**: the consumers already running keep the instance they were given.

## Building

```
npm install
npm run build      # typecheck + dist/front.js + dist/back.js
npm run watch      # rebuild on every save (front.js is re-read on request; back.js needs a restart)
npm test
```

Part of [Kwirth](https://github.com/kwirthmagnify/kwirth) — `dces/sample`.
