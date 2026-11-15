import { createHash } from 'crypto'
import { Client, ClientChannel, ConnectConfig, SFTPWrapper } from 'ssh2'
import { ESshError, ISshExecOptions, ISshExecResult, ISshFailure, ISshSession, ISshTarget, TSshResult } from '../common/index'

export const DEFAULT_PORT = 22
export const DEFAULT_CONNECT_TIMEOUT_MS = 10000
export const DEFAULT_MAX_OUTPUT_BYTES = 1024 * 1024

/** 'SHA256:<base64 without padding>', exactly as `ssh-keygen -lf` prints a host key. */
export const fingerprintOf = (key: Buffer): string =>
    'SHA256:' + createHash('sha256').update(key).digest('base64').replace(/=+$/, '')

/** What is compared: the prefix (any case) and the padding are optional when the user types it. */
export const normalizeFingerprint = (value: string): string =>
    value.trim().replace(/^sha256:/i, '').replace(/=+$/, '')

const fail = <T>(error: ESshError, message: string, fingerprint?: string): TSshResult<T> => {
    const failure: ISshFailure = { error, message }
    if (fingerprint !== undefined) failure.fingerprint = fingerprint
    return { ok: false, failure }
}

/** The last `limit` bytes of a stream, and whether anything was dropped. */
export class OutputTail {
    private chunks: Buffer[] = []
    private size = 0
    truncated = false

    constructor(private readonly limit: number) {}

    push(chunk: Buffer): void {
        this.chunks.push(chunk)
        this.size += chunk.length
        while (this.size > this.limit && this.chunks.length > 0) {
            const excess = this.size - this.limit
            const first = this.chunks[0]
            if (first.length <= excess) {
                this.chunks.shift()
                this.size -= first.length
            }
            else {
                this.chunks[0] = first.subarray(excess)
                this.size -= excess
            }
            this.truncated = true
        }
    }

    text(): string {
        return Buffer.concat(this.chunks).toString('utf8')
    }
}

/** ssh2's errors carry a `level` that says at which stage it went wrong; sockets carry a `code`. */
interface ISsh2Error extends Error {
    level?: string
    code?: string
}

export const classifyConnectError = (err: ISsh2Error): ESshError => {
    if (err.level === 'client-authentication') return ESshError.AUTH
    if (err.level === 'client-timeout' || err.level === 'client-socket') return ESshError.UNREACHABLE
    switch (err.code) {
        case 'ENOTFOUND':
        case 'EAI_AGAIN':
        case 'ECONNREFUSED':
        case 'ECONNRESET':
        case 'EHOSTUNREACH':
        case 'ENETUNREACH':
        case 'ETIMEDOUT':
            return ESshError.UNREACHABLE
        default:
            return ESshError.FAILED
    }
}

class SshSession implements ISshSession {
    private sftpReady: Promise<SFTPWrapper> | undefined

    constructor(private readonly client: Client, readonly fingerprint: string) {}

    private sftp(): Promise<SFTPWrapper> {
        if (!this.sftpReady) {
            this.sftpReady = new Promise<SFTPWrapper>((resolve, reject) => {
                this.client.sftp((err, sftp) => err ? reject(err) : resolve(sftp))
            })
            // A failed subsystem is not cached: the next call tries again.
            this.sftpReady.catch(() => { this.sftpReady = undefined })
        }
        return this.sftpReady
    }

    async home(): Promise<TSshResult<string>> {
        try {
            const sftp = await this.sftp()
            const path = await new Promise<string>((resolve, reject) => sftp.realpath('.', (err, p) => err ? reject(err) : resolve(p)))
            return { ok: true, value: path }
        }
        catch (err) {
            return fail(ESshError.SFTP, `cannot resolve the home directory: ${(err as Error).message}`)
        }
    }

    async put(path: string, content: string): Promise<TSshResult<void>> {
        try {
            const sftp = await this.sftp()
            await new Promise<void>((resolve, reject) => sftp.writeFile(path, content, { mode: 0o600 }, err => err ? reject(err) : resolve()))
            return { ok: true, value: undefined }
        }
        catch (err) {
            return fail(ESshError.SFTP, `cannot write '${path}': ${(err as Error).message}`)
        }
    }

