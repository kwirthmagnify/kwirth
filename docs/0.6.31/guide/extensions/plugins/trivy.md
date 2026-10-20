# 🛡️ Trivy (plugin)

> **Type:** Plugin (channel)<br>
> **Package:** `@kwirthmagnify/kwirth-plugin-trivy`<br>
> **Icon:** 🛡️

## Overview

The **Trivy** channel brings **security & vulnerability scanning** into kwirth, powered by [Trivy OSS](https://trivy.io) (Aqua Security). It streams, in real time, the **vulnerabilities, config-audit findings, exposed secrets and SBOM** of the Kubernetes objects in your scope, and rolls them up into a **kwirth Secure Score** you can tune.

As always, scope is flexible: you can assess the whole security posture of an **application** made of pods/replica sets/containers across namespaces, all at once.

> Trivy relies on the **Trivy Operator** running in the cluster. If it isn't installed, kwirth can **deploy it for you**, from the **Trivy provider**: ☰ → **Manage extensions → Providers → Trivy → the gear**. See [Trivy (provider)](../providers/trivy).

## When to use it

- See which **images have CVEs**, how critical, and whether a **fix** exists.
- Track **config-audit** issues and **exposed secrets** per workload.
- Get a single **security score** across a custom set of objects.

## Configuration

On **Start**, the config lets you choose **which severities count** — tick **Ignore** to exclude a severity from the reports/score (e.g. ignore *Low*):

![Configure Trivy channel](../../../_media/guide/channel-trivy-setup.png)

| Control | What it does |
|---|---|
| **Ignore — Critical / High / Medium / Low** | Exclude that severity from reports and from the score. |
| **Set as default** | Remember this configuration. |

## The cards view

Once started you get one **card per object**. Each card shows the object **icon** and **name**, a mini **bar chart** with four bars — **Vulns** (vulnerabilities), **Audit** (config-audit findings), **Exposed** (exposed secrets) and **SBOM** (packages in the software bill of materials) — and the **scan date** at the bottom:

![Trivy cards view with filters](../../../_media/guide/channel-trivy-cards.png)

Red bars are **findings** (higher = worse); the green **SBOM** bar is just the package count (informational, not a risk). At a glance you can compare the security posture of every object in your scope side by side.

**What gets a card.** Only **workloads** — the things that run containers: pods and the controllers that
own them (ReplicaSet, Deployment, StatefulSet, DaemonSet, Job, CronJob). The Trivy Operator also audits
Services, Ingresses and Roles, and those are not shown: there is no image to scan behind them.

**Reading the title.** The first line is the object and the second its **container**; both are cut to fit
the card, so **hover over either to read it whole** — two pods of the same deployment are identical up to
the last few characters. Beside the name there is a **chip with the kind** (`ReplicaSet`, `Pod`,
`DaemonSet`…), and it matters more than it looks: Trivy names a report after the **owner** of the pods it
scanned, so most rows are a controller wearing a pod's name.

> ⚠️ **The Audit figure belongs to the workload, not to the container.** A `ConfigAuditReport` is written
> once per workload while vulnerabilities and SBOM are written per container, so a workload with several
> containers shows the **same** Audit number on each of its cards. That is what the report says: the
> audit is of the thing that owns them all.

## Filtering & sorting

The toolbar is where you narrow the view and change the order — this is the part worth mastering:

### Text filter

The **Search asset, ns…** box is a free-text filter. Type any fragment of an **asset name** or **namespace** and the view keeps only the matching cards, live as you type. For example, typing `leaky` leaves just the `leaky-app` object:

![Trivy filtered by text and its ⋮ menu](../../../_media/guide/channel-trivy-menu.png)

### Count filters (sliders)

The three sliders — **Vulns**, **Audit** and **Exposed** — are **minimum-count** filters. Each one hides every card whose count for that dimension is **below** the slider value, so you can zoom in on the objects that actually matter:

| Slider | Keeps cards with… | Typical use |
|---|---|---|
| **Vulns** | at least *N* vulnerabilities | Hide clean images, focus on the vulnerable ones. |
| **Audit** | at least *N* config-audit findings | Surface misconfigured workloads. |
| **Exposed** | at least *N* exposed secrets | Jump straight to objects leaking credentials. |

The sliders **combine** (logical AND) with each other and with the text box: e.g. set **Vulns ≥ 50** *and* type a namespace to see only the heavily-vulnerable objects in it. Leave a slider at **0** to disable that condition.

### Sorting (Order)

**Order** opens a small menu with two groups — a **direction** and a **criterion**:

![Trivy Order menu](../../../_media/guide/channel-trivy-order.png)

- **Direction:** **Ascending** or **Descending** (a check marks the active one).
- **Criterion:** sort the cards by **Vulnerabilities**, **Config audit** or **Exposed secrets** count.

So *Descending + Vulnerabilities* (the default) puts the most vulnerable objects first — the usual triage order. Pick *Exposed secrets* to float credential leaks to the top.

### List vs Card layout

The **List / Card** toggle switches the layout. **Card** (the default) is the visual grid above; **List** is a dense, one-row-per-object table with the same **Vulnerabilities / ConfigAudit / ExposedSecrets** counts and scan date — better when you have many objects and want to scan the numbers quickly. The **⋮ menu** is available in both layouts:

![Trivy list view](../../../_media/guide/channel-trivy-list.png)

## Per-object reports (the ⋮ menu)

Every card (in either layout) has a **⋮ menu** that opens a detailed report for **that object**:

| Item | Opens |
|---|---|
| **Vulnerabilities** | The full CVE report (see below). |
| **Config audit** | Kubernetes misconfiguration checks. |
| **Exposed secrets** | Secrets Trivy detected inside the image. |
| **SBOM** | The software bill of materials (all packages). |
| **Re-scan** | Re-evaluate the object right now. |

*(An item is **greyed out** when there's nothing to show — e.g. **Exposed secrets** is disabled on objects with 0 exposed secrets.)*

### Vulnerabilities

Opening **Vulnerabilities** shows a **severity summary** (Critical / High / Medium / Low counts), the **image**, **OS** and **scan** info (Trivy version + timestamp), and the **list of CVEs** grouped by severity, each expandable:

![Trivy vulnerability report](../../../_media/guide/channel-trivy-detail.png)

Expand a CVE to see its specifics — **CVE id** (linked to its advisory), the affected **resource/package**, a **description**, the **installed** version and the **fixed** version so you know exactly what to upgrade to:

![Trivy CVE detail](../../../_media/guide/channel-trivy-cve.png)

### Config audit

**Config audit** lists the **Kubernetes misconfiguration** checks Trivy ran against the object — each row is a finding with its **severity** (HIGH / MEDIUM / LOW) and a short title (e.g. *Access to host ports*, *Root file system is not read-only*, *Can elevate its own privileges*). The header keeps the same Critical/High/Medium/Low summary and scan info. Expand a row for the full explanation and remediation:

![Trivy config audit report](../../../_media/guide/channel-trivy-configaudit.png)

### Exposed secrets

**Exposed secrets** reports **credentials Trivy found baked into the image** — a serious finding, since anything here ships inside the container. Each row names the **kind** of secret detected (e.g. *AWS Access Key ID*, *AWS Secret Access Key*, *GitHub Personal Access Token*, *Asymmetric Private Key*) and expands to the location and the matched value:

![Trivy exposed secrets report](../../../_media/guide/channel-trivy-secrets.png)

> **Handle with care.** The report shows the **actual secret material**. Treat any hit as a **compromised credential**: rotate it, remove it from the image (use build secrets / mounted secrets instead of baking them in), and re-scan. *(The screenshot above is intentionally blurred.)*

### SBOM

**SBOM** (Software Bill of Materials) lists **every package** Trivy inventoried in the image — OS packages and language dependencies alike (e.g. `alpine`, `busybox`, `ca-certificates-bundle`, …). Use the **Filter** box at the top to find a specific package, and expand any entry for its version details. The SBOM is the raw inventory the vulnerability scan is built on:

![Trivy SBOM report](../../../_media/guide/channel-trivy-sbom.png)

### Re-scan

**Re-scan** asks the Trivy Operator to **re-evaluate the object immediately**, instead of waiting for the next scheduled scan. The card is briefly **cleared** while the fresh scan runs and reappears with an updated **scan date** and counts. Use it after you've pushed a fixed image or rotated a leaked secret to confirm the finding is gone.

## Admin guide

- **Install / remove:** **☰ → Manage extensions → Plugins** → install **Trivy**.
- **Trivy Operator:** the channel needs the **Trivy Operator** in the target cluster, and kwirth can
  deploy it — no manual Helm needed. It is **not done from here**: it is the **Trivy provider's** job,
  at ☰ → **Manage extensions → Providers → Trivy → the gear**. See
  [Trivy (provider)](../providers/trivy).

  > ⚠️ **It used to be a `MANAGE TRIVY` button in this tab, and it is gone since `trivy@0.3.0`.** The
  > operator is what *writes* the CRDs the provider reads, so deploying it was never this channel's
  > business — this tab paints reports that already exist. If you are looking for the button, it is in
  > the provider's gear, and it needs `admin` there just as it did here.
- **Permissions:** each scope includes the ones above it, so a user needs **one**, not several —
  - **`trivy$user`** — open Trivy and read the reports (vulnerabilities, config audit, secrets) **of the
    namespaces the key grants**. **Without it the channel will not start**, and it says so.
  - **`cluster`** — the reports of **every** namespace.
  - **`admin`** — it no longer grants anything *in this channel*: managing the operator moved to the
    provider, and that is where `admin` is asked for now.

  > 🔴 **Since `trivy@0.2.32` the reports are limited by the key.** Before it, only what the screen
  > *asked for* was filtered — so opening Trivy on the cluster view handed over the vulnerability
  > reports and the **detected secrets** of every namespace, whatever the key granted. If you gave Trivy
  > expecting the namespaces to limit it, re-read those grants.
  >
  > ⚠️ Only **namespaces** limit them. A report names the workload that owns it, not the pod, so
  > narrowing a key by pod or container does not narrow its reports.

  > ⚠️ **`trivy$kubernetes` no longer exists** (removed in `0.2.32`). It promised the cluster-scoped
  > reports (RBAC, infra assessment) and the channel never asked Kubernetes for them, so it granted
  > nothing. **A key still carrying it loses Trivy altogether** until it is re-granted `trivy$user` —
  > an unknown scope grants nothing, which is the safe way round but silent.

  See [Security & permissions](../../admin/04-security-and-permissions).

  > ⚠️ **`trivy$workload` was replaced by `trivy$user` in 0.2.30.** It did two jobs at once — being
  > allowed to *use* Trivy and being allowed to *see* workload reports — so it could express neither.
  > Keys still carrying it grant **nothing** for this channel: re-grant them as `trivy$user`.

## Notes

- Findings come from the **Trivy Operator**'s reports, streamed live — as scans refresh, the cards update.
- The **score** reflects your **Ignore** choices: ignoring a severity removes it from the calculation, so tune it to your risk appetite.

---

← Back to [Plugins (channels)](index)
