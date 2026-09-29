import React from 'react'
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Stack, Typography} from '@mui/material'
import { VERSION } from '../../version'
import { useKeyboard } from '../../tools/useKeyboard'

/*
    The core's log (current and previous container) used to be read from here. It moved to the Status
    channel, as its Log and Previous log tabs: that is where an administrator looks at how Kwirth is
    doing, with the same refresh as everything else.
*/

interface IAboutProps {
    onClose: () => void
}

const About: React.FC<IAboutProps> = (props:IAboutProps) => {
    useKeyboard(props.onClose)

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
                    {/* Drawn whole, at once: it used to be typed out character by character. */}
                    <Stack height='400px' width='500px' ml={2}>
                        <pre style={{fontSize:6}}>{brand.join('\n')}</pre>
                    </Stack>
                </Stack>
            </DialogContent>
            <DialogActions>
                <Stack direction='row' flex={1} sx={{ml:2, mr:2}} alignItems='center'>
                    {/* Where the log went: said here, since this is where people used to look for it. */}
                    <Typography variant='caption' color='text.secondary'>The core's log is now in the Status channel.</Typography>
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
