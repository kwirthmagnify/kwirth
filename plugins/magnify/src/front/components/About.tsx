import React from 'react'
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Stack, Typography } from '@mui/material'

/*
    'About Kwirth', as Magnify shows it from its preferences. While Magnify was part of the core it opened
    the core's own About dialog; a plugin cannot, so it draws the same facts. The version is the CORE's,
    which the core hands every channel in channelObject.kwirthVersion.
*/

interface IAboutProps {
    kwirthVersion?: string
    onClose: () => void
}

const About: React.FC<IAboutProps> = (props: IAboutProps) => {
    return (
        <Dialog open={true} onClose={props.onClose} disableRestoreFocus={true} maxWidth='xs' fullWidth>
            <DialogTitle>About Kwirth...</DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{ p: 2, borderRadius: 2, backgroundColor: 'rgba(245,130,10,0.07)', border: '1px solid rgba(245,130,10,0.2)' }}>
                    <Box>
                        <Typography variant='h5' fontWeight='bold' sx={{ color: '#f5820a' }}>Kwirth</Typography>
                        <Typography variant='body2' color='text.secondary'>Kubernetes observability platform</Typography>
                    </Box>
                    <Divider />
                    <Stack spacing={1.5}>
                        <Box>
                            <Typography variant='caption' color='text.secondary' display='block'>VERSION</Typography>
                            <Typography variant='body2'>{props.kwirthVersion ?? 'unknown'}</Typography>
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
                    <Divider />
                    <Typography variant='caption' color='text.secondary'>© 2025 Kwirth contributors · Apache 2.0</Typography>
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={props.onClose}>OK</Button>
            </DialogActions>
        </Dialog>
    )
}

export { About }
