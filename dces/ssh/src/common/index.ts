/*
    ── DCE `ssh` · AN SSH CLIENT FOR KWIRTH EXTENSIONS ───────────────────────────────────────────────────

    Connect to a machine, run a command on it with stdin and a timeout, and upload or remove files over
    SFTP. Linux or Windows (OpenSSH Server) alike: the DCE knows nothing about shells — what to run is the
    consumer's business.

    🔴 Why a DCE and not a dependency of each consumer: `ssh2` is pure JavaScript but not small, and every
    extension that wanted to reach a machine would carry its own copy into a back end that is already
    heavy. Loaded once here, any plugin, provider or sender gets the same client with getDce<ISsh>('ssh').

    Consumers declare their OWN copy of the shape they use (the build maps this module to the INSTANCE, so
    an enum imported from here would not survive the bundling): see the script sender.
*/

/** Where to connect and how to authenticate. */
export interface ISshTarget {
    host: string
    /** 22 when absent. */
    port?: number
    username: string
    password?: string
    /** The private key as text (OpenSSH or PEM). */
    privateKey?: string
    passphrase?: string
    /**
     * The host key the server must present, as `ssh-keygen -lf` prints it: 'SHA256:…' (the prefix and the
     * trailing '=' are optional). Absent = any host key is accepted, and the one seen is reported in
     * ISshSession.fingerprint so that it can be pinned afterwards.
     */
    hostFingerprint?: string
    /** How long to wait for the connection and the authentication. 10000 when absent. */
    connectTimeoutMs?: number
}

/**
 * Why something could not be done, in the product's words rather than the library's. The difference that
 * matters to whoever reads it is between "the machine is not there", "it does not let me in" and "it is
 * not the machine you said".
 */
export enum ESshError {
    /** DNS, connection refused, nothing answering before the timeout. */
    UNREACHABLE = 'unreachable',
    /** The server rejected the credentials, or the private key could not be read. */
    AUTH = 'auth',
    /** The server presented a host key other than the expected one. */
    HOST_KEY = 'hostKey',
    /** The command ran past its timeout. */
    TIMEOUT = 'timeout',
    /** An SFTP operation failed (home, put, remove). */
    SFTP = 'sftp',
    /** Anything else. */
    FAILED = 'failed'
}

export interface ISshFailure {
    error: ESshError
    /** One line for the screen and the log. It never carries a secret. */
    message: string
    /** With HOST_KEY: the fingerprint the server did present. */
    fingerprint?: string
}

export type TSshResult<T> = { ok: true; value: T } | { ok: false; failure: ISshFailure }

export interface ISshExecOptions {
    /** Written to the command's stdin, which is then closed. Absent = stdin closed at once. */
    stdin?: string
    timeoutMs: number
    /** Keeps the LAST n bytes of each stream (what explains a failure is at the end). 1 MiB when absent. */
    maxOutputBytes?: number
}

export interface ISshExecResult {
    /** null = the command ended by a signal. */
    exitCode: number | null
    signal?: string
    stdout: string
    stderr: string
    /** Some output was dropped to stay within maxOutputBytes. */
    truncated: boolean
}

/**
 * One open connection. 🔴 Whoever connects must close() it — always, on failure too: an SSH connection
 * left open holds a socket and a session on the remote machine.
 */
export interface ISshSession {
    /** The host key actually seen, 'SHA256:…'. */
    readonly fingerprint: string
    /** The remote user's home directory as SFTP sees it — the place for temporary files. */
    home(): Promise<TSshResult<string>>
    put(path: string, content: string): Promise<TSshResult<void>>
    remove(path: string): Promise<TSshResult<void>>
    /**
     * Runs a command. An exit code other than 0 is a RESULT, not a failure: what it means is the
     * consumer's call. Running past the timeout IS a failure (TIMEOUT).
     *
     * ⚠️ The timeout closes the channel, and that does NOT stop the remote process: OpenSSH (checked against
     * 10.3) leaves it running — one that still writes dies when it tries to, one that waits goes on. A
     * command that must not outlive its timeout has to limit itself.
     */
    exec(command: string, options: ISshExecOptions): Promise<TSshResult<ISshExecResult>>
    close(): void
}

/** What the DCE shares. */
export interface ISsh {
    /** The DCE's id, as the core installed it. */
    readonly id: string
    connect(target: ISshTarget): Promise<TSshResult<ISshSession>>
}
