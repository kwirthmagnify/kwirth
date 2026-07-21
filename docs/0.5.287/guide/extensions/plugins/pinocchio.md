# 🪄 Pinocchio (plugin)

> **Type:** Plugin (channel)<br>
> **Package:** `@kwirthmagnify/kwirth-plugin-pinocchio`<br>
> **Icon:** 🪄

## Overview

**Pinocchio** is an **agentic AI analyst** for your cluster. It watches **events** — Kubernetes object changes (a Pod/Deployment/Ingress being **added, modified or deleted**) and **business** events — and, when a **trigger** matches, runs a **multi-step LLM analysis** of the object. The result is a structured verdict: a list of **findings** (each with a severity and remediation), a **Pod Security Standard (PSS)** assessment, a **risk score summary**, an overall **global risk**, and a full Markdown **report**.

Think of it as an on-demand security/posture reviewer: point it at "every new Pod" or "every Ingress change" and let the model flag privilege issues, missing limits, exposed secrets, supply-chain risks and more — with concrete remediation.

> Pinocchio uses the **LLM providers configured in Kwirth**, and can run the model **agentically** (multiple **steps** with **tools**) to gather context before it concludes.

## When to use it

- **Automated security review** of new or changed workloads (PSS compliance, misconfigurations).
- **Event-driven analysis** — react to a business event or a K8s change with an LLM assessment.
- **Prototype prompts** safely in the **Playground** before wiring them to a live trigger.
- **Generate remediation** guidance and a shareable report for a given resource.

## Getting started

1. In the resource selector pick your **Cluster**, set **View = cluster** (Pinocchio is a cluster-level channel), choose the **pinocchio** channel and click **ADD**.
2. Open the tab's **⚙️ → Start**.
3. Set up your model and rules: use **Config** to add a **Provider/LLM** and define **Triggers**, or jump into the **Playground** to experiment first.

## The analysis view

Once started, the tab is a live feed of analyses:

![Pinocchio started view](../../../_media/guide/channel-pinocchio-view.png)

The header shows **Events** (how many entries in the feed) and **Status** (started / paused / stopped), plus three actions:

| Button | What it does |
|---|---|
| **Clear** | Clear **my view** (local) or **Clear back** (delete stored analyses for everyone). |
| **Playground** | Open the interactive prompt/trigger workbench (below). |
| **Config** | Open the config menu: **Provider**, **LLM**, **Trigger**, **Import/Export**. |

Each analysis in the feed lists its **findings**, colour-coded by level (**low / medium / high / critical**). Click a finding for its full detail — **control id & name, category** (privileges, identity, network, filesystem, supply-chain, resources, secrets, …), **confidence, risk score, description, evidence, impact, remediation** and **references**. A summary chip under each analysis shows the **PSS** (current → target), the **score summary** (critical/high/medium/low counts) and the **global risk**; click it for the analysis detail (resource, images, controls passed, next steps). A **Report** button opens the full Markdown write-up.

## AI configuration (Providers & LLMs)

Before Pinocchio can analyse anything it needs an **AI provider** and at least one **LLM**. Both are set from the header **Config** menu, and — importantly — this **AI configuration is shared across every Kwirth plugin that uses AI** (Pinocchio, **[Censor](censor)**, …). Configure a provider/model once and it's available to all of them.

**Config → Provider** registers an **AI provider** and its **API key/token**:

![AI provider configuration](../../../_media/guide/ai-provider-config.png)

Pick the provider (e.g. *google*, *openai*, …), paste its **API Key / Token**, and **Add**. Kwirth loads the provider's available models (here, *google* with *50 models loaded*). The key can later be linked to specific uses. Use the **eye** to reveal the key, and **Import / Export** to move providers as JSON.

**Config → LLM** defines the **models** you'll actually select in triggers and the Playground:

![AI LLM configuration](../../../_media/guide/ai-llm-config.png)

