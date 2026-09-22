import React from 'react'
import { Box, Button, Stack, Typography } from '@mui/material'
import { Warning } from '@kwirthmagnify/kwirth-common-front/icons'

/*
    Un canal que revienta al pintarse se lleva SU pestaña, no la aplicacion.

    Sin esto, una sola extension rota deja Kwirth en blanco: React 18 desmonta el arbol entero cuando
    nadie captura el error, y el arbol entero incluye el menu, los clusters y las demas pestañas. Paso
    de verdad con un plugin que pedia al core un icono que ya no existia — el usuario no veia un tab
    roto, veia que Kwirth "no arrancaba", y nada en pantalla decia de quien era la culpa.

    Por eso el mensaje dice el CANAL y el error: quien lo ve tiene que poder saber que extension
    desinstalar o actualizar sin abrir la consola del navegador.

    ⚠️ Un boundary solo atrapa errores de RENDER de sus hijos. Lo que ocurra en un callback, en un
    setTimeout o en una promesa sigue yendo a parar a window.onerror, y eso no lo cubre esta clase.
*/

interface IChannelErrorBoundaryProps {
    channelId?: string
    children?: React.ReactNode
}

interface IChannelErrorBoundaryState {
    error?: Error
}

class ChannelErrorBoundary extends React.Component<IChannelErrorBoundaryProps, IChannelErrorBoundaryState> {
    state: IChannelErrorBoundaryState = {}

    static getDerivedStateFromError(error: Error): IChannelErrorBoundaryState {
        return { error }
    }

    componentDidCatch(error: Error, info: React.ErrorInfo): void {
        console.error(`[channels] channel '${this.props.channelId ?? '(unknown)'}' crashed while rendering:`, error, info.componentStack)
    }

    /*
        Al cambiar de canal se empieza de cero. El contenido se monta con una `key` por pestaña, asi que
        lo normal es que esta clase se remonte sola; esto cubre el caso en que no ocurra y el usuario se
        quedaria mirando el error de OTRO canal.
    */
    componentDidUpdate(prev: IChannelErrorBoundaryProps): void {
        if (prev.channelId !== this.props.channelId && this.state.error) this.setState({ error: undefined })
    }

    render(): React.ReactNode {
        if (!this.state.error) return this.props.children

        return (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 240, p: 2 }}>
                <Stack direction='column' alignItems='center' spacing={1} sx={{ maxWidth: 560, textAlign: 'center' }}>
                    <Warning sx={{ fontSize: 40, color: 'warning.main' }} />
                    <Typography variant='h6'>This channel stopped working</Typography>
                    <Typography variant='body2' color='text.secondary'>
                        The <b>{this.props.channelId ?? 'channel'}</b> extension failed while drawing its content. The rest of
                        Kwirth keeps working, so you can close this tab and carry on.
                    </Typography>
                    <Typography variant='caption' color='text.disabled' sx={{ fontFamily: 'monospace', wordBreak: 'break-word' }}>
                        {this.state.error.message}
                    </Typography>
                    <Typography variant='caption' color='text.secondary'>
                        If it happens again, the extension is likely built for a different version of Kwirth and should be updated.
                    </Typography>
                    <Button size='small' variant='outlined' onClick={() => this.setState({ error: undefined })}>Try again</Button>
                </Stack>
            </Box>
        )
    }
}

export { ChannelErrorBoundary }
