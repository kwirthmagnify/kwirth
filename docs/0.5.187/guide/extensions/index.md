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

## [Themes (appearance)](themes/index)

Restyle the whole UI. Bundled: **Avicii**, **SFY**, **Plexus**, **Post-Punk**, **Matrix**, **Depeche Mode**. → **[Themes manual](themes/index)**

## [Identity Providers (SSO connectors)](idps/index)

Sign in with an external identity: **Google** (OIDC), **GitLab** (cloud / self-managed, OIDC), **GitHub** (cloud / Enterprise Server, OAuth2). → **[IdP connectors manual](idps/index)** · see also [IdP integration](../admin/07-idp-integration).

## [Homepages (landing dashboards)](homepages/index)

Swap the home landing dashboard. Bundled: **Clusterized**, **Avicii**, **Matrix**, **Depeche Mode**. → **[Homepages manual](homepages/index)**

## [Documentation packages](docs/index)

Self-contained docsify sites served directly by Kwirth. The `core/kwirth` package (this guide) ships bundled. Additional packages can be installed from a URL, a local file or the registry. → **[Documentation packages manual](docs/index)**

---

> **Paid extensions** (e.g. Defender, Montag and pro IdP connectors) are not covered here; they will be documented in a separate **marketplace** section.
