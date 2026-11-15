# SSH

A **dynamic core extension** (DCE) for [Kwirth](https://kwirthmagnify.dev): an **SSH client** shared by every
Kwirth extension that needs to reach another machine — connect with a password or a private key, check the
host key, run a command with stdin and a timeout, and upload or remove files over SFTP. Linux servers and
Windows with OpenSSH Server alike.

> **Kwirth** is an open-source Kubernetes observability and operations tool: logs, metrics, events and more,
> in real time, extended with plugins. A DCE brings **objects**, not data and not screens: Kwirth calls its
> factory **once**, keeps what it returns, and any other extension asks for it by id.
> Website: **https://kwirthmagnify.dev** · Source: **https://github.com/kwirthmagnify/kwirth**

It wraps [`ssh2`](https://github.com/mscdex/ssh2) — pure JavaScript, loaded once for the whole of Kwirth instead
of once per extension. Its optional native accelerators are left out: it runs on Kwirth's official image as it is.

Used by the [script sender](https://www.npmjs.com/package/@kwirthmagnify/kwirth-sender-script) to run a script
on another machine.

## What it provides

```ts
interface ISsh {
    readonly id: string
    connect(target: ISshTarget): Promise<TSshResult<ISshSession>>
}

interface ISshSession {
    readonly fingerprint: string                   // the host key seen, 'SHA256:…'
    home(): Promise<TSshResult<string>>            // the remote home, for temporary files
    put(path: string, content: string): Promise<TSshResult<void>>
    remove(path: string): Promise<TSshResult<void>>
    exec(command: string, options: ISshExecOptions): Promise<TSshResult<ISshExecResult>>
    close(): void                                  // 🔴 always — on failure too
}
```

- **Nothing throws.** Every call answers `{ ok: true, value }` or `{ ok: false, failure }`, and `failure.error`
  says which case it is in the product's words: `unreachable`, `auth`, `hostKey`, `timeout`, `sftp`, `failed`.
  Messages never carry a secret.
- **Host key.** `hostFingerprint` in the target (`SHA256:…`, as `ssh-keygen -lf` prints it; prefix and padding
  optional) is checked; another key fails with `hostKey` and the fingerprint actually presented. Without one,
  any key is accepted and `session.fingerprint` says which, so it can be pinned.
- **Exit codes are results.** A command that exits with 3 is `ok` with `exitCode: 3`: what it means is the
  consumer's call. Running past `timeoutMs` **is** a failure (`timeout`).
- ⚠️ The timeout **closes the channel**, and that does **not** stop the remote process: OpenSSH (checked
  against OpenSSH 10.3) leaves it running — one that still writes output dies when it tries to, one that is
  waiting (`sleep`, a slow call) goes on. A remote command that must not outlive its timeout has to limit
  itself.
- Output keeps the **last** `maxOutputBytes` (1 MiB by default) of each stream, with `truncated` when it cut.

The full contract, with every field commented, is `src/common/index.ts`.

## Consuming it

Declare the dependency in the consumer's `package.json`:

```json
"requiresExtension": [{ "extensionType": "dce", "id": "ssh", "minVersion": "0.1.0" }]
```

In the back end, declare the part of the contract you use **in your own code** — the registry hands back the
instance, so an enum imported from this package would be `undefined` at runtime — and ask for it:

```ts
import { getDce } from '@kwirthmagnify/kwirth-common-back'
const ssh = getDce<ISshDce>('ssh')   // throws if it is not loaded, and says why

const c = await ssh.connect({ host: 'web-1', username: 'deploy', privateKey })
if (!c.ok) throw new Error(c.failure.message)
try {
    const r = await c.value.exec('uptime', { timeoutMs: 10000 })
    // ...
}
finally { c.value.close() }
```

`senders/script/src/back/remote.ts` in the Kwirth repository is the worked example.

## Building

```
npm install
npm run build      # typecheck + dist
npm run watch      # rebuild on every save
npm test           # against a real SSH server started inside the test process
COVERAGE=1 npm test
```

Install it from **☰ → Manage extensions → DCE** in Kwirth. Updating a DCE needs the Kwirth back end **restarted**.

Part of [Kwirth](https://github.com/kwirthmagnify/kwirth).
