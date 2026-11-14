import { IExtensionLogger, IExtensionNodeMeta, ISender, ISenderAccess, ISenderConfig, ISenderFieldDef, ISenderMessage } from '@kwirthmagnify/kwirth-common-back'
import { EScriptInterpreter, EScriptStdin, EScriptTarget, IScriptRunResult, IScriptSenderConfig, IScriptStartResult } from './types'
import { DEFAULT_TIMEOUT_SECONDS, startLocal } from './local'
import { startRemote } from './remote'
import { IBackgroundRun } from './run'

/*
    How many runs of ONE configuration may be going on in the background (wait = off) at the same time.
    Without waiting nothing holds an alarm storm back, and every message would be a process inside the
    back end's pod: past this, the delivery fails saying so instead of drowning the pod.
*/
export const MAX_BACKGROUND_RUNS = 20

/*
    Script Sender.

    Its destination is not a service but a SCRIPT written in the configuration: every message that reaches
    a configuration runs it, with the message on stdin and/or in KWIRTH_* environment variables.

    🔴 It runs code with the identity of the back end — its service account, its file system, its network.
    Only someone who administers senders can write one, and the README says so first.

    Product: plans/sender-script/PRD.md. A batch is ONE run (D5): a log forwarder must not launch a hundred
    processes a second.
*/

const INTERPRETERS = Object.values(EScriptInterpreter)
const STDIN_MODES = Object.values(EScriptStdin)
const TARGETS = Object.values(EScriptTarget)
// The SSH fields are always on the form, greyed out unless the script runs on another machine.
const ON_SSH = { field: 'target', values: [EScriptTarget.SSH] }

/*
    What the LLM is told when it drafts the script (IConfigFieldDef.aiInstructions). It is the sender's
    contract in words: an LLM that does not know it writes a script that reads arguments nobody passes.
*/
const SCRIPT_AI_INSTRUCTIONS = [
    'The value is a script that Kwirth runs once for every message (or once for a whole batch of messages) sent to this configuration.',
    'It is run with the interpreter selected in the "Interpreter" field: sh, bash, pwsh (PowerShell 7), powershell (Windows PowerShell 5.1) or cmd. Write it for exactly that interpreter.',
    'It receives NO command-line arguments. The message arrives as the "Standard input" field says:',
    '- none: nothing on stdin;',
    '- text: the message body as plain text (for a batch, one body per line) — it can be any text, such as the description of an alarm;',
    '- json: the whole message as JSON, {"subject"?, "body", "to"?, "level"? (debug|info|warning|error), "metadata"?, "origin"? {cluster, namespace, pod, container, service, source, timestamp}} (for a batch, an array of them).',
    'When "KWIRTH_* environment variables" is on, it also has KWIRTH_BODY, KWIRTH_SUBJECT, KWIRTH_LEVEL, KWIRTH_TO (comma-separated) and KWIRTH_MESSAGE (the message as JSON); for a batch only KWIRTH_BODY (one body per line) and KWIRTH_MESSAGE (an array).',
    'Where it runs depends on the "Run on" (target) field:',
    '- local: inside Kwirth itself, with a minimal environment (no variables of the host other than PATH and the basics, so it must not rely on any). With sh, assume Kwirth\'s official container image (Alpine): a POSIX BusyBox sh with BusyBox tools — wget is available (wget -q -O- --header=... --post-data=...), curl, bash and jq are NOT. Use only POSIX sh syntax.',
    '- ssh: on another machine, logged in over SSH as the configured user, with that user\'s environment and whatever that machine has installed (a Linux server, or Windows with OpenSSH for powershell/pwsh/cmd).',
    'Exit with code 0 on success; any other code, or running longer than the configured timeout, makes the delivery fail. What it writes to stderr is shown in the error.',
    'Answer with the script only.'
].join('\n')

export default class ScriptSender implements ISender {
    readonly id = 'script'
    readonly senderType = 'output' as const
    private configs = new Map<string, IScriptSenderConfig>()
    /** The runs going on in the background, by configuration: counted for the cap, killed on stop. */
    private background = new Map<string, Set<IBackgroundRun>>()
    /*
        Warnings already written, by configuration: a remote run repeats the same one on every message
        (an unchecked host key) and the log needs it once. One that names something new each time — a
        temporary file left on a machine — is never the same text, so it is always written.
    */
    private warned = new Set<string>()

