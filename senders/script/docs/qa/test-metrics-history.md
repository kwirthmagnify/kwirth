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
| 2026-11-14 | `sender/script@0.2.0` | **61** (58 ✅ · 3 ⏭, cmd/PowerShell: Windows only) | 97.90 % / 87.44 % / 87.50 % (c8) | 0 / 0 (its form is covered by the core's `sender-script` spec, 8 cases) | **Run on another machine** (`target = ssh`, through `dce/ssh@0.1.0`, declared in `requiresExtension`): script uploaded by SFTP to the user's home (hidden, 0600, unique) and removed always; `KWIRTH_*` written at the top of the file in the interpreter's language (sh/bash `export`, PowerShell `$env:`, cmd `@set`, with their quoting); BOM for PowerShell; Windows paths and cmd-style launch line; errors name `host:port`; `wait` off returns `{ started, host }` once connected and uploaded; stop closes the connections; an unchecked host key is logged once per config (RF8). The `ssh*` fields are greyed out with `target = local` (`enabledWhen`, `kwirth-common@0.5.87`). +23 tests: 6 pure (prelude, content, paths, command line) and 17 against a fake DCE that runs with real sh what the sender sends. Checked end to end with the real bundles of DCE and sender against an in-process SSH server |
| 2026-11-14 | `sender/script@0.1.0` | **38** (35 ✅ · 3 ⏭, cmd/PowerShell: Windows only) | 96.98 % / 84.72 % / 82.05 % (c8) | 0 / 0 (its form is covered by the core's `sender-script` spec, 7 cases) | First release: local run with sh, bash, pwsh, powershell or cmd; stdin none/text/json and `KWIRTH_*` variables; a batch is one run; clean environment (whitelist); timeout kills the whole process tree; output tail of 8 KB; `wait` off returns `{ started, pid }` with at most 20 background runs per config. The real scripts run in the tests (also in the official Alpine image: 34 ✅, bash skipped there). SSH target = stream C |
