import React, { useRef } from 'react'
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Stack, Typography} from '@mui/material'
import { VERSION } from '../version'
import { useAsync } from 'react-use'
import { useKeyboard } from '../tools/useKeyboard'

interface IAboutProps {
    onClose: () => void
}

const About: React.FC<IAboutProps> = (props:IAboutProps) => {
    const preRef = useRef<HTMLPreElement | null>(null)
    useKeyboard(props.onClose)

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
                <Stack direction='row' flex={1} sx={{ml:2, mr:2}}>
                    <Typography sx={{ flexGrow:1}}></Typography>
                    <Button onClick={props.onClose}>OK</Button>
                </Stack>
            </DialogActions>
        </Dialog>
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
