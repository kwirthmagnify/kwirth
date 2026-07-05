# Trivy (provider)

> **Type:** Provider (installable) · **Package:** `@kwirthmagnify/kwirth-provider-trivy`

## What it does

The **Trivy** provider **watches the Trivy Operator's CRDs** in the cluster (vulnerability, config-audit, exposed-secret and SBOM reports) and streams those **security findings** to subscribing channels. It's the **data path behind the [Trivy channel](../plugins/trivy)** — the channel visualises what this provider feeds it.

## When to use it

- It's pulled in whenever you use the **Trivy channel** — you don't normally interact with it directly.
- Any channel can subscribe to `trivy` to consume security findings.

## Configuration

No in-UI form (its gear is disabled). It requires the **Trivy Operator** to be running in the cluster (the [Trivy channel](../plugins/trivy) can deploy it for you via **MANAGE TRIVY**). Once the operator produces its CRD reports, this provider picks them up automatically.

## Notes

- Findings originate from the **Trivy Operator**; the provider just watches its CRDs and forwards changes live.
- See the **[Trivy channel](../plugins/trivy)** for the full user experience (cards, filters, reports).

---

← Back to [Providers](index)