    // Until the core hands over its own logger (setLogger), the sender writes to the console.
    private logger: IExtensionLogger = {
        info: (m: unknown) => console.log('[script]', m),
        trace: () => {},
        warning: (m: unknown) => console.warn('[script]', m),
        error: (m: unknown) => console.error('[script]', m)
    }

    setLogger(logger: IExtensionLogger): void {
        this.logger = logger
    }

    addConfig(config: ISenderConfig): void {
        this.configs.set(config.name, config as IScriptSenderConfig)
        this.forgetWarnings(config.name)
    }

    removeConfig(name: string): void {
        this.configs.delete(name)
        this.forgetWarnings(name)
    }

    /** A configuration that changes or goes may point somewhere else: its warnings are due again. */
    private forgetWarnings(name: string): void {
        const prefix = `config '${name}': `
        for (const w of this.warned) if (w.startsWith(prefix)) this.warned.delete(w)
    }

    hasConfig(name: string): boolean {
        return this.configs.has(name)
    }

    getConfigNames(): string[] {
        return Array.from(this.configs.keys())
    }

    getConfigSchema(): ISenderFieldDef[] {
        return [
            { name: 'name', label: 'Name', required: true },
            { name: 'target', label: 'Run on', type: 'select', required: true, options: TARGETS, default: EScriptTarget.LOCAL,
                labels: ['This Kwirth', 'Another machine (SSH)'] },
            { name: 'interpreter', label: 'Interpreter', type: 'select', required: true, options: INTERPRETERS, default: EScriptInterpreter.SH,
                labels: ['sh', 'bash', 'pwsh (PowerShell 7)', 'powershell (Windows PowerShell)', 'cmd (Windows)'] },
            { name: 'script', label: 'Script', type: 'textarea', required: true, aiInstructions: SCRIPT_AI_INSTRUCTIONS },
            { name: 'stdin', label: 'Standard input', type: 'select', options: STDIN_MODES, default: EScriptStdin.TEXT,
                labels: ['Nothing', 'The message body as text', 'The whole message as JSON'] },
            { name: 'env', label: 'KWIRTH_* environment variables', type: 'boolean', default: true },
            { name: 'wait', label: 'Wait for the script to finish', type: 'boolean', default: true },
            { name: 'timeoutSeconds', label: 'Timeout (seconds)', type: 'number', default: DEFAULT_TIMEOUT_SECONDS },
            { name: 'sshHost', label: 'SSH host', required: true, enabledWhen: ON_SSH },
            { name: 'sshPort', label: 'SSH port', type: 'number', default: 22, enabledWhen: ON_SSH },
            { name: 'sshUser', label: 'SSH user', required: true, enabledWhen: ON_SSH },
            { name: 'sshPassword', label: 'SSH password', type: 'password', enabledWhen: ON_SSH },
            { name: 'sshPrivateKey', label: 'SSH private key', type: 'textarea', secret: true, enabledWhen: ON_SSH },
            { name: 'sshPassphrase', label: 'Private key passphrase', type: 'password', enabledWhen: ON_SSH },
            { name: 'sshFingerprint', label: 'Host key fingerprint (SHA256:…, empty = any)', enabledWhen: ON_SSH },
        ]
    }

    getNodeMeta(): IExtensionNodeMeta {
        return { label: 'Script', icon: 'Terminal', description: 'Runs a script with the message on stdin and/or in KWIRTH_* variables' }
    }

    async startSender(_senders: ISenderAccess): Promise<void> {}

    /** Stopping kills what is still running in the background: nothing is left orphaned in the pod. */
    async stopSender(): Promise<void> {
        for (const runs of this.background.values()) {
            for (const run of runs) run.kill()
        }
        this.background.clear()
        this.configs.clear()
    }

    /** A single message: one run, with the message as an object. */
    async send(configName: string, message: ISenderMessage): Promise<IScriptRunResult | IScriptStartResult> {
        return this.run(configName, [message], false)
    }

    /** A batch: ONE run, with the messages as an array (D5). */
    async sendBatch(configName: string, messages: ISenderMessage[]): Promise<IScriptRunResult | IScriptStartResult | void> {
        if (messages.length === 0) return
        return this.run(configName, messages, true)
    }

