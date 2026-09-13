# tools/ — shared project scripts

Utility scripts shared across the whole monorepo (core + all plugins/providers). Kept here so agents and
contributors find them in one place instead of copies scattered per plugin.

## `gen-coverage-chart.mjs` — coverage evolution chart (CL9 point 2c)

Regenerates the **coverage evolution PNG** that every CL9 close requires (point 2, task **c** of the closure
checklist). Reads a `docs/qa/test-metrics-history.md` and plots the three coverage series
(**lines / branches / funcs**) over time as a line chart — X axis = date (one point **per table entry**, i.e.
one per row), Y axis = coverage %.

```bash
node tools/gen-coverage-chart.mjs <path/to/docs/qa/test-metrics-history.md> <path/to/docs/qa/test-metrics-coverage.png> "<Title>"
```

- Output lives **next to the history**, i.e. `docs/qa/test-metrics-coverage.png` for the core and each extension.
- Parser tolerates `.` or `,` decimals and an optional space before `%`, and finds the date/coverage cells by
  content (column order varies between artefacts). Rows without a `L% / B% / F%` cell are skipped.
- Playwright (Chromium) is resolved from any plugin's `e2e/node_modules` (agora/excubitor/iter/montag) — no
  new dependency. If none is installed, run `cd plugins/agora/e2e && npm i` first.

Regenerate every artefact's chart at once (from the repo root):

```bash
for md in docs/qa/test-metrics-history.md plugins/*/docs/qa/test-metrics-history.md providers/*/docs/qa/test-metrics-history.md; do
  name=$(head -1 "$md" | sed 's/^#\s*//; s/\s*—.*//')
  node tools/gen-coverage-chart.mjs "$md" "$(dirname "$md")/test-metrics-coverage.png" "$name — test coverage"
done
```
