# Trivy (provider)

> **Type:** Provider (installable)<br>
> **Package:** `@kwirthmagnify/kwirth-provider-trivy`

## What it does

The **Trivy** provider **watches the Trivy Operator's CRDs** in the cluster (vulnerability, config-audit, exposed-secret and SBOM reports) and streams those **security findings** to subscribing channels. It's the **data path behind the [Trivy channel](../plugins/trivy)** — the channel visualises what this provider feeds it.

## When to use it

- It's pulled in whenever you use the **Trivy channel** — you don't normally interact with it directly.
- Any channel can subscribe to `trivy` to consume security findings.

## Managing the Trivy Operator

This provider reads what the **Trivy Operator** writes as CRDs, so without the operator there is nothing
to read and the Trivy channel shows an empty screen. **Installing and removing it is done here**, from
this provider's gear:

☰ → **Manage extensions → Providers → Trivy → the gear** (the ⚙ on its card).

The dialog shows whether the operator is **installed** and offers **INSTALL** and **REMOVE**. It re-reads
the status after every action instead of assuming it worked — applying a hundred manifests can fail
halfway, and a dialog that claims success because a button was pressed is worse than one that says
nothing.

> ⚠️ **Installing deploys the operator, its CRDs and its RBAC across the whole cluster**; removing takes
> them away, and every report with them.

🔴 **It asks for `admin`**, and that check lives in the provider, not in the screen. The providers
manager is an admin-only page, but a page is not a door: what the core puts in front of these routes is
*authentication* — proof that you hold a valid kwirth key — so without the check any key at all could
deploy or delete the operator with a single HTTP call.

> **This moved in `provider/trivy@0.4.0`.** It used to be a **MANAGE TRIVY** button inside the Trivy
> *channel*. The operator is what produces this provider's data, so it belongs to the provider; and the
> channel no longer has to carry a permission ladder of its own just to decide whether to light a button.
> The matching channel version is `plugin/trivy@0.3.0`, which **requires this provider at 0.4.0 or
> later** — otherwise you could end up with a channel without the button and a provider without the
> gear, and nowhere at all to install the operator from.

## Configuration

Beyond managing the operator there is nothing to configure: the provider watches the CRDs and forwards
what it finds. Once the operator produces its reports, this provider picks them up automatically.

## Notes

- Findings originate from the **Trivy Operator**; the provider just watches its CRDs and forwards changes live.
- See the **[Trivy channel](../plugins/trivy)** for the full user experience (cards, filters, reports).

---

← Back to [Providers](index)
