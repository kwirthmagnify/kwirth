import React, { useEffect, useRef, useState } from 'react'
import { Box, Card, CardContent, CardHeader, Stack, Typography } from '@mui/material'
import { ChannelNotStarted, IContentProps } from '@kwirthmagnify/kwirth-common-front'
import { IEchoData } from './EchoData'
import { Info, Science } from '@mui/icons-material'
import { IEchoInstanceConfig } from './EchoTypes'
import { IEchoConfig } from './EchoConfig'

export const EchoTabContent: React.FC<IContentProps> = (props: IContentProps) => {
    const echoData: IEchoData = props.channelObject.data
    const echoConfig: IEchoConfig = props.channelObject.config
    const echoInstanceConfig: IEchoInstanceConfig = props.channelObject.instanceConfig
    const echoBoxRef = useRef<HTMLDivElement | null>(null)
    const [echoBoxTop, setEchoBoxTop] = useState(0)

    useEffect(() => {
        if (echoBoxRef.current) setEchoBoxTop(echoBoxRef.current.getBoundingClientRect().top)
    })

    const formatContent = () => {
        if (!echoData || !echoData.lines) return <></>
        return echoData.lines.map((line, index) => <Typography key={index}>{line}</Typography>)
    }

    /*
        Not started: the shared not-started screen (icon and name, what starting gives, and a Start button that opens
        the setup first, like the tab menu's Start). It used to draw nothing, and the tab stayed blank. The box ref is
        the echo list's: only one of the two is mounted at a time, and its measured top gives the height to centre in.
    */
    if (!echoData.started) {
        return (
            <Stack ref={echoBoxRef} sx={{ alignItems: 'center', justifyContent: 'center', flex: 1, width: '100%', minHeight: `calc(100vh - ${echoBoxTop}px - 8px)`, px: 4 }}>
                <ChannelNotStarted icon={<Science color='primary' />} name='Echo'
                    hint='Echo not started. Start the channel to receive the periodic test messages of the resources you watch.' channelObject={props.channelObject} />
            </Stack>
        )
    }

    return (
        <>
            {echoData.started &&
                <Card sx={{ flex: 1, width: '98%', alignSelf: 'center', m: 1 }}>
                    <CardHeader title={
                        <Stack direction='row' sx={{
                            alignItems: 'center'
                        }}>
                            <Typography sx={{
                                mr: 4
                            }}><b>Lines:</b> {echoData.lines.length} / {echoConfig.maxLines}</Typography>
                            <Typography sx={{
                                mr: 4
                            }}><b>Interval:</b> {echoInstanceConfig.interval}</Typography>
                            <Typography sx={{
                                mr: 4
                            }}><Info fontSize='small' sx={{ mb: 0.25 }} /><b>&nbsp;Status:</b> {echoData.paused ? 'paused' : echoData.started ? 'started' : 'stopped'}</Typography>
                        </Stack>
                    } />
                    <CardContent>
                        <Box ref={echoBoxRef} sx={{ display: 'flex', flexDirection: 'column', overflowY: 'auto', overflowX: 'hidden', width: '100%', flexGrow: 1, height: `calc(100vh - ${echoBoxTop}px - 35px)` }}>
                            <Box sx={{ flex: 1, overflowY: 'auto', ml: 1, mr: 1 }}>
                                {formatContent()}
                            </Box>
                        </Box>
                    </CardContent>
                </Card>
            }
        </>
    );
}
