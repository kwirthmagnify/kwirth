import React from 'react'
import { Box, Stack, Typography } from '@mui/material'
import { IStatusCoreLog } from '../common/StatusTypes'
import { CORE_LOG_LINES, IPreviousLogRead, ansiSegments } from './StatusLog'

/*
    The Log and Previous log tabs: the core's own log, as it used to be read from the About dialog.

    The box is DARK whatever the theme is, and that is not a style slip: the colours it paints are the ones
    the core emitted for a terminal, and on a light background half of them are unreadable. A log viewer
    looking like a terminal is also what whoever opens it expects.
*/

interface ILogBoxProps {
    lines: string[]
}

// Both logs are painted: the previous container's was written by the same core, with the same colours.
const LogBox: React.FC<ILogBoxProps> = ({ lines }) => (
    <Box aria-label='Log lines' sx={{ flexGrow: 1, minHeight: 0, overflow: 'auto', backgroundColor: '#1e1e1e', borderRadius: 1, p: 1 }}>
        <pre style={{ margin: 0, fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: '#dddddd' }}>
            {lines.map((line, index) =>
                <div key={index}>
                    {ansiSegments(line).map((s, i) => <span key={i} style={s.colour ? { color: s.colour } : undefined}>{s.text}</span>)}
                </div>)}
        </pre>
    </Box>
)

interface ILogMessageProps {
    title: string
    detail: string
    /** A reason something is wrong or missing, painted as a warning; otherwise it is plain information. */
    warning?: boolean
}

/*
    Every state without lines, in BOTH tabs, is said the same way: centred across and down the tab. Two
    tabs that tell "there is nothing here" differently read as two different kinds of problem.
*/
const LogMessage: React.FC<ILogMessageProps> = ({ title, detail, warning }) => (
    <Stack aria-label='Log message' alignItems='center' justifyContent='center' spacing={1} sx={{ flex: 1, height: '100%', px: 4, textAlign: 'center' }}>
        <Typography variant='subtitle1' color={warning ? 'warning.main' : 'text.secondary'}>{title}</Typography>
        <Typography variant='body2' color='text.secondary'>{detail}</Typography>
    </Stack>
)

const NOT_ADMIN: ILogMessageProps = {
    title: 'Only administrators can read the log of the core',
    detail: "It carries internal traces. Your access key has no 'admin' scope."
}

interface ICoreLogTabProps {
    admin: boolean
    log: IStatusCoreLog | undefined
}

export const StatusCoreLogTab: React.FC<ICoreLogTabProps> = ({ admin, log }) => {
    if (!admin) return <LogMessage {...NOT_ADMIN} />
    if (!log) return <LogMessage title='Reading the log…' detail='The last lines of the container running now.' />
    if (log.unavailableReason) return <LogMessage title='There is no log to show' detail={log.unavailableReason} warning />
    if (log.lines.length === 0) return <LogMessage title='The log is empty' detail='The container running now has not written any line yet.' />
    return (
        <Stack spacing={1} sx={{ height: '100%', minHeight: 0 }}>
            <Typography variant='caption' color='text.secondary'>
                Last {log.lines.length} lines of the container running now (at most {CORE_LOG_LINES}). It is read again with every snapshot.
            </Typography>
            <LogBox lines={log.lines} />
        </Stack>
    )
}

interface IPreviousLogTabProps {
    admin: boolean
    read: IPreviousLogRead | undefined
}

/*
    "There was no restart" and "there was a restart but the log is gone" are different things, and the
    second is the one that puzzles whoever goes to look: said in words, or it looks as if Kwirth ate it.
*/
export const StatusPreviousLogTab: React.FC<IPreviousLogTabProps> = ({ admin, read }) => {
    if (!admin) return <LogMessage {...NOT_ADMIN} />
    if (!read) return <LogMessage title='Checking whether this container has restarted…' detail='The core keeps the previous log in memory since it started.' />
    if (read.error || !read.log) return <LogMessage title='The core could not be asked' detail={read.error ?? 'No answer.'} warning />
    const log = read.log
    if (!log.restarted) {
        return <LogMessage title='No previous log'
            detail='This container has not restarted. After a rollout the pod is a new one and the kubelet keeps nothing from the old one.' />
    }
    const t = log.termination
    const how = `Restarts: ${log.restartCount} · exit code ${t?.exitCode ?? 'unknown'}${t?.reason ? ` (${t.reason})` : ''} · ${log.abnormal ? 'it ended abnormally' : 'it ended cleanly'}`
    // Restarted, but nothing to show: still said centred, with how it ended, like any other empty state.
    if (log.unavailableReason) return <LogMessage title='The container restarted, but its log is no longer available' detail={`${how}. ${log.unavailableReason}`} warning />
    if (log.lines.length === 0) return <LogMessage title='The previous container left no log lines' detail={how} warning={log.abnormal} />
    return (
        <Stack spacing={1} sx={{ height: '100%', minHeight: 0 }}>
            <Typography variant='body2'>
                {log.container && <>Container <b>{log.container}</b> · </>}
                Restarts: <b>{log.restartCount}</b> · Exit code: <b>{t?.exitCode ?? 'unknown'}</b>
                {t?.reason && <> ({t.reason})</>}
                {' · '}
                <Box component='span' sx={{ color: log.abnormal ? 'warning.main' : 'success.main' }}>
                    {log.abnormal ? 'it ended abnormally' : 'it ended cleanly'}
                </Box>
            </Typography>
            {t?.finishedAt &&
                <Typography variant='caption' color='text.secondary'>
                    Ended at {t.finishedAt}{t.startedAt && <>, started at {t.startedAt}</>}
                </Typography>}
            <LogBox lines={log.lines} />
        </Stack>
    )
}
