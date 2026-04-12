import React, { useRef } from 'react'
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography} from '@mui/material'
import { VERSION } from '../version'
import { useAsync } from 'react-use'
import { useEscape } from '../tools/useEscape'

interface IAboutProps {
    onClose: () => void
}

const About: React.FC<IAboutProps> = (props:IAboutProps) => {
    const preRef = useRef<HTMLPreElement | null>(null)
    useEscape(props.onClose)

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
                    <Stack spacing={2} sx={{ display: 'flex', flexDirection: 'column'}} mt={2}>
                        <Typography><b>Version: </b>{VERSION}</Typography>
                        <Typography><b>Homepage: </b><a href='https://kwirthmagnify.dev' target='_blank' rel='noreferrer'>https://kwirthmagnify.dev</a></Typography>
                        <Typography><b>Project: </b><a href='https://github.com/kwirthmagnify/kwirth' target='blank' rel='noreferer'>https://github.com/kwirthmagnify/kwirth</a></Typography>
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
