# Change log
Although not too exhaustive, this page contains some detail on what has been done on each version.

## 0.5.287
Minor but powerful features:

  - Pinocchio is now running working with several LLM's through [AI-SDK from Vercel](https://ai-sdk.dev/docs/introduction). It has been tested with OpenRouter, Gemini and Groq. This very first version just audits Kubernetes objects upon creation, but only for information.
  - Improved channel management on front (now added 'cluster' view again).
  - Back channels are now instantiated according to Kwirth config (they're on a pre-plugin stated, like providers and front channels). We're ready to start plugin system!!!
  - New `business` provider is up & running, now business data can be ingested into Kwirth and sent to channels aiming to take decisions on business data.
  - `pinocchio` channel is triggering wehn business data or Kubernetes artifacts are received.
  - New `metrics` provider (in use by `pinocchio`, we will transition 'metrics' channel to new metrics provider in the near future)
  - New `topology` channel, for (incredibly) seeing and managing your cluster in 3D.
  - **Censor channel**: New channel for real-time LLM-based log analysis. Censor inspects log streams, detects sensitive patterns via configurable regex rules, and forwards findings through the sender system. Supports multiple LLM providers and interactive terminal sessions.
  - **Plugin system**: Channels are now fully decoupled from Kwirth core. Plugins bundle a backend and a frontend component into a self-contained package that can be installed, updated, or removed at runtime without restarting Kwirth. All previous built-in channels (Log, Ops, Fileman, Echo, News, Trivy, Pinocchio) are now delivered as plugins.
  - **Provider system**: Data sources are now modelled as providers. A provider ingests data from any source (Kubernetes events, metrics, business streams, Kafka topics, OpenTelemetry…) and makes it available to any channel or plugin that subscribes to it.
  - **Sender system**: Outbound notification adapters are now first-class citizens. Nine ready-to-use senders are included: console, file, SMTP email, Resend email, Microsoft Teams, composite (fan-out), timed, tee, and regex-routed. Senders let channels push alerts and messages to external destinations using a unified configuration model.
  - **kwirth-common-ai**: New shared package that abstracts LLM provider integrations (OpenRouter, Gemini, Groq, OpenAI, Mistral…). Used by Pinocchio and Censor to offer a unified model/provider configuration across AI-powered features.

### New UI capabilities

  - **Pluggable themes**: Kwirth now supports installable UI themes. Themes are self-contained packages (bundled as `.tgz`) that can be installed, switched, and removed at runtime without restarting Kwirth. The `ThemeManager` exposes a unified API that channels and the shell use to apply color palettes, typography, and component overrides. Three themes ship out of the box: **post-punk** (high-contrast neon-on-black), **plexus** (dark blue grid aesthetic), and **SFY** (a science-fiction inspired palette). Building your own theme requires only a React component that satisfies the `ITheme` interface and a manifest declaring its id and display name.

  - **Pluggable homepages**: The Kwirth homepage — the first screen shown after login — is now a pluggable component. Homepage packages expose a React component that receives the full cluster list, connection metadata, metrics helpers, and event stream accessors as props; the shell wires everything and renders whichever homepage is active. The classic **Basic** homepage (CPU, memory, and network sparklines per cluster) ships as the default. **Matrix** is a new homepage that renders a live Matrix-rain canvas backdrop per cluster card, showing real-time CPU / MEM / POD utilisation bars, cluster event streams, and quick-launch buttons for installed channels — all in a monochrome green-on-black aesthetic.

### Incremental improvements

  - **Magnify — LogSearch: Stop button and better defaults**: The LogSearch panel now defaults to **100 lines** (previously 500) and enforces a hard **500-line maximum**, making searches faster and more responsive. A red **Stop Search** button is available whenever a search is running and cancels it immediately. Cancellation uses a per-search UUID so multiple concurrent searches from the same client can each be stopped independently without interfering with each other. If the LogSearch panel is closed while a search is still running, the search is automatically cancelled on both the frontend and the backend.

  - **Magnify — Open extension managers from the channel**: The Magnify channel's user preferences panel now includes quick-access buttons to open the Plugin, Provider, and Sender manager dialogs directly from within the channel, without having to navigate to the global Kwirth settings menu.

  - **Censor — Inference and Audit modes**: The Censor plugin now supports two distinct operating modes selectable at configuration time:
    - `inference` mode (original behaviour): the LLM continuously discovers noise patterns from the incoming log stream and accumulates regex rules to filter them out automatically.
    - `audit` mode: instead of learning noise patterns, the LLM performs a deeper analysis of each batch looking for anomalies, suspicious entries, and policy violations. Findings are surfaced as actionable alerts rather than filter rules.
    The selected mode is stored as part of the session configuration.

  - **Plugin manager — Dependency requirements with version validation**: Plugins can now declare a `requires` list in their manifest. Each requirement specifies the type (`plugin`, `provider`, or `sender`), the component id, and the minimum acceptable version. The Plugin Manager dialog reads these requirements at catalog load time, queries the currently installed components for each required type, and renders a chip per requirement on the plugin card showing what is needed and the minimum version. The **Install** button is automatically disabled if any requirement is unmet; a tooltip explains exactly which component is missing or outdated. This ensures users can never end up with a broken plugin due to a missing dependency.

  - **Plugin manager — Version selection**: The plugin catalog now groups all published versions of each plugin and shows a version dropdown on each card when more than one version is available, letting you choose exactly which version to install instead of always getting the latest.

  - **Kwirth version update notification**: Kwirth now checks whether a newer server build is available and shows a non-intrusive notification in the UI, so administrators always know when an upgrade is ready.

  - **Pinocchio — Kubernetes event type filter on artifact triggers**: Artifact triggers can now declare which Kubernetes event type should activate them: `ADDED`, `MODIFIED`, or `DELETED`. Leaving the field blank (or selecting "Any") makes the trigger fire on all three event types. Previously the backend only processed `ADDED` events — `MODIFIED` and `DELETED` were silently discarded. This change makes Pinocchio useful for detecting object mutations and deletions in addition to initial deployments. The event type is configurable both in the Trigger configuration screen and in the Playground's test area. The `creationTimestamp` recency bypass is still applied, but only for `ADDED` events where it makes semantic sense.

  - **Pinocchio — AI tools promoted to `kwirth-common-ai`**: The full set of Kubernetes interrogation tools used by Pinocchio's LLM agent has been extracted from Pinocchio's own backend and moved into the shared `@kwirthmagnify/kwirth-common-ai` package. Any AI-powered plugin can now import and use these tools without duplicating code or taking a dependency on Pinocchio.

  - **New LLM tool: `get_service_yaml`**: A new tool has been added to the `kwirth-common-ai` tool set. Given a namespace and a service name it returns the full Kubernetes Service manifest, equivalent to running `kubectl get service <name> -n <namespace> -o yaml`. It is immediately available to all LLM agents (Pinocchio, Censor…) without any additional configuration.

  - **Type safety: `MetricDefinition` promoted to `kwirth-common-front`**: The `MetricDefinition` class (fields: `metric`, `type`, `help`, `eval`) has been moved from the Metrics channel internals into `@kwirthmagnify/kwirth-common-front`. The `metricsList` field in `IChannelObject` is now typed `Map<string, MetricDefinition>` instead of `Map<string, unknown>`, eliminating a production TypeScript build error and providing full type safety to any channel that works with metric definitions.

  - **Sender — Rate limiting**: Senders now support a configurable rate limit. When enabled, a sender will process at most N messages per time window and silently drop or queue excess messages. This prevents alert storms from overwhelming external notification endpoints (Teams channels, email inboxes, SMTP relay limits). The rate limit is configured per-sender instance and applies before any routing or composition step.

  - **Sender — ISender refactor**: The `ISender` interface has been simplified and made more consistent. The `send` method now receives a unified `ISenderMessage` object instead of positional parameters, making it easier to build composite and routing senders. All nine built-in senders have been updated to the new interface. Custom senders built against the previous interface will need a one-line migration.

  - **Censor — Performance improvements**: A series of targeted optimisations reduce Censor's steady-state memory footprint and CPU overhead. The LLM interface now batches log lines more efficiently before forwarding to the model, the internal rule-accumulation map has bounded growth, and several event-listener leaks that caused memory to grow unboundedly in long-running sessions have been fixed.

  - **Censor — Extended configuration**: A new *display* configuration group has been added to the Censor plugin. It controls how findings are rendered in the channel (show/hide timestamps, severity colouring, maximum visible lines).

  - **Pinocchio — UI improvements**: The Pinocchio playground has been redesigned for clarity. The user prompt area is larger, findings are displayed in a scrollable panel with a one-click **Clear findings** button, and the trigger list has been reorganised so active triggers are immediately visible without scrolling.

  - **Ops channel — Fix one-off command execution (issue #3)**: `EOpsCommand.EXECUTE` was never dispatched by the backend, making one-off (non-interactive) command execution silently unavailable. The dispatch path has been repaired; one-off commands now execute correctly and their output is streamed back to the frontend as expected.

  - **Extension managers — UX improvements**: The Plugin, Provider, and Sender manager dialogs have been reorganised. Cards are larger, the install/remove actions are more prominent, and the status chip (installed version vs. available version) is now consistently shown across all three managers.

## 0.5.40
Minor but powerful features:

  - Provider architecture implemented for the first 3 providers.
  - Pinocchio channel implemented using providers.
  - Docker delivery mode is now running outside cluster without any Kwirth installation inside cluster, that is, it is a real out-cluster deployment like KwirthElectron.

## 0.5.21
The change log for this version is quite extensive. What follows is just an excerpt:
  - **Multiple deployment options**: Now you can deliver Kwirth in several ways, not just as a Kubernetes pod: **Magnify** (a Desktop application), **Docker** (a standalone dockerized version), and **External** (a setup designed for deploying Kwirth directly to your Windows, macOS, or Linux box).
  - Added **Magnify channel**: A full replacement for tools like Lens or K9s.
  - Finished **Trivy channel**: Now the Trivy channel shows more information about your workload, including SBOM and configuration auditing, in addition to exposed secrets and vulnerabilities.
  - Improved performance and security for the **Fileman channel**.
  - **Dark mode** is finally working smoothly (CSS is so annoying...).

## 0.4.127
  - Added **Fileman channel**.
  - Added configurable endpoint for channel use.
  - Added **homepage** including:
    - Cluster details.
    - Cluster usage data.
    - "Last & Fav" tabs and workspaces.
  - Added a **notifier** for sending messages to users from frontend channels.
  - Added `react-file-manager` as a customizable file manager for Kwirth.
  - Added a parse listener for parsing `ls` commands in the Fileman channel.
  - Added **Helm chart** installation support.

## 0.4.20
  - **Strong architecture changes**: Introduced internal changes to support different kinds of connections consuming various types of information (not only logs).
  - **Added Channels**: A Channel represents a specific kind of information that Kwirth extracts from Kubernetes and sends to clients. The first implemented channels (included in Kwirth core) are: **Log, Metrics, and Alert**.
  - **Extensibility**: Kwirth can now be extended by creating new channels that can be loaded at runtime; increasing Kwirth's capabilities no longer implies modifying its core.
  - **Instances**: To allow consumers to mix content from different resources, Kwirth introduced the concept of "instances" orthogonally with channels. When a client opens a WebSocket for a specific channel type, it can create instances to receive information from different sets of origin resources.
  - **Bearer Tokens**: Since increased capabilities can produce heavy workloads, we introduced specific bearer tokens to drastically simplify workload management when multiple Kubernetes replicas are running in the backend.
  - **Multi-resource selection**: The base frontend application now supports selecting multi-resource objects. For example, you can monitor the CPU usage of three different pods from different namespaces or groups simultaneously.
  - **Data Aggregation**: The metrics section enables aggregating and/or merging data from different objects.
  - **Custom Metrics**: The Metrics channel implements several custom metrics to simplify observability:
    - **kwirth_container_memory_percentage**: Percentage of memory used by the object relative to the whole cluster.
    - **kwirth_container_cpu_percentage**: Percentage of CPU used relative to the whole cluster.
    - **kwirth_container_random_counter**: Accumulated container random values.
    - **kwirth_container_random_gauge**: Instant container random values.
    - **kwirth_container_transmit_percentage**: Percentage of data sent in relation to the whole cluster.
    - **kwirth_container_receive_percentage**: Percentage of data received in relation to the whole cluster.
    - **kwirth_container_transmit_mbps**: Mbps of data sent over the last period.
    - **kwirth_container_receive_mbps**: Mbps of data received over the last period.
    - **kwirth_container_write_mbps**: Mbps of data written to disk during the last period.
    - **kwirth_container_read_mbps**: Mbps of data read from disk during the last period.
  - **Versioned Documentation**: Documentation is now versioned; you can select the specific Kwirth version documentation from the sidebar.

## 0.3.160
  - Created `@kwirthmagnify/kwirth-common` for sharing data structures between clients and the Kwirth server.
  - Added a new **version detector** on user login to identify backend versions.
  - Added **multi-streaming channels** to WebSockets (required for streaming data other than logs).
  - **New Security System**: Based on differentiating services (log, streaming, operation...) and scopes. By adding the "service" entity, we can now add different data streams like metrics (snapshot or stream) and signaling info (errors, warnings).
  - **Streaming Metric Service**: Includes two scopes: **snapshot** (instant metrics set) and **streaming** (continuous metrics), relative to a Kubernetes artifact (container, pod, deployment, or namespace). Aggregated artifacts will have metrics summed or averaged according to their semantics.
  - This first version of streaming metrics requires establishing a log service to open the WebSocket, but future updates will allow independent or unified WebSockets for all services.

## 0.2.8
  - **Security Redefinition**: Overhauled the API Key / Access Key system for more flexible management.
  - **Status Information**: Kwirth now sends status data (pods added/stopped, Kubernetes errors) through the same socket used for log streams.
  - **Version Info via API**: Clients can now query the version to know which features are implemented.
  - Added `/find` endpoint to perform searches on Kubernetes artifacts.
  - **Kubernetes Operations**: Added permissions-based operations to restart deployments and pods via Kwirth.
  - Several UI improvements and a simplified resource selector.

## 0.1
Initial version including:
  - Access to several clusters.
  - Admin user management.
  - API key security for distributed Kwirth instances.
  - React/TS frontend.