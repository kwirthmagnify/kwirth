import { randomUUID } from 'crypto'
import { getDce, ISenderMessage } from '@kwirthmagnify/kwirth-common-back'
import { IScriptRunResult, IScriptSenderConfig } from './types'
import { kwirthEnv, remoteCommand, remoteScriptContent, scriptExtension, stdinPayload } from './build'
import { DEFAULT_TIMEOUT_SECONDS, OUTPUT_LIMIT } from './local'
import { IBackgroundRun, tailOf } from './run'

/*
    Runs a configuration's script on ANOTHER machine (target = ssh), Linux or Windows, through the DCE
    'ssh': connect, upload the script by SFTP to the remote user's home, run it with the message on stdin,
    remove it, close. The KWIRTH_* variables travel inside the uploaded file (see envPrelude in build.ts).

    startRemote() resolves once the machine has accepted the connection and the script is uploaded: what
    can be known before running — the machine is not there, it rejects the credentials, its host key is
    not the expected one — fails the delivery even when it does not wait.
*/

/*
    The part of the DCE 'ssh' contract this sender uses, declared HERE: the build maps the DCE to its
    INSTANCE, and a type or an enum imported from the DCE's package would not survive the bundling. Mirror
    of dces/ssh/src/common/index.ts — keep both in step.
*/
export const SSH_DCE_ID = 'ssh'

export enum ESshDceError {
    UNREACHABLE = 'unreachable',
    AUTH = 'auth',
    HOST_KEY = 'hostKey',
    TIMEOUT = 'timeout',
    SFTP = 'sftp',
    FAILED = 'failed'
}

export interface ISshDceTarget {
    host: string
    port?: number
    username: string
    password?: string
    privateKey?: string
    passphrase?: string
    hostFingerprint?: string
}

export interface ISshDceFailure {
    error: ESshDceError
    message: string
    fingerprint?: string
}

export type TSshDceResult<T> = { ok: true; value: T } | { ok: false; failure: ISshDceFailure }

export interface ISshDceExecResult {
    exitCode: number | null
    signal?: string
    stdout: string
    stderr: string
    truncated: boolean
}

export interface ISshDceSession {
    readonly fingerprint: string
    home(): Promise<TSshDceResult<string>>
    put(path: string, content: string): Promise<TSshDceResult<void>>
    remove(path: string): Promise<TSshDceResult<void>>
    exec(command: string, options: { stdin?: string; timeoutMs: number; maxOutputBytes?: number }): Promise<TSshDceResult<ISshDceExecResult>>
    close(): void
}

export interface ISshDce {
    readonly id: string
    connect(target: ISshDceTarget): Promise<TSshDceResult<ISshDceSession>>
}

/** A started remote run. */
export interface IRemoteRun extends IBackgroundRun {
    host: string
}

/** What the sender can be told without failing the run: a temporary file that stayed behind. */
export type TRemoteWarn = (message: string) => void

const sshDce = (): ISshDce => {
    try {
        return getDce<ISshDce>(SSH_DCE_ID)
    }
    catch (err) {
        throw new Error(`running on another machine needs the DCE '${SSH_DCE_ID}' (Manage extensions → DCE): ${err instanceof Error ? err.message : String(err)}`)
    }
}

/** The configuration's SSH fields as the DCE wants them; what is missing is said, not guessed. */
export const sshTarget = (config: IScriptSenderConfig): ISshDceTarget => {
    const host = (config.sshHost ?? '').trim()
    const username = (config.sshUser ?? '').trim()
    if (!host) throw new Error(`target is 'ssh' but no SSH host is configured`)
    if (!username) throw new Error(`target is 'ssh' but no SSH user is configured`)
    if (!config.sshPassword && !config.sshPrivateKey) throw new Error(`target is 'ssh' but neither an SSH password nor a private key is configured`)
    const port = Number(config.sshPort)
    const target: ISshDceTarget = { host, username, port: Number.isInteger(port) && port > 0 ? port : 22 }
    if (config.sshPassword) target.password = config.sshPassword
    if (config.sshPrivateKey) target.privateKey = config.sshPrivateKey
    if (config.sshPassphrase) target.passphrase = config.sshPassphrase
    if (config.sshFingerprint && config.sshFingerprint.trim()) target.hostFingerprint = config.sshFingerprint.trim()
    return target
}

export const startRemote = async (config: IScriptSenderConfig, messages: ISenderMessage[], batch: boolean, warn: TRemoteWarn): Promise<IRemoteRun> => {
    const target = sshTarget(config)
    const dce = sshDce()
    const where = `${target.host}:${target.port}`

    const connected = await dce.connect(target)
    if (!connected.ok) throw new Error(connected.failure.message)
    const session = connected.value
    // RF8: without a fingerprint nothing was checked — say which key it was, so that it can be pinned.
    if (!target.hostFingerprint) warn(`the host key of ${target.host} was not checked (no fingerprint configured): it is ${session.fingerprint}`)

    // From here on the connection is open: every way out closes it.
    let file: string
    try {
        const home = await session.home()
        if (!home.ok) throw new Error(home.failure.message)
        const sep = home.value.endsWith('/') ? '' : '/'
        file = `${home.value}${sep}.kwirth-script-${randomUUID()}${scriptExtension(config.interpreter)}`
        const vars = config.env ? kwirthEnv(messages, batch) : {}
        const put = await session.put(file, remoteScriptContent(config.interpreter, config.script, vars))
        if (!put.ok) throw new Error(put.failure.message)
    }
    catch (err) {
        session.close()
        throw err
    }

    const timeoutSeconds = config.timeoutSeconds && config.timeoutSeconds > 0 ? config.timeoutSeconds : DEFAULT_TIMEOUT_SECONDS
    const done = (async (): Promise<IScriptRunResult> => {
        try {
            const r = await session.exec(remoteCommand(config.interpreter, file), {
                stdin: stdinPayload(config.stdin, messages, batch),
                timeoutMs: timeoutSeconds * 1000,
                maxOutputBytes: OUTPUT_LIMIT
            })
            if (!r.ok) {
                if (r.failure.error === ESshDceError.TIMEOUT) throw new Error(`the script did not finish within ${timeoutSeconds} s on ${where} and its SSH channel was closed`)
                throw new Error(`${where}: ${r.failure.message}`)
            }
            const { exitCode, signal, stdout, stderr, truncated } = r.value
            if (exitCode === null) throw new Error(`the script on ${where} was ended by signal ${signal ?? 'unknown'}${tailOf(stderr)}`)
            if (exitCode !== 0) throw new Error(`the script exited with code ${exitCode} on ${where}${tailOf(stderr)}`)
            return { exitCode, stdout, stderr, truncated, hostFingerprint: session.fingerprint }
        }
        finally {
            const removed = await session.remove(file)
            if (!removed.ok) warn(`the temporary script could not be removed from ${where}: ${removed.failure.message}`)
            session.close()
        }
    })()

    return { host: target.host, label: `ssh ${target.host}`, done, kill: () => session.close() }
}
