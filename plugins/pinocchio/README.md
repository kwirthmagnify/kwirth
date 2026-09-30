# Pinocchio

An **agentic AI analyst** for **[Kwirth](https://kwirthmagnify.dev)**: it watches what changes in the
cluster and, when something matches a trigger, has an LLM review the object and say what is wrong with it.

Point it at *every new Pod* or *every Ingress change* and it comes back with a structured verdict —
**findings** with a severity and a remediation each, a **Pod Security Standard** assessment, a **risk
score**, and a full report in Markdown. Not a chat window: a reviewer that runs on its own and leaves
something you can act on.

> **Kwirth** is an open-source Kubernetes observability and operations tool: logs, metrics, events and more,
> in real time, extended with plugins like this one.
> Website: **https://kwirthmagnify.dev** · Source: **https://github.com/kwirthmagnify/kwirth**

## What it is for

- **Reviewing a workload as it arrives** — privilege issues, missing limits, exposed secrets,
  supply-chain risks, PSS compliance.
- **Reacting to an event**, whether a Kubernetes change or a business event, with an LLM assessment
  instead of a notification nobody reads.
- **Trying prompts out** in the **Playground** before wiring one to a live trigger.

## Installing it

From Kwirth: **☰ → Manage extensions → Plugins**, find **Pinocchio** in the marketplace and install it.
It pulls in the AI toolsets it uses to gather context — inventory, describe, observability, metrics and
secrets — and the **business** provider; the marketplace installs them with it.

It needs an **AI provider** configured in Kwirth (its own dialog, shared with the other AI channels): the
model is yours, and Pinocchio only decides what to ask it.

## Configuration

A **trigger** says what to react to — the kind of object, whether it was added, modified or deleted, and
optionally a filter. The analysis runs **agentically**: several steps, with tools, so the model can look
things up before concluding rather than guessing from a single payload.

The user guide, with screenshots, lives in the Kwirth documentation:
**https://kwirthmagnify.dev** → Guide → Extensions → Plugins → Pinocchio.

## Development

```
npm install
node build.mjs          # typechecks, builds dist/ and regenerates the docs tarball
node watch.mjs          # rebuilds on every change, without typecheck
npm run docs            # the documentation bundle on its own
```

To run it from source, add it to `back/kwirth-dev.json` as `"pinocchio": "../plugins/pinocchio/dist"`.
The core caches a plugin's `back.js`: after a back change, **restart the Kwirth back**; the front reloads
on its own.

## License

Same as Kwirth — see https://github.com/kwirthmagnify/kwirth.
