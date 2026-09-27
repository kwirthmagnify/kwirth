import React, { useContext, useRef, useState } from 'react'
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Stack, Tooltip, Typography} from '@mui/material'
import { parseResources } from '@kwirthmagnify/kwirth-common'
import { VERSION } from '../../version'
import { useAsync } from 'react-use'
import { useKeyboard } from '../../tools/useKeyboard'
import { addGetAuthorization } from '../../tools/AuthorizationManagement'
import { SessionContext, SessionContextType } from '../../model/SessionContext'

/*
    What the core returns at /managekwirth/previouslog. It is declared here, like the rest of the core's
    responses the front end consumes, rather than sharing the type through 'kwirth-common': neither back
    nor front have paths to the package's source, so sharing it would mean publishing it for every field.
*/
interface IPreviousContainerLog {
    restarted: boolean
    abnormal: boolean
    restartCount: number
    container?: string
    termination?: {
        exitCode?: number
        reason?: string
        signal?: number
        message?: string
        startedAt?: string
        finishedAt?: string
    }
    lines: string[]
    unavailableReason?: string
}

/** What the core returns at /managekwirth/log: the current container's log, or why there is none. */
interface ICoreLog {
    lines: string[]
    unavailableReason?: string
}

/*
    The core writes its log WITH colour (see the back's Logging.ts), and here it is rendered instead of
    stripped: the colour is what tells a level from a component at a glance, which is the whole point of
    looking at a log rather than grepping it.

    Only SGR is understood —'\x1b[...m'— which is all the core emits; any other escape is dropped rather
    than guessed at. The palette is the BRIGHT one, over the dark box the dialog paints: that way a line
    reads the same in either theme instead of depending on the one in use.
*/
const ANSI_COLOUR: Record<string, string> = {
    '31': '#f28b82',   // error
    '32': '#81c995',   // trace
    '33': '#fdd663',   // warning
    '35': '#d7aefb',   // component
    '36': '#78d9ec',   // info
    '90': '#9aa0a6'    // timestamp
}

