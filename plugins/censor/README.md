# Censor

A channel for **[Kwirth](https://kwirthmagnify.dev)** that reads your logs with an **LLM** and turns what
it finds into **regular expressions** — so the noise that buried the signal gets filtered out, and the
patterns that mattered stay named.

Nobody writes the filters for a log they have never read. Censor reads it for you: it streams the logs of
the containers you point it at, asks a model what repeats and what is worth flagging, and proposes regexes
you can keep, edit or drop. The filters it produces are plain regular expressions — yours, portable, and
readable without the model.

> **Kwirth** is an open-source Kubernetes observability and operations tool: logs, metrics, events and more,
> in real time, extended with plugins like this one.
> Website: **https://kwirthmagnify.dev** · Source: **https://github.com/kwirthmagnify/kwirth**

## What it does

- **Inventories** the containers your configuration matches — the **Objects** tab — and keeps up with the
  cluster: in a cluster-scoped session a pod created later joins the list on its own, and one that goes
  away leaves it.
- **Streams** their logs only while an analysis is running. Stopping closes the streams; a stream that
  Kubernetes cuts short reconnects with backoff instead of dropping the object.
- **Asks an LLM** for patterns, and shows each regex with its match count, its share of the total, and
  where it came from: **L** (LLM-generated), **M** (manual) or **H** (hybrid).
- **Takes business events too**, not only pod logs, through the `business` provider.
- **Routes what it flags onward** to any Kwirth sender — mail, Teams, a file, a ticket.

## Installing it

From Kwirth: **☰ → Manage extensions → Plugins**, find **Censor** in the marketplace and install it. It
needs an **AI provider** configured (its own dialog, shared with the other AI channels) before an analysis
can run.

## Configuration

A **config** is a named filter set: which containers it covers (all of them, or sources by namespace, pod
regex and label selector), which model to use, the batch size and the prompt. A session can run several
configs at once, each with its own runners.

**Auto start what's ON** starts the analysis of every active config as soon as the channel starts, so a
restored workspace comes back analyzing instead of waiting for a click.

Configs travel: **Import/Export** moves them as JSON between clusters.

The user guide, with screenshots, lives in the Kwirth documentation:
**https://kwirthmagnify.dev** → Guide → Extensions → Plugins → Censor.

## Development

```
npm install
node build.mjs          # typechecks, then builds dist/ (front.js, back.js, package.json, README.md)
npm test                # harness; COVERAGE=1 npm test for coverage
node watch.mjs          # rebuilds on every change, without typecheck
```

To run it from source, add it to `back/kwirth-dev.json` as `"censor": "../plugins/censor/dist"`. The core
caches a plugin's `back.js`: after a back change, **restart the Kwirth back**; the front reloads on its own.

The e2e suite lives in [e2e/](e2e/) and needs the app running, with credentials in `e2e/.creds.json`
(gitignored). It checks the UI contract and cancels out of the config dialog on purpose: it never starts an
analysis, because that would spend real LLM tokens.

## License

Same as Kwirth — see https://github.com/kwirthmagnify/kwirth.
