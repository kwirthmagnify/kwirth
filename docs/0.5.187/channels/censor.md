# Censor

Censor channel intercepts the log stream from selected containers and uses an LLM to **automatically discover and apply noise filters**. Instead of writing regex patterns by hand, Censor learns them: it batches incoming log lines, sends them to the configured LLM, receives back a JSON array of JavaScript regex patterns that match boilerplate entries, and then applies those patterns in-process for all subsequent lines — all without sending every single line to the LLM.

The result is a continuously self-improving filter that shows only the log lines that actually matter.

## What for

  - Remove repetitive, low-value log lines (health checks, heartbeats, routine INFO traces) automatically.
  - Reduce alert fatigue in noisy applications without writing or maintaining regex rules manually.
  - Audit what the LLM is filtering — the channel shows raw received lines, LLM input batches, LLM output (the learned patterns), warnings, errors, and live processing statistics side by side.
  - Optionally forward meaningful (non-filtered) lines to any configured [sender](../senders) for alerting or archiving.

## Features

  - **Two operating modes** — choose between `inference` mode (automatic noise pattern learning) and `audit` mode (anomaly and policy-violation detection). See [Operating modes](#operating-modes) below.
  - **Automatic regex learning** *(inference mode)* — the LLM analyses batches of log lines and returns regex patterns; these accumulate across the session.
  - **Anomaly and audit analysis** *(audit mode)* — the LLM inspects each batch for suspicious entries, policy violations, and unexpected patterns and surfaces them as actionable findings.
  - **In-process filtering** — once a pattern is learned it is applied locally, so only new batches (when the buffer fills) trigger further LLM calls.
  - **Full transparency** — six views in the tab: received lines, LLM input, LLM output, warnings, errors, and stats (lines processed, LLM calls, tokens in/out, pending count).
  - **Sessions** — named sessions capture the live stream from a specific container independently, so you can compare filtered vs. unfiltered views or share a session between the plugin and the [Censor daemon](../daemons?id=censor).
  - **Sender integration** — configure a sender + config name to forward non-noisy lines (or stats) to an external system (email, Teams, file…).
  - **Business data** — can also ingest events from the [Business provider](../providers?id=business) and apply LLM analysis to them using a dot-notation extraction path.

## Use

Before starting Censor, configure at least one LLM in **Settings → Manage LLMs**. The channel requires the LLM provider credentials (API key) to be stored there.

**Setup options:**

| Field | Description |
|---|---|
| LLM | Which LLM from the shared list to use |
| Mode | `inference` (learn noise patterns) or `audit` (detect anomalies) — see [Operating modes](#operating-modes) |
| System prompt | Instructions sent to the LLM (a sensible default is pre-filled for each mode) |
| Batch size | How many lines to accumulate before triggering an LLM call (default 50) |
| Temperature | LLM temperature — lower values produce more deterministic patterns (default 0.2) |
| Active on start | Whether to start filtering immediately when the channel opens |
| Sender / Config | Optional sender pipeline for forwarding non-noisy lines or audit findings |

Once started, the tab shows all six view panes. Toggle **Analyze** to start/stop the LLM loop at any time without restarting the channel.

?> The headless version of this channel is the **[Censor daemon](../daemons?id=censor)**, which runs the same filtering logic continuously in the background without a browser tab.

## Operating modes

Censor supports two modes of operation, selectable at configuration time.

### Inference mode

This is the original Censor behaviour. The LLM receives batches of log lines and returns a JSON array of JavaScript regex patterns that identify boilerplate, low-value entries (health checks, heartbeats, routine INFO traces). Those patterns are added to an in-memory list and applied locally to all subsequent lines. Over time the filter self-improves as it accumulates patterns, and the number of LLM calls decreases because most noise is handled locally.

**Best for:** reducing alert fatigue in high-volume, noisy applications where the noise is predictable and repetitive.

### Audit mode

In audit mode the LLM does not produce filter patterns. Instead, it inspects each incoming batch looking for entries that deviate from expected behaviour: authentication failures, unexpected configuration changes, access to sensitive resources, error spikes, unusual volumes of a given log type, or anything the system prompt tells it to flag. Findings are emitted as structured alerts visible in the warnings and output panes and can be forwarded via any configured sender.

The system prompt in audit mode is typically broader and more policy-oriented ("flag any line referencing credential access or configuration mutation") rather than pattern-learning-oriented.

**Best for:** compliance logging, security monitoring, or any scenario where you need a human-readable alert when something unexpected appears — rather than suppressing known-good noise.
