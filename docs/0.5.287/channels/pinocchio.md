# Pinocchio

Pinocchio is Kwirth's autonomous AI agent for Kubernetes cluster analysis. It watches live data streams — Kubernetes events, object mutations, and business data — and reacts to them by invoking a configured LLM with a rich set of Kubernetes interrogation tools. The LLM can inspect the cluster, gather context, and return structured findings with a severity level.

The core architecture is straightforward:

![pinocchio-arch](../_media/ch-images/pinocchio-arch.png)

On the left, **providers** feed real-time data into Pinocchio (Kubernetes events via the `events` provider, business events via the `business` provider, and validation signals via the `validating` provider). Inside the channel, each incoming event is matched against a set of **triggers**. When a trigger fires, Pinocchio calls the configured LLM with the event payload and a set of built-in tools. The LLM can use those tools to query the cluster, then returns its analysis. Results stream in real time to the Pinocchio tab.

## What for

  - Automatically analyse every new or mutated Kubernetes object (Pod, Deployment, Service…) and get an AI-generated risk assessment.
  - React to Kubernetes object deletions and flag unexpected removals.
  - Connect business event streams and let an LLM decide whether a given business event represents an anomaly, an escalation, or a routine update.
  - Run fully custom trigger logic: combine event sources, kinds, event types, and space/type filters to decide exactly what the LLM gets called for.

## Features

  - **Trigger system** — define one or more triggers, each specifying the data source, the conditions to match, and the LLM to invoke. Multiple triggers can be active at the same time; an incoming event activates all matching triggers in parallel.
  - **Artifact triggers** — react to Kubernetes object events. Filter by object kind (Pod, Deployment, Service, ConfigMap…) and by event type: `ADDED`, `MODIFIED`, `DELETED`, or **Any** (matches all three).
  - **Business triggers** — react to events arriving from the Business provider. Filter by space and type.
  - **LLM tool set** — the LLM agent has access to a set of built-in Kubernetes tools it can call during analysis (see [LLM tools](#llm-tools) below).
  - **Playground** — a built-in test area where you can simulate an event manually (choosing kind, namespace, name, and event type) and see the full LLM exchange in real time, without waiting for a live cluster event.
  - **Multi-LLM** — each trigger can use a different LLM. Pinocchio supports any provider configured in **Settings → Manage LLMs** (OpenRouter, Gemini, Groq, OpenAI, Mistral…).
  - **Version tracking** — triggers include a version ID so you can evolve your trigger configurations and know exactly which version produced a given result.

## Triggers

Triggers are the heart of Pinocchio. Each trigger defines:

  - **Trigger ID** — a unique identifier for this trigger.
  - **Trigger type** — either `artifact` (Kubernetes object events) or `business` (business data events).
  - **LLM** — which LLM configuration to use for this trigger.
  - **Version ID** — an optional version label included in findings so you can trace results to the exact trigger definition that produced them.

For `artifact` triggers, two additional fields are available:

  - **Kind** — the Kubernetes object type to watch (e.g. `Pod`, `Deployment`, `Service`). Leave empty to react to any kind.
  - **K8s Event** — which Kubernetes event type activates this trigger. Options: `ADDED`, `MODIFIED`, `DELETED`, or empty (Any). See [Kubernetes event types](#kubernetes-event-types) for details.

For `business` triggers:

  - **Space** — the business space the event belongs to.
  - **Type** — the business event type within that space.

### Kubernetes event types

Kubernetes generates three types of events when watching object changes via its Watch API:

| Type | When it fires |
|---|---|
| `ADDED` | A new object is created in the cluster |
| `MODIFIED` | An existing object is updated (spec change, status change, annotation…) |
| `DELETED` | An object is removed from the cluster |

By selecting a specific event type on an artifact trigger you can, for example, create one trigger that analyses newly deployed pods (`ADDED`) and a separate trigger that flags deleted deployments (`DELETED`) — each with a different LLM and system prompt tailored to the scenario.

If you select **Any** (or leave the field empty), the trigger fires on all three event types.

?> For `ADDED` events, Pinocchio applies a `creationTimestamp` recency check to avoid re-analysing objects that already existed before Pinocchio started watching. This check is not applied to `MODIFIED` or `DELETED` events, where the timestamp is not meaningful in the same way.

## Playground

The Playground lets you test a trigger without waiting for a real cluster event. You can:

  1. Choose the trigger to test.
  2. Set the simulated artifact: kind, namespace, name, and — for artifact triggers — the K8s event type (`ADDED`, `MODIFIED`, or `DELETED`).
  3. For business triggers: set the space and type of the simulated event.
  4. Press **Run** to send the simulation to the backend.

The Playground streams the full LLM conversation (tool calls, tool results, and the final response) in real time so you can debug the trigger and fine-tune your system prompt before deploying it to production.

## LLM tools

When a trigger fires and the LLM agent is invoked, it has access to the following built-in Kubernetes tools. The LLM can call these tools autonomously as many times as needed during its analysis:

| Tool | Description |
|---|---|
| `get_pod_yaml` | Returns the full manifest of a Pod (`kubectl get pod -o yaml`) |
| `get_deployment_yaml` | Returns the full manifest of a Deployment |
| `get_service_yaml` | Returns the full manifest of a Service |
| `get_node_list` | Lists the cluster nodes with their status and labels |
| `get_namespace_list` | Lists all namespaces |
| `get_events` | Returns recent Kubernetes events for a namespace |

These tools are provided by the `@kwirthmagnify/kwirth-common-ai` package and are shared with other AI-powered components. New tools added to the package become available to Pinocchio automatically.

## Use

### Initial setup

1. Configure at least one LLM in **Settings → Manage LLMs**. You need a valid API key for your chosen provider.
2. Open the Pinocchio channel from the resource selector (any resource will do — Pinocchio watches the whole cluster).
3. Go to the **Configuration** tab to define your triggers.

### Defining triggers

In the **Configuration** tab click **Add trigger**. Fill in:

  - Trigger ID (a label for your own reference)
  - Trigger type (`artifact` or `business`)
  - LLM to use
  - Version ID (optional)
  - For artifact triggers: Kind and K8s Event
  - For business triggers: Space and Type

Click **Save** when done. You can define as many triggers as you need.

### Running Pinocchio

Once triggers are configured, start the channel from the **Settings** icon. Pinocchio begins watching the configured providers and will invoke the LLM automatically whenever an incoming event matches a trigger. Findings appear in the main tab as they stream in from the LLM.

?> Use the **Playground** tab to test your triggers before starting the live channel. This avoids consuming LLM tokens on real events until you are satisfied with the trigger configuration and system prompt.
