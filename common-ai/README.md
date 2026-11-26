# @kwirthmagnify/kwirth-common-ai

Shared AI/LLM types and utilities for [Kwirth](https://kwirthmagnify.dev) AI plugins.

## What is this?

The AI layer every Kwirth plugin shares, so that a plugin wanting to talk to an LLM does not have to
carry its own provider adapters, its own configuration dialogs, or its own spending controls.

It ships in three entry points:

- **`@kwirthmagnify/kwirth-common-ai`** — the isomorphic types: `ILlmProvider`, `ILlm`, `ILlmModel`,
  `IAgent`, the AI toolset contract (`IAiToolsetInfo`, `EToolEffect`, `EToolSensitivity`,
  `ECapability`), and the usage-limit model (`IUsageLimits`, `EUsageUnit`, `EUsagePeriod`).
- **`@kwirthmagnify/kwirth-common-ai/back`** — `buildModel` and the counted `generateText` /
  `streamText`, which enforce the configured ceilings around every call.
- **`@kwirthmagnify/kwirth-common-ai/front`** — the React dialogs for configuring providers and
  models, plus the LLM and toolset selectors.

## Providers

One adapter per supported SDK: Google, OpenAI, OpenRouter, Mistral, Groq, DeepSeek, Anthropic, and
`openai-compat` for any OpenAI-compatible endpoint (Huawei MaaS, vLLM, LM Studio…).

An **Azure OpenAI / AI Foundry** resource is an `openai-compat` provider:

- **Endpoint**: `https://<resource>.openai.azure.com/openai/v1`.
- **Key**: the resource's key.
- Each model's id is the **deployment name**.

Azure lists only its base models, so the *Model* field of the models dialog takes whatever is typed in its filter (`Use "<text>"`).

## Temperature

A model's **Temperature** may be left **empty**, and then none is sent: the model uses its own. That is what a
reasoning model (GPT-5, the o-series…) needs, since it takes none. With a number there, every call to such a model
is logged as an unsupported setting that the SDK dropped. Empty is "not stated", as with the prices.

## Testing a model

The models dialog has a **Test** button. It makes one short call to the model as it is typed in the form, whether saved or not. It then shows the answer, how long the call took and the tokens spent, or the provider's error. The call goes through the counted `generateText`, so it is spent like any other.

The dialog does not make the call itself. Its owner passes `onTest`, which sends the model to its back and answers with `testLlm(llm, providers)` from `/back`. Without `onTest`, the button is shown disabled.

## Costs and usage limits

Each provider declares **default prices per million tokens**, and each model may override them — within
one provider, and on one key, each model costs a different amount. A model that states no price of its
own is charged at its provider's.

Ceilings can be set on tokens in, tokens out, calls and cost, per day and per month, and apply to
whichever is reached first. A model with no limits of its own inherits the provider's.

⚠️ Spending is accounted **per API key**: models sharing a key share one budget, because that is what
the provider bills.

## Installation

```bash
npm install @kwirthmagnify/kwirth-common-ai
```

## Links

- **Kwirth**: https://kwirthmagnify.dev
- **Repository**: https://github.com/kwirthmagnify/kwirth