    async remove(path: string): Promise<TSshResult<void>> {
        try {
            const sftp = await this.sftp()
            await new Promise<void>((resolve, reject) => sftp.unlink(path, err => err ? reject(err) : resolve()))
            return { ok: true, value: undefined }
        }
        catch (err) {
            return fail(ESshError.SFTP, `cannot remove '${path}': ${(err as Error).message}`)
        }
    }

    exec(command: string, options: ISshExecOptions): Promise<TSshResult<ISshExecResult>> {
        const limit = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES
        return new Promise(resolve => {
            this.client.exec(command, (err, stream: ClientChannel) => {
                if (err) {
                    resolve(fail(ESshError.FAILED, `cannot start the command: ${err.message}`))
                    return
                }
                const stdout = new OutputTail(limit)
                const stderr = new OutputTail(limit)
                let settled = false
                const timer = setTimeout(() => {
                    if (settled) return
                    settled = true
                    // Ask the server to kill it (most do not honour it), then drop the channel anyway.
                    try { stream.signal('KILL') } catch { /* the channel may be gone already */ }
                    stream.close()
                    resolve(fail(ESshError.TIMEOUT, `the command did not finish within ${Math.round(options.timeoutMs / 1000)} s`))
                }, options.timeoutMs)

                stream.on('data', (chunk: Buffer) => stdout.push(chunk))
                stream.stderr.on('data', (chunk: Buffer) => stderr.push(chunk))
                stream.on('close', (code: number | null | undefined, signal?: string) => {
                    clearTimeout(timer)
                    if (settled) return
                    settled = true
                    const result: ISshExecResult = {
                        exitCode: typeof code === 'number' ? code : null,
                        stdout: stdout.text(),
                        stderr: stderr.text(),
                        truncated: stdout.truncated || stderr.truncated
                    }
                    if (signal) result.signal = signal
                    resolve({ ok: true, value: result })
                })
                // A server that refuses to read stdin must not take the process down.
                stream.on('error', () => { /* reported by 'close' */ })
                if (options.stdin !== undefined) stream.end(options.stdin)
                else stream.end()
            })
        })
    }

    close(): void {
        this.client.end()
    }
}

/** Opens the connection: everything that can go wrong before a command runs is decided here. */
export const connect = (target: ISshTarget): Promise<TSshResult<ISshSession>> => {
    if (!target.host) return Promise.resolve(fail(ESshError.FAILED, 'no host to connect to'))
    if (!target.username) return Promise.resolve(fail(ESshError.AUTH, 'no user to log in as'))
    if (!target.password && !target.privateKey) return Promise.resolve(fail(ESshError.AUTH, 'neither a password nor a private key'))

    const expected = target.hostFingerprint ? normalizeFingerprint(target.hostFingerprint) : undefined
    let seen = ''

    return new Promise(resolve => {
        const client = new Client()
        let settled = false
        const done = (result: TSshResult<ISshSession>) => {
            if (settled) return
            settled = true
            resolve(result)
        }

        const config: ConnectConfig = {
            host: target.host,
            port: target.port ?? DEFAULT_PORT,
            username: target.username,
            readyTimeout: target.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS,
            hostVerifier: (key: Buffer) => {
                seen = fingerprintOf(key)
                return expected === undefined || normalizeFingerprint(seen) === expected
            }
        }
        if (target.password) config.password = target.password
        if (target.privateKey) {
            config.privateKey = target.privateKey
            if (target.passphrase) config.passphrase = target.passphrase
        }

        client.on('ready', () => done({ ok: true, value: new SshSession(client, seen) }))
        client.on('error', (err: ISsh2Error) => {
            client.end()
            if (expected !== undefined && seen && normalizeFingerprint(seen) !== expected) {
                done(fail(ESshError.HOST_KEY, `the host key of ${target.host} is ${seen}, not the expected SHA256:${expected}`, seen))
                return
            }
            done(fail(classifyConnectError(err), `${target.host}:${config.port}: ${err.message}`))
        })
        try {
            client.connect(config)
        }
        catch (err) {
            // ssh2 throws synchronously when the private key cannot be parsed (bad text, wrong passphrase).
            done(fail(ESshError.AUTH, `cannot use the private key: ${(err as Error).message}`))
        }
    })
}
