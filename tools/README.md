# tools/ — shared project scripts

Utility scripts shared across the whole monorepo (core + all plugins/providers). Kept here so agents and
contributors find them in one place instead of copies scattered per plugin.

## `create-kwirth-*.mjs` — scaffolds

One per extension type. They ask for an id and a few names —or take them as flags, which is what CI and a
repeated scaffold want— and write a folder that already builds:

```bash
node tools/create-kwirth-plugin.mjs                     # interactive
node tools/create-kwirth-login.mjs --id my-login --name "My Login"
```

| Script | Creates | Notes |
|---|---|---|
| `create-kwirth-plugin.mjs` | `plugins/<id>/` | front + back, the big one |
| `create-kwirth-provider.mjs` | `providers/<id>/` | a data source |
| `create-kwirth-homepage.mjs` | `homepages/<id>/` | a landing dashboard |
| `create-kwirth-theme.mjs` | `themes/<id>/` | a palette |
| `create-kwirth-login.mjs` | `logins/<id>/` | a branded login page — **no TypeScript**, just `login.json` and its images |
| `create-kwirth-aitoolset.mjs` | `aitoolsets/<id>/` | a package of tools a model can call — back only, no UI at all |

The login one carries the background rule already solved: `background.png` is the one that must fit
anywhere and the build **fails** if it goes over ~600 KB, while `background-hi.png` is optional and has no
limit — Kwirth uses it wherever the storage allows. Until now a login was created by copying
`logins/_template/` by hand, which is exactly where the id gets changed in one place and forgotten in
another.

The AI toolset one asks for its **capabilities** (`k8s`, `metrics`, `events`, `repos`), which is the
decision that shapes the package: the host lends **only what is declared**, so the example tool is written
against exactly that, and so is the fake host in its harness. With `k8s` it also offers a `verify.mjs`,
to run the read tools against a real cluster — the part that a harness with fake clients can never cover.

It ends by printing the two steps that are easy to skip and look like a broken tool rather than a missing
step: **restart the back** (AI toolsets have *no hot reload* — the core reads their `dist` once, at
startup) and **grant it** in Extensions → AI toolsets, because installing a toolset does not give it to
anyone.

## `gen-coverage-chart.mjs` — QA charts (CL9 point 2c)

Regenerates the **two QA PNGs** that every CL9 close requires (point 2, task **c** of the closure checklist).
Reads a `docs/qa/test-metrics-history.md` and writes **both charts in a single run** — X axis = date in both
(one point **per table entry**, i.e. one per row):

| Output | Series | Y axis |
|---|---|---|
| `test-metrics-coverage.png` | lines / branches / funcs | coverage % |
| `test-metrics-tests.png` | harness tests / e2e cases | count, always from 0 |

```bash
node tools/gen-coverage-chart.mjs <path/to/docs/qa/test-metrics-history.md> <path/to/docs/qa/test-metrics-coverage.png> "<Title>"
```

- Only the coverage PNG is named on the command line; the second path is **derived** from it
  (`…-coverage.png` → `…-tests.png`), so both always land next to the history.
- The suite-size chart counts tests that **exist**, not tests that ran: from `13 specs · 39 casos · 38 ✅,
  1 saltado` it plots **39**, not 38. A skipped or failing test is still a test that was written.
- Coverage cells are found **by content** (the unambiguous `L% / B% / F%`); harness and e2e **by header**
  (`Harness…` / `e2e…`), because those cells are free prose. Both count formats are understood:
  `2 / 5` (specs / cases) and `13 specs · 39 casos`.
- Parser tolerates `.` or `,` decimals and an optional space before `%`.
- A chart with no usable number is **skipped with a warning**, not an error: santander has `N/A (sin código)`
  for coverage, entraid has manual-only e2e, pinocchio has no harness. A row missing one series **breaks the
  line** there instead of inventing a value.
- Playwright (Chromium) is resolved from any plugin's `e2e/node_modules` (agora/excubitor/iter/montag) — no
  new dependency. If none is installed, run `cd plugins/agora/e2e && npm i` first.

Regenerate every artefact's charts at once (from the repo root — add `logins/*` and `idps/*` for those):

```bash
for md in docs/qa/test-metrics-history.md plugins/*/docs/qa/test-metrics-history.md providers/*/docs/qa/test-metrics-history.md; do
  name=$(head -1 "$md" | sed 's/^#\s*//; s/\s*—.*//')
  node tools/gen-coverage-chart.mjs "$md" "$(dirname "$md")/test-metrics-coverage.png" "$name — test coverage"
done
```
