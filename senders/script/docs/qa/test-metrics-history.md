# Sender `script` — test metrics history

> **Incremental** record of the suite, one row per release. A row is **added on top** at every close; rows
> are **never rewritten** — it is a history.
>
> - **Harness** = number of tests reported by `npm test`.
> - **Coverage** = `COVERAGE=1 npm test`.
> - **e2e** = a sender has no UI of its own.
>
> The two charts next to this file are generated, never drawn by hand:
> `node tools/gen-coverage-chart.mjs <this file> <test-metrics-coverage.png> "<title>"` (Kwirth repository).

| Date | Version / tag | Harness | Coverage (lines / branches / funcs) | e2e (specs / cases) | Notes |
|---|---|---|---|---|---|
| 2026-11-14 | `sender/script@0.1.0` | **38** (35 ✅ · 3 ⏭, cmd/PowerShell: Windows only) | 96.98 % / 84.72 % / 82.05 % (c8) | 0 / 0 (its form is covered by the core's `sender-script` spec, 7 cases) | First release: local run with sh, bash, pwsh, powershell or cmd; stdin none/text/json and `KWIRTH_*` variables; a batch is one run; clean environment (whitelist); timeout kills the whole process tree; output tail of 8 KB; `wait` off returns `{ started, pid }` with at most 20 background runs per config. The real scripts run in the tests (also in the official Alpine image: 34 ✅, bash skipped there). SSH target = stream C |