Each LLM entry has an **LLM ID** (the name you pick later), a **Provider**, a **Model**, a **temperature**, and optional **input/output cost per million tokens** (used to compute the cost figures you saw in Censor's performance dashboard). By default it **uses the provider's API key**, or you can enter a **specific key** for that model. Manage entries with **New / Clone / Remove / Add** and **Import / Export**.

> Because this config is shared, an LLM you define here (say `gemini-31-flash-lite`) is the same one Censor offers in its config — set your models up once.

## The Playground

The **Playground** is where you design and test an analysis before turning it into a trigger. You give it an **event** and a **prompt**, **fire** it against the LLM, and inspect the result:

![Pinocchio playground — artifact input](../../../_media/guide/channel-pinocchio-playground.png)

- **LLM tab** — choose the **model**, **Max steps** (agentic iterations), **tools** (and **Auto** tool selection), the **trigger type** (**Business** or **Artifact**), and for artifacts the **Kind** + **K8s Event**; paste the **artifact JSON** (or a business event) and the **system**/**prompt** (Jinja or artifact template).
- **Call tab** — **Apply config**, then **Fire** to run it.
- **IN / OUT tabs** — the exact input sent and the model's output.

The **OUT** tab shows the structured result — here, a live security analysis of a Pod with several findings and a full report:

![Pinocchio playground — analysis output](../../../_media/guide/channel-pinocchio-out.png)

*(The finding text is generated by the LLM, so wording will vary with the model and prompt.)*

Use **Import / Export / Upload / Download** to move configs around, and **Save** to persist the current setup as a **trigger**.

## Triggers

Triggers decide **when** Pinocchio runs and **what** it does. Manage them in **Config → Trigger**:

![Pinocchio trigger config](../../../_media/guide/channel-pinocchio-triggers.png)

### What a trigger matches

Each trigger has an **ID** and a **type**:

- **artifact** — fires on a **Kubernetes object change**. You set the **Kind** (Pod, Deployment, DaemonSet, StatefulSet, ReplicaSet, Job, CronJob, Service, Ingress, HTTPRoute…) and the **K8s Event** that arms it: **ADDED**, **MODIFIED** or **DELETED**. Example: *artifact · Pod · ADDED* runs every time a new Pod appears.
- **business** — fires on an incoming **business event** (from the Business provider), matched by **space / type**.

### Versions

A trigger holds one or more **versions** — variations you can keep side by side (e.g. a cheap fast model vs. a thorough one) and enable independently. Each version has:

| Field | Meaning |
|---|---|
| **Enabled** | Whether this version actually runs when the trigger fires. |
| **Action** | What to do with the verdict: **inform** (post findings only), **cancel** (reject/deny the change) or **repair** (attempt a fix). *cancel/repair act on the cluster — see the note below.* |
| **LLM** | Which model to use (from your shared [AI configuration](#ai-configuration-providers--llms)). |
| **Steps** | Maximum **agentic steps** — how many tool-using iterations the model may take before it must conclude. |
| **Tools** / **Auto** | Which **tools** the agent may call to gather context; **Auto** lets it choose tools by itself. |
| **Prompt type** | **Jinja** (a templated prompt rendered with the event data) or **artifact** (the raw object is the input). |
| **System** / **Prompt** | The system prompt and the analysis prompt/template. |
| **Spaces** | For business triggers, which spaces this version applies to. |

Use **New / Clone / Remove / Add** to manage triggers and their versions. The safest workflow is to **prototype in the [Playground](#the-playground)** and **Save** the tuned setup straight into a trigger.

## Configuration import / export

Everything Pinocchio needs — **triggers**, their versions, and the list of **LLMs** — can be moved as JSON via **Config → Import / Export**. Use it to promote a tuned setup from a test cluster to production, to back up your triggers, or to share a rule set with a teammate. *(AI **providers** and **LLMs** have their own Import/Export inside their config dialogs, since they're shared across plugins.)*

## Admin guide

- **Install / remove:** **☰ → Manage extensions → Plugins** → install **Pinocchio**.
- **LLM required:** configure a **Provider/LLM** (Config → Provider / LLM). Analyses consume tokens against that provider.
- **Permissions (scopes):** **`none`** and **`cluster`**. As a cluster-level analyst, Pinocchio needs **`cluster`** to observe cluster events. See [Security & permissions](../../admin/04-security-and-permissions).
- **Source:** Kubernetes.

## Notes

- The **cancel** and **repair** actions can **act on the resource**, not just report — treat triggers that use them as privileged automation and review their prompts carefully.
- Findings are **LLM-generated**: use them as expert guidance, and verify critical actions. The **Playground** is the safe place to tune a prompt until its verdicts are reliable.
- **Clear back** deletes stored analyses for **all** connected users — prefer **Clear my view** for a local tidy-up.

---

← Back to [Plugins (channels)](index)
