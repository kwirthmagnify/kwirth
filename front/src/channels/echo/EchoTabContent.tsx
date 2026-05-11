import { useEffect, useRef, useState } from 'react'
import { Box, Card, CardContent, CardHeader, Stack, Typography } from '@mui/material'
import { IChannelObject } from '../IChannel'
import { IEchoData } from './EchoData'
import { Info } from '@mui/icons-material'
import { IEchoInstanceConfig } from './EchoTypes'
import { IEchoConfig } from './EchoConfig'

interface IContentProps {
    webSocket?: WebSocket
    channelObject: IChannelObject
}

const EchoTabContent: React.FC<IContentProps> = (props:IContentProps) => {
    let echoData:IEchoData = props.channelObject.data
    let echoConfig:IEchoConfig = props.channelObject.config
    let echoInstanceConfig:IEchoInstanceConfig = props.channelObject.instanceConfig
    const echoBoxRef = useRef<HTMLDivElement | null>(null)
    const [echoBoxTop, setEchoBoxTop] = useState(0)

    useEffect(() => {
        if (echoBoxRef.current) setEchoBoxTop(echoBoxRef.current.getBoundingClientRect().top)
    })


    const formatContent = () => {
        if (!echoData || !echoData.lines) return <></>
        return echoData.lines.map( (line,index) => <Typography key={index}>{line}</Typography> )
    }

    return (
        <>
        { echoData.started && 
        <Card sx={{flex:1, width:'98%', alignSelf:'center', margin:'8px'}}>
            <CardHeader title={
                <Stack direction={'row'} alignItems={'center'}>
                    <Typography marginRight={'32px'}><b>Lines:</b> {echoData.lines.length} / {echoConfig.maxLines}</Typography>
                    <Typography marginRight={'32px'}><b>Interval:</b> {echoInstanceConfig.interval}</Typography>
                    <Typography marginRight={'32px'}><Info fontSize='small' sx={{marginBottom:'2px'}} /><b>&nbsp;Status:</b> {echoData.paused?'paused':echoData.started?'started':'stopped'}</Typography>
                </Stack>}>
            </CardHeader>
            <CardContent>
                <Box ref={echoBoxRef} sx={{ display:'flex', flexDirection:'column', overflowY:'auto', overflowX:'hidden', width:'100%', flexGrow:1, height: `calc(100vh - ${echoBoxTop}px - 35px)`}}>
                    <Box sx={{ flex:1, overflowY: 'auto', ml:1, mr:1 }}>
                        { formatContent() }
                    </Box>
                </Box>
            </CardContent>
        </Card>}
        </>
    )
    
}
export { EchoTabContent }