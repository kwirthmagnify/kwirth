# tools/ — shared project scripts

Utility scripts shared across the whole monorepo (core + all plugins/providers). Kept here so agents and
contributors find them in one place instead of copies scattered per plugin.

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
