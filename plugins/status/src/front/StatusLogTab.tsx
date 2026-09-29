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

const NotAdmin: React.FC = () => (
    <Typography variant='body2' color='text.secondary' sx={{ p: 4, textAlign: 'center' }}>
        Only administrators can read the log of the core: it carries internal traces. Your access key has no 'admin' scope.
    </Typography>
)

interface ICoreLogTabProps {
    admin: boolean
    log: IStatusCoreLog | undefined
}

export const StatusCoreLogTab: React.FC<ICoreLogTabProps> = ({ admin, log }) => {
    if (!admin) return <NotAdmin />
    return (
        <Stack spacing={1} sx={{ height: '100%', minHeight: 0 }}>
            {!log && <Typography variant='body2' color='text.secondary'>Reading the log…</Typography>}
            {log?.unavailableReason && <Typography variant='body2' color='warning.main'>{log.unavailableReason}</Typography>}
            {log && !log.unavailableReason &&
                <Typography variant='caption' color='text.secondary'>
                    Last {log.lines.length} lines of the container running now (at most {CORE_LOG_LINES}). It is read again with every snapshot.
                </Typography>}
            {log && log.lines.length > 0 && <LogBox lines={log.lines} />}
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
    if (!admin) return <NotAdmin />
    if (!read) return <Typography variant='body2' color='text.secondary'>Checking whether this container has restarted…</Typography>
    if (read.error) return <Typography variant='body2' color='warning.main'>The core could not be asked: {read.error}</Typography>
    const log = read.log!
    if (!log.restarted) {
        return (
            <Typography variant='body2' color='text.secondary' sx={{ p: 4, textAlign: 'center' }}>
                This container has not restarted, so there is no previous log. After a rollout the pod is a new one and the kubelet keeps nothing from the old one.
            </Typography>
        )
    }
    const t = log.termination
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
            {log.unavailableReason &&
                <Typography variant='body2' color='warning.main'>The container restarted, but its log is no longer available: {log.unavailableReason}</Typography>}
            {!log.unavailableReason && log.lines.length === 0 &&
                <Typography variant='body2' color='text.secondary'>The previous container left no log lines.</Typography>}
            {log.lines.length > 0 && <LogBox lines={log.lines} />}
        </Stack>
    )
}
