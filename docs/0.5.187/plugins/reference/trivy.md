# Trivy

The **Trivy** plugin integrates [Trivy Operator](https://aquasecurity.github.io/trivy-operator/) into Kwirth, giving you a live security dashboard for your workloads without leaving the UI. It reads the CRDs produced by the Trivy Operator and streams four report types per container.

**Report types:**

| Report | Description |
|---|---|
| **Vulnerabilities** | CVE findings per container image, with severity, score, fix version, and links |
| **Config audit** | Kubernetes configuration best-practice violations (e.g. missing resource limits, privileged containers) |
| **SBOM** | Software Bill of Materials — all packages and libraries in the container image |
| **Exposed secrets** | Hard-coded secrets detected in image layers or container filesystem |

**Instance config (`ITrivyInstanceConfig`):**

| Field | Type | Default | Description |
|---|---|---|---|
| `ignoreCritical` | `boolean` | `false` | Hide CRITICAL severity findings from the view |
| `ignoreHigh` | `boolean` | `false` | Hide HIGH severity findings from the view |
| `ignoreMedium` | `boolean` | `false` | Hide MEDIUM severity findings from the view |
| `ignoreLow` | `boolean` | `false` | Hide LOW severity findings from the view |

?> The Trivy plugin requires the [Trivy Operator](https://aquasecurity.github.io/trivy-operator/latest/getting-started/installation/) to be installed in your cluster. Kwirth can install and manage it for you from the plugin setup dialog.
