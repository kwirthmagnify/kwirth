# Webhooks (inbound event sources)

> **Type:** Webhooks<br>
> **Managed from:** ☰ → Manage extensions → Webhooks

## What a webhook is

A **webhook** is an **input adapter** — the **inbound counterpart of a [sender](../senders)**. Where a sender delivers a message *out* of Kwirth (fire-and-forget), a webhook receives HTTP callbacks *into* Kwirth from an external system (a ticketing tool, a SCM, an alerting service), **verifies** and **parses** them, and hands a **normalized event** to whoever is interested.

The key ideas:

- Each webhook has an **id** (e.g. the provider it understands) and holds one or more **named configurations** — each one gets its **own public URL** with an **opaque token**: `…/webhook/<id>/<token>`.
- That **token is a capability**: it both routes the callback and authenticates the caller (the URL is unguessable). On top of it, each webhook applies its **own verification** (a shared secret in a header, an HMAC signature…) — the core is auth-agnostic and hands the raw request to the artifact's `verify()`.
- Delivery is **consumer-driven and scoped to a specific config**: a webhook doesn't target anyone. A channel/plugin **subscribes to one of a webhook's configs** — the pair *(webhook id, config name)* — and receives **only that config's** events. Because webhooks are shared across all of Kwirth (several configs, and several consumers, of the same type can coexist), the subscription pins the **exact instance**; anything not subscribed to that config receives nothing. Every delivered event also carries the **config name** it arrived on, so a consumer always knows which instance fired.

## The public URL (token)

When you save a webhook config, the manager shows its **Webhook URL** — copy it and paste it into the external system's outbound-callback configuration (e.g. an automation rule's "send web request"). Two controls matter:

- **Copy** — the URL includes the opaque token; treat it as a secret and always serve it over **HTTPS**.
- **Regenerate** — mints a **new token** (new URL) and invalidates the old one. Use it if the URL leaks; remember to repaste the new URL into the provider.

## Managing & configuring webhooks

Open **☰ → Manage extensions → Webhooks**. Each installed webhook is a **card** showing its description, how many **configs** it holds, and a **⚙️ gear** / **🗑️ delete**:

![Manage webhooks](../../../_media/guide/manage-webhooks.png)

1. Click a webhook's **gear** to open its config manager. Each webhook keeps a **list of named configs** — pick one to edit or **New** to add. Kwirth renders the form from the **webhook's own field schema** (e.g. the secret it expects), so every field is typed (text / password / select).
2. **Save** the config. The manager then shows the **Webhook URL** with its token, plus **Copy** and **Regenerate**:

![Configure a webhook](../../../_media/guide/webhook-config.png)

3. Paste that URL into the external provider so it calls back on the events you care about, adding whatever **verification** the webhook expects (typically a secret in an `Authorization` header that must match the config).

## Using webhooks from a channel

A channel/plugin consumes a webhook by **subscribing to one of its configs** — there is **no destination picker** on the webhook side. At startup the consumer registers for a **(webhook id, config name)** pair; from then on it receives **only that config's** verified, parsed events, each tagged with the config it arrived on. This mirrors how channels subscribe to a **[provider](../providers)**'s events, but narrowed to the exact instance — so two consumers can each own their own config of the same webhook type without crosstalk.

Concretely, a consumer's settings offer **two paired pickers**: the **webhook type** and then one of **its configs**. This is why a config's name matters beyond the URL — it's the address the consumer subscribes to. (For a worked example, the Excubitor channel wires its ticketing status callback exactly this way: it pins a sender+config to open the ticket and a webhook+config to receive its status.)

## Admin guide

- **Install / enable / remove:** from **☰ → Manage extensions → Webhooks**, using the common flow in [Extending Kwirth](../../admin/08-extending-kwirth).
- **Exposure:** the receiver is a single public endpoint on the Kwirth server; the token in the URL + the webhook's own verification are what protect it. Serve Kwirth over **HTTPS** and keep the URLs secret.
- **Secrets:** the shared secret / signing key a webhook expects is stored as webhook config — treat it as a credential (it's a masked field).

## Notes

- Webhooks are **backend-only** — there's no per-webhook channel tab; you configure them centrally and channels **subscribe** to them.
- Unlike senders, a webhook config's URL/token is **per-instance and unguessable**, so webhook configs are **not** exportable/importable (exporting would leak the capability and importing couldn't recreate the URL already registered in the provider).

---

← Back to [Extension manuals](../index)
