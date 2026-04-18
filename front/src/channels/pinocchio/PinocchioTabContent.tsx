import { useEffect, useRef, useState } from 'react'
import { Box, Card, CardContent, CardHeader, Stack, Typography } from '@mui/material'
import { IChannelObject } from '../IChannel'
import { IPinocchioData } from './PinocchioData'
import { Info } from '@mui/icons-material'
import { IPinocchioConfig, IPinocchioInstanceConfig } from './PinocchioConfig'

interface IContentProps {
    webSocket?: WebSocket
    channelObject: IChannelObject
}

const PinocchioTabContent: React.FC<IContentProps> = (props:IContentProps) => {
    let pinocchioData:IPinocchioData = props.channelObject.data
    let pinocchioConfig:IPinocchioConfig = props.channelObject.config
    let pinocchioInstanceConfig:IPinocchioInstanceConfig = props.channelObject.instanceConfig
    const pinocchioBoxRef = useRef<HTMLDivElement | null>(null)
    const messagesEndRef = useRef<HTMLSpanElement | null>(null)
    const [pinocchioBoxTop, setPinocchioBoxTop] = useState(0)

    useEffect(() => {
        if (pinocchioBoxRef.current) setPinocchioBoxTop(pinocchioBoxRef.current.getBoundingClientRect().top)
    })

    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [pinocchioData.analysis])

    useEffect(() => {
        const timer = setTimeout(() => {
            if (messagesEndRef.current) {
                messagesEndRef.current.scrollIntoView({ 
                    behavior: pinocchioData.analysis.length > 50 ? "auto" : "smooth", 
                    block: "end" 
                });
            }
        }, 50)

        return () => clearTimeout(timer);
    }, [pinocchioData.analysis])

    const color = (level:string) => {
        if (level==='low') return 'gray'
        if (level==='medium') return 'green'
        if (level==='high') return 'orange'
        if (level==='critical') return 'red'
    }
    const showContent = () => {
        if (!pinocchioData || !pinocchioData.analysis) return <></>
        return <>
            {pinocchioData.analysis.map( (an,index) => {
                return <>
                        { an.text && <Typography variant='body1' key={index} sx={{mt:2}}>{new Date(an.timestamp).toISOString()} {an.text}</Typography> }
                        { an.findings && an.findings.map (f => {
                            return <Stack direction={'row'} alignItems={'center'}>
                                <Box sx={{width:'70px'}}>
                                    <Typography variant='body2' sx={{backgroundColor: color(f.level), display: 'inline-block', p:0.5, borderRadius: '4px'}}>{f.level}</Typography>
                                </Box>
                                <Typography variant='body2'>{f.description}</Typography>
                            </Stack>
                        })}
                    </>
                })
            }
            <span ref={messagesEndRef} style={{ float: "left", clear: "both" }} />
        </>
    }

    return <>
        { pinocchioData.started && 
        <Card sx={{flex:1, width:'98%', alignSelf:'center', margin:'8px'}}>
            <CardHeader title={
                <Stack direction={'row'} alignItems={'center'}>
                    <Typography marginRight={'32px'}><b>Events:</b> {pinocchioData.analysis.length}</Typography>
                    <Typography marginRight={'32px'}><Info fontSize='small' sx={{marginBottom:'2px'}} /><b>&nbsp;Status:</b> {pinocchioData.paused?'paused':pinocchioData.started?'started':'stopped'}</Typography>
                </Stack>}>
            </CardHeader>
            <CardContent>
                <Box ref={pinocchioBoxRef} sx={{ display:'flex', flexDirection:'column', overflowY:'auto', overflowX:'hidden', width:'100%', flexGrow:1, height: `calc(100vh - ${pinocchioBoxTop}px - 35px)`}}>
                    <Box sx={{ flex:1, overflowY: 'auto', ml:1, mr:1 }}>
                        { showContent() }
                    </Box>
                </Box>
            </CardContent>
        </Card>}
    </>    
}
export { PinocchioTabContent }