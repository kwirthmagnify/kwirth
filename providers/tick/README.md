# Kwirth Tick Provider

A heartbeat provider for [Kwirth](https://kwirthmagnify.dev): it emits a tick event **every 5 seconds** to
all of its subscribers, and nothing else.

Its job is to give you something that arrives on a known cadence. When a channel shows nothing, the
question is always the same — is the channel broken, or is there simply nothing to show? Subscribe it to
`tick` and you have the answer in five seconds.

> ⚠️ **It is a demo, not a production artifact.** The events are synthetic.

## What it sends

A tick, every 5 seconds, to every subscriber. There is no configuration: no interval to set, no filter to
write. That is deliberate — the moment it has options, it stops being useful as a control.

## Installing it in Kwirth

**☰ → Manage extensions → Providers**, find **Tick Provider** in the marketplace and install it, then
subscribe a channel to it.

To develop against it instead, point `kwirth-dev.json` at your build:

```json
{
  "providers": {
    "tick": "../providers/tick/dist"
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
