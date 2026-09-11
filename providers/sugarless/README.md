# Sugarless Provider

Installable Kwirth **provider** that reads continuous glucose monitor readings from **LibreLinkUp**
(Abbott FreeStyle Libre) and pushes them to the channels subscribed to it.

It exists to make a point: **Kwirth is not a Kubernetes tool.** Not a pod, not a namespace, not a
container appears anywhere in this flow. Kubernetes is one source among others, and this provider is
the proof.

> **This is a demo, not a medical device.** Do not use it for treatment decisions. The reference bands
> it reports are the ones your own Abbott account already has configured, and nothing here is
> validated for clinical use.

## Before anything else: you need a *follower* account

This is where everyone gets stuck, so it comes first.

`/llu/connections` — the endpoint this provider reads — does **not** list your own sensors. It lists
**the patients an account follows**. With the patient's own credentials it answers `HTTP 200` with an
empty list, which looks like a bug and is not one.

LibreLinkUp is the *follower* app. So, once, outside Kwirth:

1. In the **LibreLink** app (the patient's, the one paired with the sensor): invite a follower by email.
2. Install **LibreLinkUp**, register with that email and **accept** the invitation. Both apps coexist
   on the same phone, and a patient can have several followers, so nothing existing gets disturbed.
3. Put **those** credentials — the follower's — in this provider's configuration.

Until the follower app shows the glucose value, the API will not serve it either.

## What a subscriber receives

Every event carries the `unit` and, when known, the patient's own `targetLow`/`targetHigh` as reported
by the API.

```ts
// on subscribing: the whole in-memory window, oldest first
{ payloadType: 'snapshot', samples: [{ timestamp, value, trend, isHigh, isLow }], unit, targetLow, targetHigh }

// afterwards: one new reading, already de-duplicated
{ payloadType: 'sample', sample: { timestamp, value, trend, isHigh, isLow }, unit, targetLow, targetHigh }

// connection fine, no current reading — NOT an error
{ payloadType: 'nodata', error: '...', unit }

// something to fix
{ payloadType: 'error', errorKind: 'authFailed' | 'clientVersion' | ..., error: '...', unit }
```

Subscribing takes no payload: there is a single account and a single series.

```ts
this.clusterInfo.addSubscriber('sugarless', this, {})
```

### `nodata` is not an error

LibreLinkUp does not read the sensor. It reads **what the patient's app has uploaded to the cloud**. If
that phone has not synced recently, the connection is perfectly fine and there is simply no current
reading. Treating that as a failure would raise an alarm for the normal case, so it has its own payload
type.

### The snapshot exists so a fresh tab is not empty

A channel registers **one subscriber per instance** (per open tab), and each one receives the whole
window the moment it subscribes. Without that, a tab opened between two polls would draw an empty chart
for up to a whole interval — which, in a demo, reads as broken.

### De-duplication happens here

The sensor produces a value roughly every 15 minutes, but it is polled every minute so that a new value
shows up promptly. Most polls therefore return the **same** reading. They are de-duplicated by
timestamp — two different readings can share a glucose value, so the timestamp is the only reliable
key — and a subscriber only ever sees new ones.

### Timestamps are UTC, deliberately

The API sends two marks per reading: `FactoryTimestamp` in **UTC** and `Timestamp` in the patient's
**local** time, with no offset. This provider uses the first one. A local time without an offset is
ambiguous by definition: during the autumn change one string names two instants, and during the spring
one it names an instant that does not exist. The symptom would not be an exception, it would be a chart
with a one-hour jump.

### Values are never converted

The reading, the target range and the alarm thresholds all arrive in the account's own unit, so they
are propagated as they are and `unit` says which one it is. No conversions, hence no conversion bugs.

## Configuration

Set it from the card's **⚙️ gear** in **☰ → Manage extensions → Providers**.

| Field | What it does |
|---|---|
| `email` | The **follower** account, not the patient's. |
| `password` | Persisted in a Secret. The dialog shows it masked, with an eye to reveal it. |
| `region` | Empty = derived automatically from the login token. Set it to override (`eu`, `us`, …). |
| `intervalSeconds` | How often the API is polled. Minimum 30; the default 60 is plenty, given the sensor's ~15 min cadence. |
| `maxSamples` | Size of the in-memory history. 240 ≈ 4 h at one sample per minute. |
| `clientVersion` | The client version declared to Abbott. **Configurable on purpose:** see below. |

**Test** runs the real login and read **from the backend**, and reports the region actually used, how
many patients the account follows and whether there is a current reading. It runs in the backend
because that is where the network and the egress rules live; testing from the browser would prove
nothing about the polling that follows.

Saving applies **hot**, with no Kwirth restart. It does restart the history: new credentials may point
at a different account, and mixing two patients in one chart would be worse than losing the window.

### Why `clientVersion` is a field

Abbott validates the declared client version and raises the minimum over time. The failure is peculiar
and worth knowing: the **login accepts** an outdated version and hands out a token normally, while the
**read rejects** it with `HTTP 403` and `status 920`. The symptom is therefore *"I authenticate fine but
get no data"*. When that happens, the provider reports the minimum the API is asking for, and you raise
this field — no release needed.

### Where it is stored

The provider owns its configuration and splits it by sensitivity:

- `kwirth-store-provider-sugarless-config` → **ConfigMap**: email, region, interval, history size,
  client version. Still inspectable with `kubectl`, which is what lets you audit which account is being
  queried.
- `kwirth-store-provider-sugarless-creds` → **Secret**: the password.

It does **not** use `configure()` nor the core-managed provider ConfigMap. That is not a stylistic
choice: the core's generic provider config writes **everything** to a ConfigMap, which would leave the
password of somebody's health account in plain text.

## Polling is not lazy

Unlike `http-pull-push`, this provider polls while it is running and configured, **with or without
subscribers**. That is deliberate: here the history *is* the product. If it only polled while a tab was
open, opening one would start the chart from scratch and there would be no history to show.

With no credentials configured it makes **no requests at all**.

## Development

```
npm install
npm run watch     # rebuilds dist/back.js and dist/front.js on every change
npm test          # node:test suite, no network involved
```

Register it in `back/kwirth-dev.json` under `providers` to have the dev core load it from `dist/`.

**Every change to `back.js` needs a core restart, and the log will tell you otherwise.** The dev
watcher swaps the *constructor* in the registry and logs `Provider 'sugarless' backend reloaded`, but
the instance that is already running — and the `configRouter` Express has already mounted — stays on
the old code. So the front picks the new bundle up on a browser reload while the backend does not, and
you end up debugging a mismatch between two builds. Front-only changes do reload on their own.

The test suite injects a fake fetcher, so **no test touches the network** and none of them needs a real
account. The fixtures carry the verified *shape* of the API responses with invented values: the real
capture that pinned the contract down is somebody's health data, and this repository is public.

Requires a Kwirth core that injects provider storage
(`@kwirthmagnify/kwirth-common-back >= 0.5.37`).
