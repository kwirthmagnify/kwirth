import { accessKeyDeserialize, parseResources } from '@kwirthmagnify/kwirth-common'
import { IStatusCoreLog, IStatusPreviousLog } from '../common/StatusTypes'

/*
    The Log and Previous log tabs: the core's own log, which used to be read from the About dialog.

    Kept apart from the components so the parts that can go wrong quietly — the colour parsing, who may
    read it, what a failure looks like — can be tested.
*/

/** A piece of a log line with the colour it is painted in (undefined = the box's default). */
export interface ILogSegment {
    text: string
    colour?: string
}

/*
    The core writes its log WITH colour (see the back's Logging.ts), and it is rendered instead of stripped:
    the colour is what tells a level from a component at a glance.

    Only SGR is understood —'\x1b[...m'— which is all the core emits; any other escape is dropped rather
    than guessed at. The palette is the BRIGHT one, over the dark box the tab paints, so a line reads the
    same in either theme.
*/
export const ANSI_COLOUR: Record<string, string> = {
    '31': '#f28b82',   // error
    '32': '#81c995',   // trace
    '33': '#fdd663',   // warning
    '35': '#d7aefb',   // component
    '36': '#78d9ec',   // info
    '90': '#9aa0a6'    // timestamp
}

export const ansiSegments = (line: string): ILogSegment[] => {
    const out: ILogSegment[] = []
    let colour: string | undefined = undefined
    let from = 0
    const escapes = /\x1b\[([0-9;]*)([a-zA-Z])/g
    let escape: RegExpExecArray | null
    while ((escape = escapes.exec(line)) !== null) {
        if (escape.index > from) out.push({ text: line.substring(from, escape.index), ...(colour ? { colour } : {}) })
        // Several codes travel in one escape ('0;31'); the last colour seen is the one that paints.
        if (escape[2] === 'm') {
            for (const code of escape[1].split(';')) {
                if (code === '' || code === '0') colour = undefined
                else if (ANSI_COLOUR[code]) colour = ANSI_COLOUR[code]
            }
        }
        from = escapes.lastIndex
    }
    if (from < line.length) out.push({ text: line.substring(from), ...(colour ? { colour } : {}) })
    return out
}

/*
    The core's log carries internal traces, so it is only for administrators: without the 'admin' scope it
    is not asked for, and the back end does not serve it either. Read from the channel's own access key.
*/
export const isAdmin = (accessString: string | undefined): boolean => {
    if (!accessString) return false
    try {
        return parseResources(accessKeyDeserialize(accessString).resources).some(r => r.scopes.split(',').includes('admin'))
    }
    catch {
        return false
    }
}

const authorized = (accessString: string): RequestInit => ({
    headers: { Authorization: `Bearer ${accessString}`, 'X-Kwirth-App': 'true' }
})

/** How many lines of the current log are read: the same as the About dialog read. */
export const CORE_LOG_LINES = 1000

/*
    The current container's log. A failure comes back as the reason to show, never as a thrown error:
    the tab is open by then, and leaving it empty with the cause only in the console is the way to make
    somebody think Kwirth has no log.
*/
export const readCoreLog = async (clusterUrl: string, accessString: string): Promise<IStatusCoreLog> => {
    try {
        const response = await fetch(`${clusterUrl}/managekwirth/log?lines=${CORE_LOG_LINES}`, authorized(accessString))
        if (response.ok) return await response.json() as IStatusCoreLog
        return { lines: [], unavailableReason: `The core answered HTTP ${response.status}` }
    }
    catch (err) {
        return { lines: [], unavailableReason: err instanceof Error ? err.message : String(err) }
    }
}

/** The result of asking for the previous container's log: the answer, or why there is none. */
export interface IPreviousLogRead {
    log?: IStatusPreviousLog
    error?: string
}

/** What the Home's Previous log box says. */
export interface IPreviousLogSummary {
    headline: string
    detail: string
    /** The previous container ended abnormally: the one case that deserves opening the tab. */
    abnormal: boolean
}

/*
    Whether Kwirth restarted is worth a glance from Home, and above all whether it ended ABNORMALLY. An
    unknown is said as unknown — '—' — never as "no restarts": that would be a claim.
*/
export const previousSummary = (admin: boolean, read: IPreviousLogRead | undefined): IPreviousLogSummary => {
    if (!admin) return { headline: '—', detail: 'only administrators can read the log of the core', abnormal: false }
    if (!read) return { headline: '—', detail: 'checking whether this container has restarted…', abnormal: false }
    if (read.error || !read.log) return { headline: '—', detail: `the core could not be asked: ${read.error ?? 'no answer'}`, abnormal: false }
    const log = read.log
    if (!log.restarted) return { headline: 'No restarts', detail: 'this container has not restarted', abnormal: false }
    return {
        headline: `${log.restartCount} restart${log.restartCount === 1 ? '' : 's'}`,
        detail: log.abnormal
            ? `the last one ended abnormally (exit code ${log.termination?.exitCode ?? 'unknown'})`
            : 'the last one ended cleanly',
        abnormal: log.abnormal
    }
}

/*
    The previous container's log. A failure is kept APART from the answer: turning it into
    'restarted: false' would claim there was no restart, which is not what anybody knows.
*/
export const readPreviousLog = async (clusterUrl: string, accessString: string): Promise<IPreviousLogRead> => {
    try {
        const response = await fetch(`${clusterUrl}/managekwirth/previouslog`, authorized(accessString))
        if (response.ok) return { log: await response.json() as IStatusPreviousLog }
        return { error: `The core answered HTTP ${response.status}` }
    }
    catch (err) {
        return { error: err instanceof Error ? err.message : String(err) }
    }
}
