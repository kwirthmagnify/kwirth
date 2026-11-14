import { ISenderConfig, ISenderResult } from '@kwirthmagnify/kwirth-common-back'

/** The interpreter a configuration's script is run with. The value is what the config stores. */
export enum EScriptInterpreter {
    SH = 'sh',
    BASH = 'bash',
    PWSH = 'pwsh',
    POWERSHELL = 'powershell',
    CMD = 'cmd'
}

/** What the script receives on its standard input. */
export enum EScriptStdin {
    /** nothing: stdin is closed at once, so a script that reads it does not hang */
    NONE = 'none',
    /** the message body as plain text (in a batch, the bodies one per line) */
    TEXT = 'text',
    /** the whole ISenderMessage as JSON (in a batch, an array of them) */
    JSON = 'json'
}

/** Where the script runs. */
export enum EScriptTarget {
    /** in the Kwirth back end itself */
    LOCAL = 'local',
    /** on another machine, Linux or Windows, through the DCE 'ssh' */
    SSH = 'ssh'
}

export interface IScriptSenderConfig extends ISenderConfig {
    name: string
    target: EScriptTarget
    interpreter: EScriptInterpreter
    script: string
    stdin: EScriptStdin
    /** adds the KWIRTH_* environment variables */
    env: boolean
    /*
        Whether the delivery waits for the script to finish (default true). Without waiting, the delivery
        returns as soon as the process has STARTED: what happens afterwards — its exit code, a timeout —
        only reaches the sender's log, never whoever sent.
    */
    wait: boolean
    /** the process is killed when it runs longer; default 30 */
    timeoutSeconds?: number
    /** target = ssh: the machine, its port (22) and the user to log in as */
    sshHost?: string
    sshPort?: number
    sshUser?: string
    /** target = ssh: a password, or a private key (with its passphrase if it has one) */
    sshPassword?: string
    sshPrivateKey?: string
    sshPassphrase?: string
    /** target = ssh: the host key the machine must present ('SHA256:…'); empty = any, and it is reported */
    sshFingerprint?: string
}

/** What send() and sendBatch() return. */
export interface IScriptRunResult extends ISenderResult {
    exitCode: number
    /** the LAST few KB of what the script wrote: the end of an output is where an error is */
    stdout: string
    stderr: string
    /** true when stdout or stderr were longer and only their end is kept */
    truncated: boolean
    /** SSH only: the host key the machine presented ('SHA256:…'), so that it can be pinned */
    hostFingerprint?: string
}

/** What send() and sendBatch() return when the configuration does NOT wait for the script. */
export interface IScriptStartResult extends ISenderResult {
    started: true
    /** local only: there is no remote pid over SSH */
    pid?: number
    /** SSH only: the machine it was started on */
    host?: string
}
