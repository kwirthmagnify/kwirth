# Kafka

The Kafka provider consumes messages from one or more Kafka topics and distributes them to subscribing channels using the same space/type routing model as the [Business provider](business). It supports multiple simultaneous broker connections, SASL authentication, and SSL.

?> The Kafka provider is an **installable provider** — it is not bundled in Kwirth core. Install it via the provider management UI or `kwirth-dev.json`.

## What for

  - Ingest business events, alerts, or operational data that your existing systems already publish to Kafka.
  - Let channels like Pinocchio or Censor react to Kafka messages in real time without modifying the producers.
  - Bridge Kafka topics into the Kwirth space/type event model.

## Features

  - **Multiple connections** — each subscriber can declare several broker sets (different clusters or environments) consumed simultaneously.
  - **Topic → space mapping** — each topic is mapped to a logical space name. An optional `types` filter whitelists specific `type` values from the message payload.
  - **SASL / SSL** — supports `plain`, `scram-sha-256`, and `scram-sha-512` authentication mechanisms.
  - **Consumer group** — configurable `groupId` per connection for offset management.

## Subscribing from a channel

```typescript
this.clusterInfo.addSubscriber('kafka', this, {
    connections: [
        {
            brokers: ['kafka-host:9092'],
            ssl: true,
            sasl: { mechanism: 'plain', username: 'user', password: 'pass' },
            groupId: 'kwirth-alerts',
            spaces: [
                { topic: 'k8s-alerts',  name: 'alerts',  types: ['Critical', 'Warning'] },
                { topic: 'k8s-metrics', name: 'metrics' }
            ]
        }
    ]
} as IKafkaProviderConfig)
```

Each call to `processProviderEvent` receives an object with the same shape as the Business provider event (`last` + `all`), so channels built for Business are compatible with Kafka with no code changes.

## Message format

Kafka messages are expected to be JSON. The optional `types` filter matches the `type` field of the parsed payload. Messages that fail JSON parsing are forwarded as-is under the configured space with no type filtering.
