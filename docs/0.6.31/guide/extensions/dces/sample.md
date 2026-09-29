# Sample DCE

The reference [dynamic core extension](index), and the one to install first if you want to see the machinery work. It provides a **shared counter**: two consumers calling `next()` see `1` and `2`, because they hold the same instance. Two copies would each say `1`.

| | |
|---|---|
| id | `sample` |
| package | `@kwirthmagnify/kwirth-dce-sample` |
| source | `dces/sample` in the kwirth repo |

## What it provides

```ts
interface ISampleDce {
    id: string           // 'sample'
    createdAt: number    // the same for every consumer: there is one instance
    boots: number        // how many times the back-end factory has run on this kwirth (persisted)
    next(): number       // the shared counter
    greet(name: string): string
}
```

`boots` is there to show the host's `configMaps` at work: the factory reads the count, adds one and writes it back, so it survives restarts. The counter does not — a new instance starts at zero.

## Consuming it

```json
"requiresExtension": ["dce:sample:0.1.0"]
```

```ts
import { getDce } from '@kwirthmagnify/kwirth-common-back'
const sample = getDce<ISampleDce>('sample')
sample.next()
```

## What to look for in the log

When kwirth starts, before any other extension:

```
[core] [INFO] [dce:sample] sample DCE created (boot #3)
[core] [INFO] DCE 'sample' loaded
```

The `boot #` grows by one on every restart.
