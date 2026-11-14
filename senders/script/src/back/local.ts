import { spawn, ChildProcess } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { ISenderMessage } from '@kwirthmagnify/kwirth-common-back'
import { IScriptRunResult, IScriptSenderConfig } from './types'
import { cleanEnv, commandLine, kwirthEnv, OutputTail, scriptContent, scriptExtension, stdinPayload } from './build'

/*
    Runs a configuration's script on THIS host — the back end's container, or the machine Kwirth runs on.

    The script is written to a private temporary directory (removed afterwards, whatever happens), the
    interpreter is launched with a CLEAN environment plus the KWIRTH_* variables, the message goes on
    stdin, and the process is killed — with everything it started — when the timeout expires.

    startLocal() resolves as soon as the process has STARTED and hands back a handle whose `done` settles
    when it finishes: the same code serves a delivery that waits (it awaits `done`) and one that does not
    (it returns at once and watches `done` on the side).
*/

export const DEFAULT_TIMEOUT_SECONDS = 30
export const OUTPUT_LIMIT = 8 * 1024

/** A started run. `done` only exists once the process is running, so it never rejects unobserved. */
export interface ILocalRun {
    pid: number
    done: Promise<IScriptRunResult>
    /** kills the script and everything it started */
    kill: () => void
}

/*
    Kills the script AND what it started. Killing only the interpreter leaves its children running: `sh`
    dies and the `sleep` or `curl` it launched goes on, orphaned, holding the pipes open — and the run
    never ends. On Linux the child leads its own process group and the whole group goes; on Windows,
    taskkill /T walks the tree.
*/
const killTree = (child: ChildProcess): void => {
    if (child.pid === undefined) return
    try {
        if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
        else process.kill(-child.pid, 'SIGKILL')
    }
    catch {
        child.kill('SIGKILL')
    }
}

export const startLocal = async (config: IScriptSenderConfig, messages: ISenderMessage[], batch: boolean): Promise<ILocalRun> => {
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'kwirth-script-'))
    const cleanup = () => fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {})

    const file = path.join(dir, `script${scriptExtension(config.interpreter)}`)
    try {
        await fs.promises.writeFile(file, scriptContent(config.interpreter, config.script), { mode: 0o700 })
    }
    catch (err) {
        await cleanup()
        throw err
    }

    const { command, args } = commandLine(config.interpreter, file)
    const env = cleanEnv(process.platform, process.env, config.env ? kwirthEnv(messages, batch) : {})
    const timeoutMs = (config.timeoutSeconds && config.timeoutSeconds > 0 ? config.timeoutSeconds : DEFAULT_TIMEOUT_SECONDS) * 1000

    return new Promise<ILocalRun>((resolveStart, rejectStart) => {
        const stdout = new OutputTail(OUTPUT_LIMIT)
        const stderr = new OutputTail(OUTPUT_LIMIT)
        let started = false
        let settled = false
        let timedOut = false
        let resolveDone: (r: IScriptRunResult) => void = () => {}
        let rejectDone: (e: Error) => void = () => {}
        const done = new Promise<IScriptRunResult>((res, rej) => { resolveDone = res; rejectDone = rej })

        let child: ChildProcess
        try {
            child = spawn(command, args, { cwd: dir, env, windowsHide: true, detached: process.platform !== 'win32' })
        }
        catch (err) {
            // E2BIG lands here on some platforms: the variables did not fit
            void cleanup().then(() => rejectStart(spawnError(config, err)))
            return
        }

        const timer = setTimeout(() => { timedOut = true; killTree(child) }, timeoutMs)

        /*
            The end of a run, whichever way it ends. The temporary directory is removed BEFORE anyone is
            told, so that "it finished" also means "nothing of it is left on disk".
        */
        const finish = (outcome: () => void) => {
            if (settled) return
            settled = true
            clearTimeout(timer)
            void cleanup().then(outcome)
        }

        child.on('spawn', () => {
            started = true
            resolveStart({ pid: child.pid ?? -1, done, kill: () => killTree(child) })
        })
        child.on('error', err => finish(() => started ? rejectDone(spawnError(config, err)) : rejectStart(spawnError(config, err))))
        child.stdout?.on('data', (c: Buffer) => stdout.push(c.toString()))
        child.stderr?.on('data', (c: Buffer) => stderr.push(c.toString()))
        child.on('close', (code: number | null) => finish(() => {
            if (!started) { rejectStart(new Error('the script could not be started')); return }
            const result: IScriptRunResult = {
                exitCode: code ?? -1,
                stdout: stdout.value,
                stderr: stderr.value,
                truncated: stdout.truncated || stderr.truncated
            }
            if (timedOut) { rejectDone(new Error(`the script did not finish within ${timeoutMs / 1000} s and was killed${tailOf(result.stderr)}`)); return }
            if (result.exitCode !== 0) { rejectDone(new Error(`the script exited with code ${result.exitCode}${tailOf(result.stderr)}`)); return }
            resolveDone(result)
        }))

        // A script that exits without reading its stdin closes the pipe: that is not an error of the run.
        child.stdin?.on('error', () => {})
        child.stdin?.end(stdinPayload(config.stdin, messages, batch))
    })
}

/** A run that is waited for: started, and then its end. */
export const runLocal = async (config: IScriptSenderConfig, messages: ISenderMessage[], batch: boolean): Promise<IScriptRunResult> =>
    (await startLocal(config, messages, batch)).done

/** The last lines of stderr, for an error message that says what the script said. */
const tailOf = (stderr: string): string => {
    const t = stderr.trim()
    return t === '' ? '' : `: ${t.length > 500 ? '…' + t.slice(t.length - 500) : t}`
}

/*
    A spawn failure translated: ENOENT means the interpreter is not on this host — saying so beats
    "spawn bash ENOENT" — and E2BIG means the message did not fit in the environment variables.
*/
const spawnError = (config: IScriptSenderConfig, err: unknown): Error => {
    const code = (err as NodeJS.ErrnoException)?.code
    if (code === 'ENOENT') return new Error(`the interpreter '${config.interpreter}' is not available on this host (${commandLine(config.interpreter, 'x').command} was not found in PATH)`)
    if (code === 'E2BIG') return new Error(`the message is too large to pass in environment variables: turn 'env' off and read it from stdin`)
    return new Error(`the script could not be started: ${err instanceof Error ? err.message : String(err)}`)
}
