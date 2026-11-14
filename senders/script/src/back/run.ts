import { IScriptRunResult } from './types'

/*
    A started run, local or remote: what the sender needs to wait for it, or — not waiting — to count it
    against MAX_BACKGROUND_RUNS and to kill it when it stops.
*/
export interface IBackgroundRun {
    /** How the log names it: the pid of a local run, 'ssh <host>' of a remote one. */
    label: string
    /** Settles when the run ends. It only exists once the run has started, so it never rejects unobserved. */
    done: Promise<IScriptRunResult>
    kill: () => void
}

/** The last lines of stderr, for an error message that says what the script said. */
export const tailOf = (stderr: string): string => {
    const t = stderr.trim()
    return t === '' ? '' : `: ${t.length > 500 ? '…' + t.slice(t.length - 500) : t}`
}
