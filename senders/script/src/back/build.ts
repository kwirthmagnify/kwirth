import { ISenderMessage } from '@kwirthmagnify/kwirth-common-back'
import { EScriptInterpreter, EScriptStdin } from './types'

/*
    Everything about a run that can be decided WITHOUT running anything: the command line of each
    interpreter, the file the script is written to, what goes on stdin and into the environment.

    It lives apart from the process on purpose — this is the part that has to be right on both Linux and
    Windows, and it can be tested on either without the other's interpreters installed.
*/

/** The extension the script's temporary file needs: PowerShell refuses -File without .ps1, cmd runs only .cmd/.bat. */
export const scriptExtension = (interpreter: EScriptInterpreter): string => {
    switch (interpreter) {
        case EScriptInterpreter.PWSH:
        case EScriptInterpreter.POWERSHELL:
            return '.ps1'
        case EScriptInterpreter.CMD:
            return '.cmd'
        case EScriptInterpreter.SH:
        case EScriptInterpreter.BASH:
            return '.sh'
    }
}

/*
    The script's text as the interpreter needs it on disk. A browser textarea gives LF line ends: sh and
    bash choke on a stray CR ('\r: command not found'), and cmd misreads labels and GOTOs without CRLF. So
    every line end is normalised to what the interpreter expects. PowerShell takes either.
*/
export const scriptContent = (interpreter: EScriptInterpreter, script: string): string => {
    const lf = script.replace(/\r\n?/g, '\n')
    return interpreter === EScriptInterpreter.CMD ? lf.replace(/\n/g, '\r\n') : lf
}

export interface ICommandLine {
    command: string
    args: string[]
}

/** How to launch the script file with each interpreter, non-interactively and without user profiles. */
export const commandLine = (interpreter: EScriptInterpreter, file: string): ICommandLine => {
    switch (interpreter) {
        case EScriptInterpreter.SH:
            return { command: 'sh', args: [file] }
        case EScriptInterpreter.BASH:
            return { command: 'bash', args: [file] }
        case EScriptInterpreter.PWSH:
            return { command: 'pwsh', args: ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', file] }
        case EScriptInterpreter.POWERSHELL:
            return { command: 'powershell.exe', args: ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', file] }
        case EScriptInterpreter.CMD:
            return { command: 'cmd.exe', args: ['/d', '/c', file] }
    }
}

/*
    What goes on stdin. A single send() hands over ONE message; sendBatch() hands over the batch — an
    array in JSON even when it holds one, so a script written for batches never gets an object by surprise.
*/
export const stdinPayload = (mode: EScriptStdin, messages: ISenderMessage[], batch: boolean): string => {
    switch (mode) {
        case EScriptStdin.NONE:
            return ''
        case EScriptStdin.TEXT:
            return messages.map(m => m.body ?? '').join('\n')
        case EScriptStdin.JSON:
            return JSON.stringify(batch ? messages : messages[0])
    }
}

/*
    The KWIRTH_* variables. For a batch only the two that make sense for many messages are set —
    KWIRTH_BODY (the bodies, one per line) and KWIRTH_MESSAGE (the array) —: a subject or a level of
    "the batch" does not exist, and taking the first message's would lie about the rest.
*/
export const kwirthEnv = (messages: ISenderMessage[], batch: boolean): Record<string, string> => {
    if (batch) {
        return {
            KWIRTH_BODY: messages.map(m => m.body ?? '').join('\n'),
            KWIRTH_MESSAGE: JSON.stringify(messages)
        }
    }
    const m = messages[0]
    const to = m.to === undefined ? '' : Array.isArray(m.to) ? m.to.join(',') : m.to
    return {
        KWIRTH_BODY: m.body ?? '',
        KWIRTH_SUBJECT: m.subject ?? '',
        KWIRTH_LEVEL: m.level ?? '',
        KWIRTH_TO: to,
        KWIRTH_MESSAGE: JSON.stringify(m)
    }
}

/*
    🔴 The ONLY variables of the back end's environment the script inherits.

    The back end's environment carries credentials — database passwords, tokens, the master key — and a
    script written in a form must not be able to read them with `env`. What passes is what an interpreter
    needs to start and find its programs, nothing else.
*/
export const INHERITED_LINUX = ['PATH', 'HOME', 'LANG', 'LC_ALL', 'TZ', 'TMPDIR']
export const INHERITED_WINDOWS = [
    'PATH', 'PATHEXT', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'TEMP', 'TMP', 'USERPROFILE',
    'APPDATA', 'LOCALAPPDATA', 'PROGRAMDATA', 'PROGRAMFILES', 'OS', 'PROCESSOR_ARCHITECTURE', 'NUMBER_OF_PROCESSORS'
]

/** The child's environment: the inherited whitelist of this platform, plus whatever is added. */
export const cleanEnv = (platform: NodeJS.Platform, source: NodeJS.ProcessEnv, extra: Record<string, string> = {}): Record<string, string> => {
    const names = platform === 'win32' ? INHERITED_WINDOWS : INHERITED_LINUX
    const env: Record<string, string> = {}
    /*
        On Windows the names are case-insensitive ('Path', 'SystemRoot'), and a plain object copied from
        process.env keeps whatever case it had: the lookup has to ignore it.
    */
    const lookup = new Map(Object.keys(source).map(k => [k.toUpperCase(), k]))
    for (const name of names) {
        const real = lookup.get(name)
        const value = real === undefined ? undefined : source[real]
        if (value !== undefined) env[real ?? name] = value
    }
    return { ...env, ...extra }
}

/** Keeps the END of a growing output within a limit: an error is at the end, not at the start. */
export class OutputTail {
    private text = ''
    private cut = false

    constructor(private readonly limit: number) {}

    push(chunk: string): void {
        this.text += chunk
        if (this.text.length > this.limit) {
            this.text = this.text.slice(this.text.length - this.limit)
            this.cut = true
        }
    }

    get value(): string { return this.text }
    get truncated(): boolean { return this.cut }
}
