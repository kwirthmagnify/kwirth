# Part III — Extension manuals

This part is a **reference for every extension**, grouped by type. Each entry explains **what it is**, **how to use it** and **how to configure it**, with screenshots.

> All extensions are installed and managed the same way, from **☰ → Manage extensions → *(family)***. If you haven't seen the manager yet, read [Extending Kwirth](../admin/08-extending-kwirth) first — it explains the common install / configure / enable / remove flow that every family shares.

## Plugins (channels)

The channels users work with. Most are **plugins** you can install or remove; a couple (**Metrics**, **Magnify**) are **built-in** channels that ship with the Kwirth core.

- 📄 [Log](plugins/log) — real-time log streaming.
- 📊 [Metrics](plugins/metrics) — live CPU/memory/network/IO metrics. *(built-in)*
- ⚠️ [Alert](plugins/alert) — alerts on matching log lines.
- 🖥️ [Ops](plugins/ops) — day-to-day operations (shell, restart, inspect).
- 📁 [Fileman](plugins/fileman) — browse container filesystems and volumes.
- 🛡️ [Trivy](plugins/trivy) — vulnerability scanning.
- 🔍 [Magnify](plugins/magnify) — full cluster management (Lens/K9s-style). *(built-in)*
- 🌳 [Topology](plugins/topology) — interactive 3D cluster topology.
- ✨ [Pinocchio](plugins/pinocchio) — AI/LLM analysis of Kubernetes events.
- 🔎 [Censor](plugins/censor) — LLM-assisted log noise filtering.
- 💬 [mIRC](plugins/mirc) — cross-cluster direct messaging between users.
- 📰 [News](plugins/news) — RSS news feed reader (demo).
- 🧪 [Echo](plugins/echo) — reference/demo channel for plugin authors.

## [Providers (data sources)](providers/index)

Feed data into channels. Built-in: **Events**, **Metrics**, **Business**. Installable: **Tick**, **Validating**, **Kafka**, **OpenTelemetry**, **Syslog**, **Trivy**, **Sample**. → **[Providers manual](providers/index)**

## [Senders (output destinations)](senders/index)

Deliver output to external systems. Delivery: **console**, **file**, **email-smtp**, **email-resend**, **teams**. Pipeline: **tee**, **regex**, **timed**, **ratelimit**, **composite**. → **[Senders manual](senders/index)**

## Themes (appearance)

- [Avicii](themes/avicii) · [Depeche Mode](themes/depeche-mode) · [Matrix](themes/matrix) · [Plexus](themes/plexus) · [Post-Punk](themes/post-punk) · [SFY](themes/sfy)

## Identity Providers (SSO connectors)

See also [IdP integration](../admin/07-idp-integration).

- [Google](idps/google) · [GitLab Cloud](idps/gitlab-cloud) · [GitLab Self-Managed](idps/gitlab-onprem) · [GitHub Cloud](idps/github-cloud) · [GitHub Enterprise Server](idps/github-onprem)

## Homepages (landing dashboards)

- [Clusterized](homepages/clusterized) · [Avicii](homepages/avicii) · [Depeche Mode](homepages/depeche-mode) · [Matrix](homepages/matrix)

---

> **Paid extensions** (e.g. Defender, Montag and pro IdP connectors) are not covered here; they will be documented in a separate **marketplace** section.
