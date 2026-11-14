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

// ── remote runs (target = ssh) ──────────────────────────────────────────────────────────────────────

/*
    Over SSH the KWIRTH_* variables are not passed by the connection: sshd only accepts the variables its
    AcceptEnv allows, and on a command line each remote shell quotes differently. They are written at the
    top of the uploaded script instead, in the interpreter's own language — the one quoting that is known.

      · sh/bash    export NAME='value'      — a ' inside becomes '\''; anything else, line breaks
                                              included, is literal inside single quotes.
      · PowerShell $env:NAME = 'value'      — a ' inside becomes ''; the rest is literal.
      · cmd        @set "NAME=value"        — 🔴 cmd cannot hold a line break in a variable, and a " ends
                                              the quoted set: line breaks become spaces and " becomes '.
                                              % is doubled (a batch file expands it). With cmd the message
                                              is read from stdin; the guide says so.
*/
export const envPrelude = (interpreter: EScriptInterpreter, vars: Record<string, string>): string => {
    const names = Object.keys(vars)
    switch (interpreter) {
        case EScriptInterpreter.SH:
        case EScriptInterpreter.BASH:
            return names.map(n => `export ${n}='${vars[n].replace(/'/g, `'\\''`)}'\n`).join('')
        case EScriptInterpreter.PWSH:
        case EScriptInterpreter.POWERSHELL:
            return names.map(n => `$env:${n} = '${vars[n].replace(/'/g, `''`)}'\n`).join('')
        case EScriptInterpreter.CMD:
            return names.map(n => `@set "${n}=${vars[n].replace(/\r\n|\r|\n/g, ' ').replace(/"/g, `'`).replace(/%/g, '%%')}"\n`).join('')
    }
}

/*
    The text of the file uploaded to the remote machine: the variables first (after a #! line, which must
    stay the first one), then the script, with the line ends the interpreter wants.

    PowerShell files get a UTF-8 BOM: Windows PowerShell 5.1 reads a .ps1 without one in the ANSI code page,
    and an accent in the message — or in the script — arrives garbled. PowerShell 7 reads either.
*/
export const remoteScriptContent = (interpreter: EScriptInterpreter, script: string, vars: Record<string, string>): string => {
    const prelude = envPrelude(interpreter, vars)
    const lf = script.replace(/\r\n?/g, '\n')
    let text = prelude + lf
    if (lf.startsWith('#!')) {
        const end = lf.indexOf('\n')
        text = end < 0 ? `${lf}\n${prelude}` : lf.slice(0, end + 1) + prelude + lf.slice(end + 1)
    }
    const content = scriptContent(interpreter, text)
    return interpreter === EScriptInterpreter.PWSH || interpreter === EScriptInterpreter.POWERSHELL ? '\uFEFF' + content : content
}

/** '/C:/Users/k/x.cmd', as SFTP names it on Windows OpenSSH, to 'C:\Users\k\x.cmd'. Anything else, unchanged. */
export const windowsPath = (sftpPath: string): string =>
    /^\/[A-Za-z]:/.test(sftpPath) ? sftpPath.slice(1).replace(/\//g, '\\') : sftpPath

/*
    The command sent over SSH to run the uploaded file. It is read by the remote user's shell: a POSIX
    shell on Linux, and on Windows OpenSSH's default shell, cmd — so the Windows lines are written for cmd
    (double quotes). The home directory never holds a double quote on either.
*/
export const remoteCommand = (interpreter: EScriptInterpreter, sftpPath: string): string => {
    const posix = `'${sftpPath.replace(/'/g, `'\\''`)}'`
    const win = `"${windowsPath(sftpPath)}"`
    switch (interpreter) {
        case EScriptInterpreter.SH:
            return `sh ${posix}`
        case EScriptInterpreter.BASH:
            return `bash ${posix}`
        case EScriptInterpreter.PWSH:
            return `pwsh -NoProfile -NonInteractive -ExecutionPolicy Bypass -File ${win}`
        case EScriptInterpreter.POWERSHELL:
            return `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File ${win}`
        case EScriptInterpreter.CMD:
            return `cmd /d /c ${win}`
    }
}