    private async run(configName: string, messages: ISenderMessage[], batch: boolean): Promise<IScriptRunResult | IScriptStartResult> {
        const config = this.resolve(configName)
        const fail = (err: unknown): Error => {
            const msg = err instanceof Error ? err.message : String(err)
            this.logger.error(`config '${configName}': ${msg}`)
            return new Error(`ScriptSender: config '${configName}': ${msg}`)
        }

        const runs = this.background.get(configName) ?? new Set<IBackgroundRun>()
        if (!config.wait && runs.size >= MAX_BACKGROUND_RUNS) {
            throw fail(new Error(`${runs.size} runs of this script are still going in the background (the limit is ${MAX_BACKGROUND_RUNS}): this message was not delivered`))
        }

        let run: IBackgroundRun
        let start: IScriptStartResult
        try {
            if (config.target === EScriptTarget.SSH) {
                const remote = await startRemote(config, messages, batch, m => {
                    const line = `config '${configName}': ${m}`
                    if (this.warned.has(line)) return
                    this.warned.add(line)
                    this.logger.warning(line)
                })
                run = remote
                start = { started: true, host: remote.host }
            }
            else {
                const local = await startLocal(config, messages, batch)
                run = local
                start = { started: true, pid: local.pid }
            }
        }
        catch (err) {
            /*
                What is known at start fails the delivery, waiting or not: a missing interpreter locally;
                over SSH, a machine that is not there, rejects the credentials or shows another host key.
            */
            throw fail(err)
        }

        if (config.wait) {
            try {
                return await run.done
            }
            catch (err) {
                throw fail(err)
            }
        }

        /*
            Not waiting: the delivery is over now. The end of the run only reaches the log, because there
            is nobody left to tell — and that is exactly what this option means.
        */
        runs.add(run)
        this.background.set(configName, runs)
        run.done
            .then(() => this.logger.trace(`config '${configName}': background run ${run.label} finished`))
            .catch(err => this.logger.error(`config '${configName}': background run ${run.label}: ${err instanceof Error ? err.message : String(err)}`))
            .finally(() => runs.delete(run))
        return start
    }

    /*
        The stored configuration as the runner needs it. What comes from the store went through a form:
        a select can come empty, a number as a string, a boolean missing. The schema's defaults are
        applied here so that what the dialog shows is what runs.
    */
    private resolve(configName: string): IScriptSenderConfig {
        const stored = this.configs.get(configName)
        if (!stored) throw new Error(`ScriptSender: config '${configName}' not found`)

        const interpreter = (stored.interpreter || EScriptInterpreter.SH) as EScriptInterpreter
        if (!INTERPRETERS.includes(interpreter)) throw new Error(`ScriptSender: config '${configName}': unknown interpreter '${stored.interpreter}'`)
        const stdin = (stored.stdin || EScriptStdin.TEXT) as EScriptStdin
        if (!STDIN_MODES.includes(stdin)) throw new Error(`ScriptSender: config '${configName}': unknown standard input mode '${stored.stdin}'`)
        if (typeof stored.script !== 'string' || stored.script.trim() === '') throw new Error(`ScriptSender: config '${configName}' has no script`)

        const target = (stored.target || EScriptTarget.LOCAL) as EScriptTarget
        if (!TARGETS.includes(target)) throw new Error(`ScriptSender: config '${configName}': unknown target '${stored.target}'`)

        const timeout = Number(stored.timeoutSeconds)
        const port = Number(stored.sshPort)
        return {
            name: stored.name,
            target,
            sshHost: stored.sshHost,
            sshPort: Number.isInteger(port) && port > 0 ? port : undefined,
            sshUser: stored.sshUser,
            sshPassword: stored.sshPassword,
            sshPrivateKey: stored.sshPrivateKey,
            sshPassphrase: stored.sshPassphrase,
            sshFingerprint: stored.sshFingerprint,
            interpreter,
            script: stored.script,
            stdin,
            env: stored.env === undefined ? true : stored.env === true || String(stored.env) === 'true',
            wait: stored.wait === undefined ? true : stored.wait === true || String(stored.wait) === 'true',
            timeoutSeconds: Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_TIMEOUT_SECONDS
        }
    }
}
