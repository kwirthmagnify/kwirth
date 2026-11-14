# SSH DCE

An **SSH client** as a [dynamic core extension](index): any extension that needs to reach another machine —
run a command there, copy a file — asks for it instead of carrying its own.

| | |
|---|---|
| id | `ssh` |
| package | `@kwirthmagnify/kwirth-dce-ssh` |
| sides | back |
| source | `dces/ssh` in the kwirth repo |

It is consumed by the [script sender](/0.6.31/guide/extensions/senders/script), to run a script on another
machine. Installing that sender installs this DCE with it.

## What it provides

```ts
interface ISsh {
    readonly id: string
    connect(target: ISshTarget): Promise<TSshResult<ISshSession>>
}

interface ISshSession {
    readonly fingerprint: string
    home(): Promise<TSshResult<string>>
    put(path: string, content: string): Promise<TSshResult<void>>
    remove(path: string): Promise<TSshResult<void>>
    exec(command: string, options: ISshExecOptions): Promise<TSshResult<ISshExecResult>>
    close(): void
}
```

`connect` takes the host, port (22), user, and a **password** or a **private key** (with its passphrase if it
has one). A session is one open connection: whoever opens it **closes it**, also when something failed.

### Nothing throws

Every call answers `{ ok: true, value }` or `{ ok: false, failure }`, and the failure says which case it is:

| `failure.error` | when |
|---|---|
| `unreachable` | the name does not resolve, the connection is refused, nothing answers in time |
| `auth` | the server rejects the credentials, or the private key cannot be read (wrong passphrase) |
| `hostKey` | the server presented another host key than the expected one — `failure.fingerprint` says which |
| `timeout` | the command ran past its timeout |
| `sftp` | uploading, removing or locating the home failed |
| `failed` | anything else |

The message is one line for the screen and the log, and never carries a password or a key.

### The host key

`hostFingerprint` is the key the server must present, in the form `ssh-keygen -lf` prints it: `SHA256:…`. The
prefix and the trailing `=` are optional. A different key fails with `hostKey`.

Without one, **any** key is accepted, and `session.fingerprint` reports the one seen — run once, copy it, and
pin it. To read it from the machine itself:

```sh
ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub                      # Linux
ssh-keygen -lf C:\ProgramData\ssh\ssh_host_ed25519_key.pub            # Windows (OpenSSH Server)
```

### Running a command

`exec` sends a command line to the remote user's shell — a POSIX shell on Linux; on Windows, OpenSSH's default
shell, **cmd** unless it was changed. Optional stdin is written and closed.

- An exit code other than 0 is a **result**, not a failure: what it means is the consumer's business.
- Past `timeoutMs` the channel is closed and the call fails with `timeout`. ⚠️ That does **not** stop the
  remote process: OpenSSH leaves it running — one that still writes output dies when it tries to, one that is
  waiting (`sleep`, a slow call) goes on. A command that must not outlive its timeout has to limit itself.
- Output keeps the **last** `maxOutputBytes` (1 MiB by default) of stdout and of stderr, with `truncated`.

### It runs anywhere Kwirth does

It wraps `ssh2`, which is pure JavaScript. Its two optional native accelerators are left out of the bundle, so
it works on Kwirth's official image with no compiler and nothing to install.

## Consuming it

```json
"requiresExtension": [{ "extensionType": "dce", "id": "ssh", "minVersion": "0.1.0" }]
```

Declare the part of the contract you use in your own code — the registry hands back the **instance**, and an
enum imported from the package would be `undefined` at runtime — and ask for it with
`getDce<ISshDce>('ssh')`. `senders/script/src/back/remote.ts` in the kwirth repo is the worked example.
