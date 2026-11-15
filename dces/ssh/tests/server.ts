// An SSH server in the test process (ssh2's own Server): password and public-key authentication, exec
// that REALLY runs the command with sh, and the SFTP calls the DCE uses, on a temporary directory.
// No Docker, no machine of anybody's.

import { spawn, ChildProcess } from 'child_process'
import { createHash } from 'crypto'
import { mkdtempSync, openSync, writeSync, closeSync, unlinkSync, rmSync } from 'fs'
import { AddressInfo } from 'net'
import { tmpdir } from 'os'
import path from 'path'
import { ParsedKey, Server, utils } from 'ssh2'

export const USER = 'kwirth'
export const PASSWORD = 'pa55-word'

export interface ITestServer {
    port: number
    root: string
    hostPublic: string
    clientKey: { private: string, public: string }
    clientKeyWithPassphrase: { private: string, public: string }
    passphrase: string
    /** Processes started by exec that are still alive. */
    running: Set<ChildProcess>
    close(): Promise<void>
}

const parsed = (key: string): ParsedKey => {
    const p = utils.parseKey(key)
    if (p instanceof Error) throw p
    return Array.isArray(p) ? p[0] : p
}

export const startServer = async (): Promise<ITestServer> => {
    const host = utils.generateKeyPairSync('ed25519')
    const clientKey = utils.generateKeyPairSync('ed25519')
    const passphrase = 'key-passphrase'
    const clientKeyWithPassphrase = utils.generateKeyPairSync('ed25519', { passphrase, cipher: 'aes256-cbc' })
    const allowed = [parsed(clientKey.public), parsed(clientKeyWithPassphrase.public)]
    const root = mkdtempSync(path.join(tmpdir(), 'kwirth-ssh-test-'))
    const running = new Set<ChildProcess>()
    const { STATUS_CODE } = utils.sftp

    const server = new Server({ hostKeys: [host.private] }, conn => {
        conn.on('authentication', ctx => {
            if (ctx.username !== USER) return ctx.reject()
            if (ctx.method === 'password' && ctx.password === PASSWORD) return ctx.accept()
            if (ctx.method === 'publickey') {
                const key = allowed.find(k => k.type === ctx.key.algo && k.getPublicSSH().equals(ctx.key.data))
                if (key && (!ctx.signature || (ctx.blob && key.verify(ctx.blob, ctx.signature, ctx.hashAlgo) === true))) return ctx.accept()
            }
            ctx.reject(['password', 'publickey'])
        })
        conn.on('error', () => { /* a client that drops the connection */ })
        conn.on('ready', () => {
            conn.on('session', acceptSession => {
                const session = acceptSession()
                session.on('exec', (accept, _reject, info) => {
                    const stream = accept()
                    const child = spawn('sh', ['-c', info.command], { cwd: root, detached: true })
                    running.add(child)
                    stream.pipe(child.stdin)
                    child.stdin.on('error', () => { /* the command did not read its stdin */ })
                    child.stdout.pipe(stream, { end: false })
                    child.stderr.pipe(stream.stderr, { end: false })
                    child.on('close', code => {
                        running.delete(child)
                        try {
                            stream.exit(code ?? 255)
                            stream.end()
                        }
                        catch { /* the client already closed the channel */ }
                    })
                    // The client gave up (timeout): like OpenSSH, the process is NOT killed — close() does it.
                    stream.on('error', () => { /* the client closed the channel */ })
                })
                session.on('sftp', acceptSftp => {
                    const sftp = acceptSftp()
                    const handles = new Map<number, number>()
                    let next = 0
                    sftp.on('REALPATH', (reqid, given) => {
                        const p = given === '.' ? root : path.resolve(root, given)
                        sftp.name(reqid, [{ filename: p, longname: p, attrs: { mode: 0o40755, uid: 0, gid: 0, size: 0, atime: 0, mtime: 0 } }])
                    })
                    sftp.on('OPEN', (reqid, filename, flags) => {
                        try {
                            const fd = openSync(filename, utils.sftp.flagsToString(flags) ?? 'w', 0o600)
                            const handle = Buffer.alloc(4)
                            handle.writeUInt32BE(next, 0)
                            handles.set(next++, fd)
                            sftp.handle(reqid, handle)
                        }
                        catch { sftp.status(reqid, STATUS_CODE.FAILURE) }
                    })
                    sftp.on('WRITE', (reqid, handle, offset, data) => {
                        const fd = handles.get(handle.readUInt32BE(0))
                        if (fd === undefined) return sftp.status(reqid, STATUS_CODE.FAILURE)
                        writeSync(fd, data, 0, data.length, offset)
                        sftp.status(reqid, STATUS_CODE.OK)
                    })
                    sftp.on('FSETSTAT', reqid => sftp.status(reqid, STATUS_CODE.OK))
                    sftp.on('CLOSE', (reqid, handle) => {
                        const id = handle.readUInt32BE(0)
                        const fd = handles.get(id)
                        if (fd !== undefined) closeSync(fd)
                        handles.delete(id)
                        sftp.status(reqid, STATUS_CODE.OK)
                    })
                    sftp.on('REMOVE', (reqid, filename) => {
                        try {
                            unlinkSync(filename)
                            sftp.status(reqid, STATUS_CODE.OK)
                        }
                        catch { sftp.status(reqid, STATUS_CODE.NO_SUCH_FILE) }
                    })
                })
            })
        })
    })

    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve()))
    const port = (server.address() as AddressInfo).port

    return {
        port, root, running, passphrase, clientKey, clientKeyWithPassphrase,
        hostPublic: host.public,
        close: async () => {
            for (const child of running) if (child.pid) { try { process.kill(-child.pid, 'SIGKILL') } catch { /* gone */ } }
            await new Promise<void>(resolve => server.close(() => resolve()))
            rmSync(root, { recursive: true, force: true })
        }
    }
}

/** The host key's fingerprint as `ssh-keygen -lf` would print it, computed independently of the DCE. */
export const hostFingerprint = (publicKey: string): string => {
    return 'SHA256:' + createHash('sha256').update(parsed(publicKey).getPublicSSH()).digest('base64').replace(/=+$/, '')
}
