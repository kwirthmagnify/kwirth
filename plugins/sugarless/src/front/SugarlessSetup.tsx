import React from 'react'
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material'
import { ISetupProps } from '@kwirthmagnify/kwirth-common-front'

/*
    El canal declara 'setup: false', asi que este dialogo NO se abre en el uso normal: todo lo
    configurable de sugarless vive en el provider.

    Existe porque el contrato IChannel exige un SetupDialog, y se escribe de verdad en lugar de
    devolver null para que, si algun dia alguien pone setup en true, encuentre una explicacion en vez
    de una pantalla en blanco.
*/
export const SugarlessSetup: React.FC<ISetupProps> = (props: ISetupProps) => {
    const close = (accepted: boolean) => {
        props.onChannelSetupClosed(props.channel, {
            channelId: props.channel.channelId,
            channelConfig: undefined,
            channelInstanceConfig: undefined
        }, accepted, false)
    }

    return (
        <Dialog open={true} maxWidth='sm' fullWidth>
            <DialogTitle>Sugarless</DialogTitle>
            <DialogContent>
                <Typography variant='body2'>
                    This channel has nothing to configure. The LibreLinkUp account, the region, the
                    polling interval and the size of the history all belong to the Sugarless
                    <b> provider</b>, and an administrator sets them in Manage extensions → Providers.
                </Typography>
            </DialogContent>
            <DialogActions>
                <Button variant='outlined' onClick={() => close(true)}>OK</Button>
                <Button variant='outlined' onClick={() => close(false)}>CANCEL</Button>
            </DialogActions>
        </Dialog>
    )
}
