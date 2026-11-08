import React from 'react'
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Stack, Typography} from '@mui/material'
import { VERSION } from '../../version'
import { useEscapeToClose } from '../../tools/useKeyboard'

/*
    The core's log (current and previous container) used to be read from here. It moved to the Status
    channel, as its Log and Previous log tabs: that is where an administrator looks at how Kwirth is
    doing, with the same refresh as everything else.
*/

interface IAboutProps {
    onClose: () => void
}

const About: React.FC<IAboutProps> = (props:IAboutProps) => {
    const escapeRef = useEscapeToClose(props.onClose)

    return (
        <>
            {/* The content is fixed (a card and a drawing of a fixed size) and the dialog adapts to it. */}
            <Dialog open={true} ref={escapeRef} disableRestoreFocus={true} maxWidth={false}>
                <DialogTitle>About Kwirth...</DialogTitle>
                <DialogContent>
                    <Stack
                        direction={'row'}
                        sx={{
                            alignItems: 'center',
                            justifyContent: 'space-between'
                        }}>
                        <Stack spacing={2} sx={{ minWidth: 220, p: 2, borderRadius: 2, backgroundColor: 'rgba(245,130,10,0.07)', border: '1px solid rgba(245,130,10,0.2)' }}>
                            <Box>
                                <Typography
                                    variant='h5'
                                    sx={{
                                        fontWeight: 'bold',
                                        color: '#f5820a'
                                    }}>Kwirth</Typography>
                                <Typography variant='body2' sx={{
                                    color: 'text.secondary'
                                }}>Kubernetes observability platform</Typography>
                            </Box>
                            <Divider/>
                            <Stack spacing={1.5}>
                                <Box>
                                    <Typography
                                        variant='caption'
                                        sx={{
                                            color: 'text.secondary',
                                            display: 'block'
                                        }}>VERSION</Typography>
                                    <Typography variant='body2'>{VERSION}</Typography>
                                </Box>
                                <Box>
                                    <Typography
                                        variant='caption'
                                        sx={{
                                            color: 'text.secondary',
                                            display: 'block'
                                        }}>HOMEPAGE</Typography>
                                    <Typography variant='body2'><a href='https://kwirthmagnify.dev' target='_blank' rel='noreferrer'>kwirthmagnify.dev</a></Typography>
                                </Box>
                                <Box>
                                    <Typography
                                        variant='caption'
                                        sx={{
                                            color: 'text.secondary',
                                            display: 'block'
                                        }}>SOURCE CODE</Typography>
                                    <Typography variant='body2'><a href='https://github.com/kwirthmagnify/kwirth' target='_blank' rel='noreferrer'>github.com/kwirthmagnify/kwirth</a></Typography>
                                </Box>
                            </Stack>
                            <Divider/>
                            <Typography variant='caption' sx={{
                                color: 'text.secondary'
                            }}>© 2025 Kwirth contributors · Apache 2.0</Typography>
                        </Stack>
                        {/* Drawn whole, at once: it used to be typed out character by character. Its size is
                            set by the drawing itself: an explicit line-height and no margin, because inherited
                            from the body (1.5) the 47 lines no longer fitted the old 400px box and the dialog
                            scrolled. */}
                        <Box sx={{ ml: 2 }}>
                            <pre style={{ fontSize: 6, lineHeight: 1.2, margin: 0 }}>{brand.join('\n')}</pre>
                        </Box>
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Stack
                        direction='row'
                        sx={{
                            flex: 1,
                            alignItems: 'center',
                            ml:2,
                            mr:2
                        }}>
                        <Typography sx={{ flexGrow:1}}></Typography>
                        <Button onClick={props.onClose}>OK</Button>
                    </Stack>
                </DialogActions>
            </Dialog>
        </>
    );
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
