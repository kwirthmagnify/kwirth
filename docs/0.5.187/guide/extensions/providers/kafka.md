# Kafka (provider)

> **Type:** Provider (installable) · **Package:** `@kwirthmagnify/kwirth-provider-kafka`

## What it does

The **Kafka** provider **consumes messages from Kafka topics** and distributes them to subscribing channels using the same **space / type** routing model as the Business provider. It bridges data your systems already publish to Kafka into the Kwirth event model — so channels like **[Pinocchio](../plugins/pinocchio)** or **[Censor](../plugins/censor)** can react to Kafka messages in real time without touching the producers.

## When to use it

- Ingest **business events, alerts or operational data** already on Kafka.
- React to Kafka topics from Kwirth channels with no producer changes.

## Configuration

A Kafka subscription declares one or more **connections**, each with:

| Setting | What it is |
|---|---|
| **brokers** | Broker host list (e.g. `kafka-host:9092`). Multiple broker sets can run simultaneously. |
| **ssl** | Enable TLS to the brokers. |
| **sasl** | Authentication: `plain`, `scram-sha-256` or `scram-sha-512` (+ username/password). |
| **groupId** | Consumer group for offset management. |
| **spaces** | Topic → **space** mapping; each maps a `topic` to a logical space `name`, with an optional `types` whitelist filtering the message payload's `type`. |

Messages are expected to be **JSON**; the `types` filter matches the parsed `type` field. See the reference [Kafka provider](../../providers/reference/kafka) for the exact subscription shape.

## Notes

- Broker credentials (SASL user/password) are sensitive — protect the configuration.
- Events reach channels in the **same shape as the Business provider**, so Business-compatible channels work with Kafka unchanged.

---

← Back to [Providers](index)
