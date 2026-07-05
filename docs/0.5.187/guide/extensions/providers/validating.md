# Validating (provider)

> **Type:** Provider · **Package:** `@kwirthmagnify/kwirth-provider-validating`

## What it does

The **Validating** provider lets Kwirth observe **Kubernetes admission decisions**. It exposes a `/validate` endpoint that the Kubernetes API calls as a **Validating Admission Webhook**; each call becomes a Kwirth event delivered to subscribing channels. This lets channels react to — or analyse — objects **as they're admitted** to the cluster.

## When to use it

- Feed **admission events** (create/update attempts) into channels like **[Pinocchio](../plugins/pinocchio)** for policy analysis.
- Observe what's being submitted to the API in real time.

## Configuration

The provider itself has no in-UI form (its gear is disabled); the setup is on the **Kubernetes side**: register a **ValidatingWebhookConfiguration** pointing at Kwirth's `/validate` endpoint (rules/namespaces select which objects trigger it).

## Notes

- A validating webhook sits on the **admission path** — a misbehaving webhook can block admissions, so scope its rules carefully and set an appropriate `failurePolicy`.
- Channels subscribe to `validating` to receive the admission events.

---

← Back to [Providers](index)
