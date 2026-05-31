# Pinocchio

The **Pinocchio** plugin is the AI/LLM integration layer for Kwirth. It watches Kubernetes object lifecycle events (Pods, Deployments, Services, Ingresses, and more) and business data events, and runs configurable LLM-powered analyses on them. Results (findings with severity levels, explanations, and token usage) are streamed to the frontend tab in real time.

**Key concepts:**

- **Trigger**: a rule that says "when a Kubernetes object of kind X is created/modified/deleted — or when a business event arrives in space Y — invoke this LLM version".
- **Version**: a trigger can have multiple versions, each with a different LLM, system prompt, and tool set. Only one version is active at a time.
- **Playground**: an interactive mode where you can test any prompt + LLM combination against a real or synthetic event payload without setting up triggers.

**Trigger config (`IConfigTrigger`):**

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Unique trigger identifier |
| `trigger` | `'artifact' \| 'business'` | Whether it fires on Kubernetes events or business data |
| `kind` | `string` | Kubernetes kind to watch (e.g. `'Pod'`, `'Deployment'`) — only for `artifact` triggers |
| `versions` | `IConfigTriggerVersion[]` | List of versioned configurations for this trigger |

**Trigger version config (`IConfigTriggerVersion`):**

| Field | Type | Description |
|---|---|---|
| `llm` | `string` | LLM ID to invoke |
| `system` | `string` | System prompt (plain text or Jinja2 template) |
| `promptType` | `'jinja' \| 'artifact'` | Whether the prompt is a Jinja2 template or uses the artifact body directly |
| `prompt` | `string` | User prompt template |
| `action` | `'inform' \| 'cancel' \| 'repair'` | What to do with the finding |
| `steps` | `number` | Maximum LLM agent steps |
| `tools` | `string[]` | Tool names available to the LLM |
| `spaces` | `string[]` | Business spaces to subscribe to (for business triggers) |
| `enabled` | `boolean` | Whether this version is active |

**Supported Kubernetes kinds:**
`Pod`, `Deployment`, `DaemonSet`, `StatefulSet`, `ReplicaSet`, `Job`, `CronJob`, `ReplicationController`, `Service`, `Ingress`, `HTTPRoute`

The plugin requires the **events**, **business**, and **metrics** providers.

LLMs are configured via the shared LLM list (Settings → Manage LLMs). Supported providers: `google`, `openai`, `openrouter`, `mistral`, `groq`, `deepseek` — all accessed through the Vercel AI SDK.
