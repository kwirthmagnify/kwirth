# DCE `ssh` — test metrics history

> **Incremental** record of the suite, one row per release. A row is **added on top** at every close; rows
> are **never rewritten** — it is a history.
>
> - **Harness** = number of tests reported by `npm test` in `dces/ssh/`.
> - **Coverage** = `COVERAGE=1 npm test` (c8, mapped back to `src/`).
> - **e2e** = a DCE has no UI: it is validated live through its consumer (the script sender), and that goes
>   into the consumer's history. Here it is `0 / 0`.
>
> The two charts next to this file are generated, never drawn by hand:
> `node tools/gen-coverage-chart.mjs <this file> <test-metrics-coverage.png> "<title>"` (Kwirth repository).

| Date | Version / tag | Harness | Coverage (lines / branches / funcs) | e2e (specs / cases) | Notes |
|---|---|---|---|---|---|
| 2026-11-14 | `dce/ssh@0.1.0` | **18** | 97.56 % / 89.69 % / 100 % (c8) | 0 / 0 | **First release**, for the script sender's `target = ssh` (plans/sender-script, stream C). Wraps `ssh2` (bundled, ~735 KB unminified; its two native accelerators left out, so it runs on the official image). Contract: `connect()` → a session with `home`/`put`/`remove`/`exec`/`close`; nothing throws, every call is `ok` or a typed failure (`unreachable`, `auth`, `hostKey`, `timeout`, `sftp`, `failed`) whose message never carries a secret. Tests run against a **real SSH server inside the test process** (`ssh2`'s `Server`): password, key with and without passphrase, wrong passphrase, a non-key, expected host key matching with or without prefix/padding and not matching, nothing listening, exit codes and stderr, stdin verbatim and closed, timeout that answers at once, output tail, SFTP put (0600, verbatim)/remove/home and their failures. Also checked end to end with the real `dist` of the DCE and of the sender against that server and against a **real OpenSSH 10.3** (container): password, wrong password, exit 3 with stderr, prelude with quotes and line breaks, pinned host key = `ssh-keygen -lf`, nothing left in the home. 🔴 That real server showed that **closing the channel does not kill the remote process** (a `sleep 30` survived the timeout): the test server used to kill it and was made faithful, and the contract, README and guides say so. Windows OpenSSH: pending the user's QA |
