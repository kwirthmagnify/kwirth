# K8s Config & Secrets (AI toolset)

> **Type:** AI toolset<br>
> **Package:** `@kwirthmagnify/kwirth-aitoolset-k8s-secrets`<br>
> **Tools:** 3<br>
> **Needs from the host:** cluster access (`K8S`)

## What it does

**The configuration a workload actually consumes.** Not what the manifest says it should get — what is
really in the ConfigMap it reads, which keys the Secret it mounts contains, and whether the TLS certificate
behind a hostname is about to expire.

A surprising share of production incidents are a value that is not what everybody assumed. This toolset is how
the model checks instead of assuming.

## The tools

| Tool | Effect | Sensitivity | What it does |
|---|---|---|---|
| `get_configmap` | read | **secret** | Returns a ConfigMap data (key → value) plus metadata (resourceVersion, lastModified). Use to inspect the ACTUAL config a workload consumes and to check whether it changed recently — a ConfigMap value change (same env var, different value) does NOT create a Deployment revision, so it is invisible to get_rollout_history. |
| `get_secret` | read | internal | Returns a Secret KEYS, type and metadata (resourceVersion, lastModified) — VALUES ARE REDACTED (never returned). Use to check whether a Secret a workload consumes changed recently (a value change does NOT create a Deployment revision) and which keys it holds. You cannot read the secret values. |
| `get_certificate_info` | read | public | Connects to a hostname via HTTPS and returns TLS certificate details: subject, issuer, validity dates, SANs, fingerprint and whether it is currently valid. |

## When to grant it

When the channel diagnoses configuration problems — a service reading the wrong database URL, a flag that
was never set, a certificate nobody renewed. Grant it knowing what it can return; see the note below.

## Notes

- **The two look reversed, and they are not.** `get_configmap` is `read` but **`secret`**, because it
  returns the raw values — and a ConfigMap is exactly where credentials end up when somebody skips the Secret.
  `get_secret`, despite the name, is only **`internal`**: it returns the *keys*, their type and when they last
  changed. **It never returns a value.**
- That asymmetry is the clearest argument for keeping effect and sensitivity apart: both tools are read-only,
  and one of them is far more dangerous than the other.
- `get_certificate_info` connects to a hostname over HTTPS and reports subject, issuer and validity — useful
  precisely when an outage turns out to be an expired certificate.

---

← Back to [AI toolsets](index)
