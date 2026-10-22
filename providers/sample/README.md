# Kwirth Sample Provider

A **reference provider** for [Kwirth](https://kwirthmagnify.dev): the smallest thing that is still a real
provider. It emits a periodic heartbeat event to every channel subscribed to it — no filtering, no
configuration, no external system to connect to.

It exists to be read and copied. If you are writing your first provider, this is the one to look at: it
shows the whole contract — `startProvider`, the subscriber dispatch and the cleanup on stop — with
nothing else in the way.

> ⚠️ **It is a demo, not a production artifact.** It produces synthetic events, which is exactly what you
> want while you are wiring a channel up and need something to arrive.

## What it sends

One event per interval to each subscriber:

```json
{ "timestamp": 1761000000000, "message": "sample heartbeat" }
```

Every heartbeat goes to everybody: there is no filter. The provider counts deliveries since startup, one
per call to a subscriber, so you can tell at a glance whether anything is listening.

## Installing it in Kwirth

**☰ → Manage extensions → Providers**, find **Sample Provider** in the marketplace and install it. Then
subscribe a channel to it and you will start seeing heartbeats arrive.

To develop against it instead, point `kwirth-dev.json` at your build:

```json
{
  "providers": {
    "sample": "../providers/sample/dist"
  }
}
```

## About Kwirth

**Kwirth** is an open-source Kubernetes observability and operations tool: logs, metrics, events and more,
in real time, extended with plugins and providers like this one.

- Website: **https://kwirthmagnify.dev**
- Source: **https://github.com/kwirthmagnify/kwirth**

## License

Same as Kwirth — see https://github.com/kwirthmagnify/kwirth.
