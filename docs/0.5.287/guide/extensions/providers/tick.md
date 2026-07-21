# Tick (provider)

> **Type:** Provider<br>
> **Package:** `@kwirthmagnify/kwirth-provider-tick`

## What it does

The **Tick** provider is a **demo/test data source**: it fires a **heartbeat event every few seconds** (≈5s) to all subscribing channels. It carries no real cluster data — its only job is to prove that a channel's **subscription pipeline** works end to end.

## When to use it

- **Develop or debug** a channel/provider integration without needing real events.
- Verify that a subscriber receives events at all before wiring it to a real source.

## Configuration

**None.** Tick has no settings — its gear in **☰ → Manage extensions → Providers** is disabled. Install it, and any channel that subscribes to `tick` starts receiving heartbeats.

## Notes

- Purely for **testing/demo** — don't rely on it in production flows.
- Pairs well with the **[Echo](../plugins/echo)** channel for a zero-dependency pipeline check.

---

← Back to [Providers](index)
