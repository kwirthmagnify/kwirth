import React, { useContext, useRef, useState } from 'react'
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Stack, Tooltip, Typography} from '@mui/material'
import { parseResources } from '@kwirthmagnify/kwirth-common'
import { VERSION } from '../../version'
import { useAsync } from 'react-use'
import { useKeyboard } from '../../tools/useKeyboard'
import { addGetAuthorization } from '../../tools/AuthorizationManagement'
import { SessionContext, SessionContextType } from '../../model/SessionContext'

/*
    Lo que devuelve el core en /managekwirth/previouslog. Se declara aqui, como el resto de respuestas
    del core que consume el front, en vez de compartir el tipo por 'kwirth-common': ni back ni front
    tienen paths al source del paquete, asi que compartirlo obligaria a publicarlo para cada campo.
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

interface IAboutProps {
    onClose: () => void
}

const About: React.FC<IAboutProps> = (props:IAboutProps) => {
    const preRef = useRef<HTMLPreElement | null>(null)
    const [previousLog, setPreviousLog] = useState<IPreviousContainerLog|undefined>(undefined)
    const [showPreviousLog, setShowPreviousLog] = useState(false)
    // La sesion ya viaja por contexto (y el About se abre desde dos sitios): pedirla por props obligaria
    // a que los dos llamantes la tuvieran a mano, y el de las preferencias del canal no la tiene.
    const session = useContext(SessionContext) as SessionContextType
    // el log del core lleva trazas internas: sin scope 'admin' no se pide, y el back tampoco lo sirve
    const isAdmin = session?.user ? parseResources(session.user.accessKey.resources).some(r => r.scopes.split(',').includes('admin')) : false
    useKeyboard(props.onClose)

    /*
        Se pide al abrir el About, no al pulsar el boton: asi el boton puede decir de entrada si hay algo
        que ver. El core lo tiene en memoria desde su arranque, asi que la llamada es barata.
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
        El boton se queda visible aunque no se pueda usar, y el tooltip dice POR QUE. "No hubo reinicio" y
        "hubo reinicio pero el log ya no esta" son cosas distintas, y la segunda es la que desconcierta a
        quien va a mirar: sin decirlo, parece que Kwirth se lo ha comido.
    */
    const previousLogHint = (): string => {
        if (!isAdmin) return 'Only administrators can read the log of the core'
        if (!previousLog) return 'Checking whether this container has restarted...'
        if (!previousLog.restarted) return 'This container has not restarted, so there is no previous log. After a rollout the pod is a new one and the kubelet keeps nothing from the old one'
        if (previousLog.abnormal) return `The previous container ended abnormally (exit code ${previousLog.termination?.exitCode})`
        return 'The previous container ended cleanly'
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
