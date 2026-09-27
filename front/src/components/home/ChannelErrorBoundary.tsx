import React from 'react'
import { Box, Button, Stack, Typography } from '@mui/material'
import { Warning } from '@kwirthmagnify/kwirth-common-front/icons'

/*
    A channel that blows up while painting takes ITS tab down, not the application.

    Without this, a single broken extension leaves Kwirth blank: React 18 unmounts the whole tree when
    nobody catches the error, and the whole tree includes the menu, the clusters and the other tabs. It
    really happened with a plugin asking the core for an icon that no longer existed — the user did not
    see a broken tab, they saw that Kwirth "would not start", and nothing on screen said whose fault it was.

    That is why the message gives the CHANNEL and the error: whoever sees it has to be able to tell which
    extension to uninstall or update without opening the browser's console.

    ⚠️ A boundary only catches RENDER errors from its children. Whatever happens in a callback, in a
    setTimeout or in a promise still ends up at window.onerror, and this class does not cover that.
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
        Switching channel starts from scratch. The content is mounted with a `key` per tab, so normally
        this class remounts by itself; this covers the case where it does not and the user would be left
        staring at ANOTHER channel's error.
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
