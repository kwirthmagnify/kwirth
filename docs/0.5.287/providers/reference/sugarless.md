# Sugarless

Reads continuous glucose monitor readings from LibreLinkUp (Abbott FreeStyle Libre), keeps a rolling
history in memory and pushes it to the subscribing channels.

Installable provider, package `@kwirthmagnify/kwirth-provider-sugarless`. Requires a core that injects
provider storage (`@kwirthmagnify/kwirth-common-back >= 0.5.37`) and declares `requiresRestart: true`,
because it serves its own configuration router.

Its consumer is the [sugarless plugin](../../plugins/reference/sugarless), the first **autonomous channel**
in kwirth.

## Why it is not an `http-pull-push` connection

The obvious question, since there is already a generic HTTP polling provider. The answer is that
LibreLinkUp is not one request, it is a **session with a computed value in the middle**:

1. `POST /llu/auth/login` returns a token **and** a user id.
2. Every read must carry an `Account-Id` header whose value is the **SHA-256 of that user id**.
3. A `401` means the session expired and the whole thing starts again.

`http-pull-push` issues one stateless request per cycle: it can present a credential it was given, not
*acquire* one. And the `Account-Id` is not even a value to copy from one response into the next — it has to
be **computed**, which also puts it outside any declarative template scheme.

The line this draws is worth keeping: **`http-pull-push` does declarative pulling; anything that has to
compute or negotiate something per request is its own provider.** The same applies to APIs with
per-request signing (AWS SigV4) or interactive OAuth2.

## Configuration model

One configuration, not a list — there is a single account.

```ts
interface ISugarlessConfig {
    email: string          // the FOLLOWER account, not the patient's
    password: string       // the only secret field
    region: string         // '' = derive from the login token
    intervalSeconds: number
    maxSamples: number     // size of the in-memory ring buffer
    clientVersion: string  // declared to Abbott; its minimum rises over time
}
```

Served and stored by the provider itself, through its own router mounted by the core behind accessKey
validation at `/core/providerconfig/sugarless`:

- `GET /config` — the configuration, **password included**.
- `PUT /config` — replaces it, validated and applied hot.
- `POST /test` — performs a real login and read, without persisting anything.

The secret travels to the front like any other field; what makes it a secret is **where it is persisted**,
not that it is hidden from the browser. The dialog masks it and offers an eye to reveal it.

### Storage

- `kwirth-store-provider-sugarless-config` → **ConfigMap**: email, region, interval, history size, client
  version. Auditable with `kubectl`, which is the point of keeping the email there.
- `kwirth-store-provider-sugarless-creds` → **Secret**: the password.

It does **not** use `configure()` nor the core-managed provider ConfigMap, and that is not a stylistic
choice: the core's generic provider configuration writes everything to a ConfigMap, which would leave the
password of somebody's health account in plain text.

## Subscription

No payload — one account, one series:

```ts
this.clusterInfo.addSubscriber('sugarless', this, {})
```

A channel should register **one subscriber per instance** (per open tab) rather than subscribing itself
once. The provider hands each new subscriber the whole window at the moment it subscribes, so a tab opened
between two polls draws a full chart immediately instead of waiting a whole interval.

## Events

```ts
interface ISugarlessEvent {
    payloadType: 'snapshot' | 'sample' | 'nodata' | 'error'
    unit: 'mg/dL' | 'mmol/L'
    samples?: IGlucoseSample[]   // snapshot: the whole window, oldest first
    sample?: IGlucoseSample      // sample: one new reading
    errorKind?: string
    error?: string
    targetLow?: number           // the patient's own target range, from the API
    targetHigh?: number
}

interface IGlucoseSample {
    timestamp: number   // epoch ms, from the UTC field
    value: number       // in the account's unit; never converted
    trend: number       // 1..5, 3 = stable
    isHigh: boolean     // computed by Abbott, not here
    isLow: boolean
}
```

### `nodata` is not an error

LibreLinkUp does not read the sensor, it reads what the patient's app uploaded to the cloud. A device that
has not synced recently yields no current reading with the connection perfectly healthy, so it has its own
payload type. Treating it as a failure would flag the normal case several times a day.

### Timestamps are UTC, deliberately

The API sends two marks per reading: one in UTC and one in the patient's local time **with no offset**. This
provider uses the UTC one. A local time without an offset is ambiguous by definition — during the autumn
change one string names two instants, and during the spring one it names an instant that does not exist —
and the symptom would not be an exception, it would be a chart with a one-hour jump.

### De-duplication happens here

The sensor produces a value every ~15 minutes but is polled every minute, so most cycles return the **same**
reading. They are discarded by timestamp — two different readings can share a glucose value, so the
timestamp is the only reliable key — and subscribers only ever see new ones.

## Polling policy

**Not lazy.** The provider polls while it is running and configured, with or without subscribers, because
the history is the product. With no credentials configured it makes no requests at all.

Saving configuration restarts polling and **clears the history**: new credentials may point at a different
account, and mixing two patients in one chart is worse than losing the window.

## Failure modes worth knowing

| Condition | How it surfaces |
|---|---|
| Client version below Abbott's minimum | The login **succeeds** and the read fails — symptom is "authenticates but no data". Reported with the minimum required. |
| Missing `Account-Id` | `HTTP 400 RequiredHeaderMissing`. Handled internally; only relevant if you fork this. |
| Credentials belong to the patient | `HTTP 200` with an empty list, reported as "does not follow any patient". |
| Account in another region | The login answers `200` with a redirect marker, **not** a `3xx`. Reported, not followed. |
| Session expired | `401` → one re-login and one retry, never a loop. |
