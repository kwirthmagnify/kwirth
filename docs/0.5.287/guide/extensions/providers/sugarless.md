# Sugarless (provider)

> **Type:** Provider (installable)<br>
> **Package:** `@kwirthmagnify/kwirth-provider-sugarless`

## What it does

The **Sugarless** provider reads continuous glucose monitor readings from **LibreLinkUp** (Abbott
FreeStyle Libre) and pushes them to the channels subscribed to it. It keeps a rolling history in memory,
so a channel that subscribes gets a whole window of readings straight away instead of starting from an
empty chart.

It pairs with the [Sugarless plugin](../plugins/sugarless), which draws the chart.

> **This is a demo, not a medical device.** Do not use it for treatment decisions. Nothing here is
> validated for clinical use.

## Why it exists

To show that **kwirth is not a Kubernetes tool**. Not a pod, not a namespace, not a container takes part
in this flow: the data lives in an API on the internet, and kwirth ingests it, keeps it and charts it like
any other source. Kubernetes is one origin among others, and this provider is the proof.

## Before anything else: you need a *follower* account

This is where everybody gets stuck, so it comes first.

The endpoint this provider reads does **not** list your own sensors. It lists **the patients an account
follows**. With the patient's own credentials it answers politely with an empty list, which looks like a
bug and is not one.

LibreLinkUp is the *follower* app, so once, outside kwirth:

1. In the **LibreLink** app (the patient's, the one paired with the sensor), invite a follower by email.
2. Install **LibreLinkUp**, register with that email and **accept** the invitation. Both apps live happily
   on the same phone, and a patient can have several followers, so nothing existing gets disturbed.
3. Put **those** credentials — the follower's — in this provider's configuration.

Until the LibreLinkUp app shows the glucose value, the API will not serve it either.

## Configuration

Set it from the card's **⚙️ gear** in **☰ → Manage extensions → Providers**.

| Field | What it does |
|---|---|
| **Email** | The **follower** account, not the patient's. |
| **Password** | Shown masked, with an eye to reveal it. Stored in a Secret, never in the ConfigMap. |
| **Region** | Leave it empty and it is derived automatically from the login. Set it (`eu`, `us`…) to override. |
| **Interval (s)** | How often the API is polled. Minimum 30. The default 60 is plenty: the sensor itself only produces a value every ~15 minutes. |
| **Max samples** | How many readings the in-memory history keeps. 240 ≈ 4 hours at one per minute. |
| **Client version** | The client version declared to Abbott. See below — this one is not decoration. |

> **Restart the core after installing it**, as kwirth prompts you to. This provider serves its own
> configuration dialog from its own HTTP route, and the core wires routes in **while it starts up** — so
> until you restart, the gear opens but every action answers `HTTP 404`. Nothing is broken and there is
> nothing to reinstall. See [When a restart is needed](../../admin/08-extending-kwirth#when-a-restart-is-needed).

### Test

**Test** performs the real login and read **from the backend**, and reports the region actually used, how
many patients the account follows and whether there is a reading available right now.

It runs in the backend on purpose: that is where the network, the certificates and the egress rules live.
Testing from your browser would prove nothing about the polling that follows.

### Why "client version" is a field you may have to touch

Abbott validates the client version an application declares, and raises the minimum over time. The failure
is peculiar and worth recognising: **the login accepts** an outdated version and hands out a session
normally, while **the read rejects it**. So the symptom is *"it authenticates fine but shows no data"*.

When that happens, Sugarless reports the minimum the API is asking for, and you type it into this field.
No update, no reinstall.

## What changes when you save

Saving applies immediately, with no kwirth restart. It does **restart the history**: new credentials may
point at a different account, and mixing two people's readings in one chart would be worse than losing the
window.

## Where the credentials are kept

The provider owns its configuration and splits it by sensitivity:

- A **ConfigMap** holds the email, region, interval, history size and client version. Still inspectable
  with `kubectl`, which is what lets you audit which account is being queried.
- A **Secret** holds the password.

## Polling does not wait for an audience

Unlike most providers, Sugarless polls while it is running and configured, **whether or not anyone has a
tab open**. That is deliberate: here the history *is* the product, and if it only polled while somebody was
watching, opening a tab would start the chart from scratch.

With no credentials configured it makes **no requests at all**.

Worth knowing for the bill: at the default 60 s that is 1440 calls a day against an API that is not
official. If that bothers you, raising the interval to 300 s removes 80% of them and costs nothing
perceptible, because the pace is set by the sensor, not by the polling.

## Troubleshooting

| What you see | What it means |
|---|---|
| *"does not follow any patient"* | The credentials are a patient's, not a follower's. See the top of this page. |
| *"client version is too old"* | Abbott raised the minimum. The message includes the version to type into **Client version**. |
| *"wrong region"* | The account lives elsewhere. The message says which region; type it into **Region**. |
| **No current reading** in the chart | Not a failure. The patient's phone has not synced recently, so there is nothing new to serve. |
| Everything answers `HTTP 404` | The core has not been restarted since the provider was installed. |