const ansiToSpans = (line: string): React.ReactNode[] => {
    const out: React.ReactNode[] = []
    let colour: string|undefined = undefined
    let from = 0
    const escapes = /\x1b\[([0-9;]*)([a-zA-Z])/g
    let escape: RegExpExecArray|null
    while ((escape = escapes.exec(line)) !== null) {
        if (escape.index > from) out.push(<span key={out.length} style={{ color: colour }}>{line.substring(from, escape.index)}</span>)
        // Several codes travel in one escape ('0;31'), and the last colour seen is the one that paints.
        if (escape[2] === 'm') {
            for (const code of escape[1].split(';')) {
                if (code === '' || code === '0') colour = undefined
                else if (ANSI_COLOUR[code]) colour = ANSI_COLOUR[code]
            }
        }
        from = escapes.lastIndex
    }
    if (from < line.length) out.push(<span key={out.length} style={{ color: colour }}>{line.substring(from)}</span>)
    return out
}

interface IAboutProps {
    onClose: () => void
}

const About: React.FC<IAboutProps> = (props:IAboutProps) => {
    const preRef = useRef<HTMLPreElement | null>(null)
    const [previousLog, setPreviousLog] = useState<IPreviousContainerLog|undefined>(undefined)
    const [showPreviousLog, setShowPreviousLog] = useState(false)
    const [coreLog, setCoreLog] = useState<ICoreLog|undefined>(undefined)
    const [showCoreLog, setShowCoreLog] = useState(false)
    // The session already travels through context (and the About is opened from two places): asking for
    // it through props would require both callers to have it at hand, and the channel preferences one
    // does not.
    const session = useContext(SessionContext) as SessionContextType
    // the core's log carries internal traces: without the 'admin' scope it is not asked for, and the back end does not serve it either
    const isAdmin = session?.user ? parseResources(session.user.accessKey.resources).some(r => r.scopes.split(',').includes('admin')) : false
    useKeyboard(props.onClose)

    /*
        It is requested when the About opens, not when the button is pressed: that way the button can say
        up front whether there is anything to see. The core has held it in memory since its startup, so
        the call is cheap.
    */
    useAsync (async () => {
        if (!isAdmin) return
        try {
            const response = await fetch(`${session.backendUrl}/managekwirth/previouslog`, addGetAuthorization(session.accessString))
            if (response.ok) setPreviousLog(await response.json() as IPreviousContainerLog)
        }
        catch (err) {
            console.log(err)
        }
    }, [isAdmin])

    useAsync (async () => {
        let f=0
        let intId = setInterval( () => {
            f++
            if (preRef.current) {
                if (f===brand.length) {
                    clearInterval(intId)
                    return
                }
                for (let c=0; c<brand[0].length;c++) {
                    preRef.current.innerText+= brand[f][c]
                }
                preRef.current.innerText+='\r'
            }

        }, 1, f)
    }, [preRef])

    /*
        The button stays visible even when it cannot be used, and the tooltip says WHY. "There was no
        restart" and "there was a restart but the log is gone" are different things, and the second is the
        one that puzzles whoever goes to look: without saying so, it looks as if Kwirth had eaten it.
    */
    const previousLogHint = (): string => {
        if (!isAdmin) return 'Only administrators can read the log of the core'
        if (!previousLog) return 'Checking whether this container has restarted...'
        if (!previousLog.restarted) return 'This container has not restarted, so there is no previous log. After a rollout the pod is a new one and the kubelet keeps nothing from the old one'
        if (previousLog.abnormal) return `The previous container ended abnormally (exit code ${previousLog.termination?.exitCode})`
        return 'The previous container ended cleanly'
    }

    /*
        Asked for on demand, unlike the previous container's log: that one the core has held in memory
        since it started, while this one is a live read of up to a thousand lines. Nobody opening the
        About to look at the version should pay for it.

        Failures come back as a reason to show rather than as a thrown error: the dialog is already open
        by then, and leaving it empty with the cause only in the browser's console is the way to make
        somebody think Kwirth has no log.
    */
    const loadCoreLog = async () => {
        setCoreLog(undefined)
        try {
            const response = await fetch(`${session.backendUrl}/managekwirth/log?lines=1000`, addGetAuthorization(session.accessString))
            if (response.ok) setCoreLog(await response.json() as ICoreLog)
            else setCoreLog({ lines: [], unavailableReason: `The core answered HTTP ${response.status}` })
        }
        catch (err) {
            setCoreLog({ lines: [], unavailableReason: err instanceof Error ? err.message : String(err) })
        }
    }

    return (<>
        <Dialog open={true} disableRestoreFocus={true} fullWidth maxWidth={'md'}>
            <DialogTitle>About Kwirth...</DialogTitle>
            <DialogContent>
                <Stack direction={'row'} alignItems={'center'} justifyContent={'space-between'}>
                    <Stack spacing={2} sx={{ minWidth: 220, p: 2, borderRadius: 2, backgroundColor: 'rgba(245,130,10,0.07)', border: '1px solid rgba(245,130,10,0.2)' }}>
                        <Box>
                            <Typography variant='h5' fontWeight='bold' sx={{ color: '#f5820a' }}>Kwirth</Typography>
                            <Typography variant='body2' color='text.secondary'>Kubernetes observability platform</Typography>
                        </Box>
                        <Divider/>
                        <Stack spacing={1.5}>
                            <Box>
                                <Typography variant='caption' color='text.secondary' display='block'>VERSION</Typography>
                                <Typography variant='body2'>{VERSION}</Typography>
                            </Box>
                            <Box>
                                <Typography variant='caption' color='text.secondary' display='block'>HOMEPAGE</Typography>
                                <Typography variant='body2'><a href='https://kwirthmagnify.dev' target='_blank' rel='noreferrer'>kwirthmagnify.dev</a></Typography>
                            </Box>
                            <Box>
                                <Typography variant='caption' color='text.secondary' display='block'>SOURCE CODE</Typography>
                                <Typography variant='body2'><a href='https://github.com/kwirthmagnify/kwirth' target='_blank' rel='noreferrer'>github.com/kwirthmagnify/kwirth</a></Typography>
                            </Box>
                        </Stack>
                        <Divider/>
                        <Typography variant='caption' color='text.secondary'>© 2025 Kwirth contributors · Apache 2.0</Typography>
                    </Stack>
                    <Stack height='400px' width='500px' ml={2}>
                        <pre ref={preRef} style={{fontSize:6}}>
                        </pre>
                    </Stack>
                </Stack>
            </DialogContent>
            <DialogActions>
                <Stack direction='row' flex={1} sx={{ml:2, mr:2}} alignItems='center'>
                    <Tooltip title={isAdmin ? 'The log this container is writing right now' : 'Only administrators can read the log of the core'}>
                        <span>
                            <Button disabled={!isAdmin} onClick={() => { setShowCoreLog(true); loadCoreLog() }}>
                                Core log
                            </Button>
                        </span>
                    </Tooltip>
                    <Tooltip title={previousLogHint()}>
                        <span>
                            <Button disabled={!isAdmin || !previousLog?.restarted} onClick={() => setShowPreviousLog(true)}>
                                Previous container log
                            </Button>
                        </span>
                    </Tooltip>
                    <Typography sx={{ flexGrow:1}}></Typography>
                    <Button onClick={props.onClose}>OK</Button>
                </Stack>
            </DialogActions>
        </Dialog>

        { showPreviousLog && <Dialog open={true} fullWidth maxWidth='lg' disableRestoreFocus={true}>
            <DialogTitle>Log of the previous container</DialogTitle>
            <DialogContent>
                <Stack spacing={1} height='60vh'>
                    <Typography variant='body2'>
                        { previousLog?.container && <>Container <b>{previousLog.container}</b> · </> }
                        Restarts: <b>{previousLog?.restartCount}</b> ·
                        Exit code: <b>{previousLog?.termination?.exitCode ?? 'unknown'}</b>
                        { previousLog?.termination?.reason && <> ({previousLog.termination.reason})</> }
                    </Typography>
                    { previousLog?.termination?.finishedAt &&
                        <Typography variant='caption' color='text.secondary'>
                            Ended at {previousLog.termination.finishedAt}
                            { previousLog.termination.startedAt && <>, started at {previousLog.termination.startedAt}</> }
                        </Typography>
                    }
                    { previousLog?.unavailableReason &&
                        <Typography variant='body2' color='warning.main'>
                            The container restarted, but its log is no longer available: {previousLog.unavailableReason}
                        </Typography>
                    }
                    { !previousLog?.unavailableReason && previousLog?.lines.length === 0 &&
                        <Typography variant='body2' color='text.secondary'>The previous container left no log lines.</Typography>
                    }
                    <Box sx={{ flexGrow:1, overflow:'auto', backgroundColor:'rgba(0,0,0,0.06)', borderRadius:1, p:1 }}>
                        <pre style={{ margin:0, fontSize:12, whiteSpace:'pre-wrap', wordBreak:'break-all' }}>
                            {previousLog?.lines.join('\n')}
                        </pre>
                    </Box>
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={() => setShowPreviousLog(false)}>Close</Button>
            </DialogActions>
        </Dialog> }

        {/*
            The box is DARK whatever the theme is, and that is not a style slip: the colours it paints are
            the ones the core emitted for a terminal, and on a light background half of them are unreadable.
            A log viewer looking like a terminal is also what whoever opens it expects.
        */}
        { showCoreLog && <Dialog open={true} fullWidth maxWidth='lg' disableRestoreFocus={true}>
            <DialogTitle>Log of the core</DialogTitle>
            <DialogContent>
                <Stack spacing={1} height='60vh'>
                    { !coreLog && <Typography variant='body2' color='text.secondary'>Reading the log...</Typography> }
                    { coreLog?.unavailableReason &&
                        <Typography variant='body2' color='warning.main'>{coreLog.unavailableReason}</Typography>
                    }
                    { coreLog && !coreLog.unavailableReason &&
                        <Typography variant='caption' color='text.secondary'>Last {coreLog.lines.length} lines</Typography>
                    }
                    <Box sx={{ flexGrow:1, overflow:'auto', backgroundColor:'#1e1e1e', borderRadius:1, p:1 }}>
                        <pre style={{ margin:0, fontSize:12, whiteSpace:'pre-wrap', wordBreak:'break-all', color:'#dddddd' }}>
                            {coreLog?.lines.map((line, index) => <div key={index}>{ansiToSpans(line)}</div>)}
                        </pre>
                    </Box>
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={loadCoreLog} disabled={!coreLog}>Refresh</Button>
                <Button onClick={() => setShowCoreLog(false)}>Close</Button>
            </DialogActions>
        </Dialog> }
    </>)
}

let brand = [
'                                                                                                                        ',
'                                                                                                                        ',
'                                                 .%#@@@++==@@@@@@@@@-                                                   ',
'                                              .@*-+%               @@@@                                                 ',
'                                             #%-.+#                    @@@@                                             ',
'                                            -%:.=@                   @@@@..*                                            ',
'                                          :@*::.@  @              @@ @@*@*: =.                                          ',
'                                           .:...@ .@@              %          @@                                        ',
'                                         @@@@@@@%*@         :.:+@@#%@@++       @@                                       ',
'                                        @@       :..@@%%@@@#*++=:....:-=+#%@@=  *-                                      ',
'                                                  -+:::::...::::::::::::::..:+%#@@-                                     ',
'                                           .@.=@%+::.::::::::::::::::::::::::.:.-%@*                                    ',
'                                          :@-%+:..:::::::::::::::::::::::::::::.@ :@                                    ',
'                                          .@-...::::::::::::::::::::::::::::::: @ %@                                    ',
'                                            ==.:::::::::::::::::::::::::::::::: @                                       ',
'                                            .+...::::::::::::::::::::::::::::::.@                                       ',
'                                            .++=.::::::::::::::::::::::::::::::.%                                       ',
'                                           =@  ::.:::::::...:::...::::::::......%                                       ',
'                                          .@.:@@@@@#####%@@*:..=%@@@%##%%@@@@@@%@                                       ',
'                                        @@                 .@@@%                  =@%@                                  ',
'                                       .+#.                                     @%+.@@:                                 ',
'                                       #+:@     @        @  -@  @# @@@@   @@@@@@-:: :@@                                 ',
'                                        @.-*@@ #@%@@@+=%@@ -%=*##++-  .=#+:.......   @                                  ',
'                                        @-...@  .........  :=::::::::....:::::::.%@: @                                  ',
'                                         @.*- .@@+-:-*#%#%@*:::::::::---:-::::::. @=-=                                  ',
'                                         *::#-  .:=-=::.*= %:::::::::-==-::::::::.:.@                                   ',
'                                          @:-+:........:=  %:.....:::....::::::::.:*.                                   ',
'                                          %#*@@=::::::.=@  @@-.=. .:::::::::::::-*@*                                    ',
'                                            %. =:::::::-*     =@@#.::::::::::::=@                 @@@@@@*               ',
'  @@@@@@@@@.   @@@@@@@                         --::::...+-@@@@:   .:::::::::::-@                     @@@.               ',
'     @@@         @@:                           %=:::+*@:: @@@@+ ..::::::::::::@                      @@@.               ',
'     @@@       @@@                             :-   * @=%#    .++-:.     ..:...        @@@           @@@.               ',
'     @@@      @@                            .@      .            ..                    @@@           @@@.               ',
'     @@@    @@@          @@@@@@@@.     @@@ @@@@@@@@@@@@@@@@@@@@=#+:+@@@@@@ +@@@@@   @@@@@@@@@@@*     @@@  =@@@@@@@@     ',
'     @@@  +@@               @@@       +@@@@.      @:  #    @@@  :..   @@@@@@@  @@      @@@           @@@%@@.    @@@@    ',
'     @@@.@@                 @@@@      @@@@@  @ . @@        @@@  +:::: @@@@             @@@           @@@@        @@@    ',
'     @@@=@@@@                @@@     @@ .@@.    @@%       @@@@  .:::: @@@@ =.          @@@           @@@         @@@    ',
'     @@@  =@@@@              @@@@%@@@@   @@@    @@ -@+    @@@@  ..... @@@@ =  .        @@@           @@@         @@@    ',
'     @@@    @@@@.             @@@   @%    @@@  @@    %@-   @@@**@@@%@ @@@@ =  @@@@@@@  @@@           @@@         @@@    ',
'     @@@     .@@@@            @@@@ @@     @@@  @. .@. :@   @@@      % @@@@ +       .   @@@           @@@         @@@    ',
'     @@@       @@@@@           @@@@@       @@@@@    @. :* =@@@      @ @@@@             @@@           @@@         @@@    ',
'     @@@         @@@@          @@@@        *@@@      @     @@@      = @@@@             @@@@          @@@         @@@    ',
'  @@@@@@@@@     @@@@@@@@@       @@@         @@@      @@@@@@@@@@@@   @@@@@@@@@           @@@@@@@=  @@@@@@@@@   @@@@@@@@@ ',
'                                                                                                                        ',
'                                                 https://kwirthmagnify.dev                                              ',
'                                                                                                                        ',
'                                                                                                                        ']
export { About }
