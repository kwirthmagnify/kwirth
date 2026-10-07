# Kafka Provider

A Kwirth **provider** that consumes Kafka topics and hands each message to the channels that asked
for it, grouped into **spaces**.

It is a bridge, not a processor: it does not interpret, store or alert on anything. A channel
subscribes saying which brokers to reach, which topics to read and what to call them; the provider
connects, consumes and dispatches. The logic lives in whatever subscribes.

Part of [Kwirth](https://kwirthmagnify.dev) — real-time Kubernetes observability.

## Install

From the Kwirth extension manager, or directly:

```
https://registry.npmjs.org/@kwirthmagnify/kwirth-provider-kafka/-/kwirth-provider-kafka-<version>.tgz
```

It exposes no HTTP router and needs no core restart.

## How a channel subscribes

The subscription config is a list of **connections**. Each one is a broker set plus its security
plus the topics to read from it, so a single subscriber can consume from several Kafka clusters at
once:

```ts
{
  connections: [
    {
      brokers: ['kafka-host:9092'],
      clientId: 'kwirth',            // optional
      ssl: true,                     // optional
      sasl: {                        // optional
        mechanism: 'plain',          // plain | scram-sha-256 | scram-sha-512
        username: 'user',
        password: 'pass'
      },
      groupId: 'kwirth-alerts',      // optional, defaults to 'kwirth-kafka'
      spaces: [
        { topic: 'k8s-alerts',  name: 'alerts',  types: ['Critical', 'Warning'] },
        { topic: 'k8s-metrics', name: 'metrics' }
      ]
    }
  ]
}
```

**`spaces` maps a topic to a name you choose.** That name is what the subscriber sees, so the
consumer is not tied to how the topics happen to be called on the broker.

**`types` is an optional whitelist.** When the message body is JSON with a `type` field, only
messages whose type is in the list are forwarded. Without it, everything on that topic goes through.

## What a subscriber receives

One event per message:

```ts
{
  space: 'alerts',        // the name you gave the topic in `spaces`
  type: 'k8s-alerts',     // the topic the message came from
  data: { ... }           // the message body, parsed as JSON
}
```

A body that is not valid JSON is **not dropped**: it arrives as `{ raw: '<the original string>' }`,
so a malformed producer shows up as something you can see rather than as silence.

## Connection sharing

Consumers are pooled by the combination of **brokers + groupId + security**. Two subscribers asking
for the same cluster with the same group share one consumer rather than opening two, and the
consumer is disconnected when the last subscriber using it goes away.

This matters for Kafka's own semantics: consumers in the same `groupId` share partitions, so giving
two unrelated subscriptions the same group means they each see *part* of the traffic. Use a distinct
`groupId` per logical consumer unless you deliberately want that split.

## Development

```
npm install
npm run build      # writes dist/
npm test
```

The build produces `dist/`, which is what gets published.
