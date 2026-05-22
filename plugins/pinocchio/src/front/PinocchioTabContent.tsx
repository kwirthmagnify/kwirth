import { useEffect, useRef, useState } from 'react'
import { Box, Button, Card, CardContent, CardHeader, Stack, Typography } from '@mui/material'
import { IPinocchioData } from './PinocchioData'
import { Info } from '@mui/icons-material'
import { EPinocchioCommand, IAnalysis, IConfigTrigger, IMessage, IPinocchioConfig, IPinocchioMessage, IPlaygroundState } from './PinocchioConfig'
import { PinocchioConfigTrigger } from './PinocchioConfigTrigger'
import { EInstanceMessageAction, EInstanceMessageFlow, EInstanceMessageType } from '@kwirthmagnify/kwirth-common'
import { AiConfigLlm, AiConfigProvider } from '@kwirthmagnify/kwirth-common-ai/front'
import { ILlm, ILlmProvider } from '@kwirthmagnify/kwirth-common-ai'
import React from 'react'
import { MenuConfig } from './MenuConfig'
import { PinocchioImportExport } from './PinocchioImportExport'
import { PinocchioPlayground } from './PinocchioPlayground'
import { IChannelObject } from '@kwirthmagnify/kwirth-common-front'

interface IContentProps {
    webSocket?: WebSocket
    channelObject: IChannelObject
}

const PinocchioTabContent: React.FC<IContentProps> = (props:IContentProps) => {
    let pinocchioData:IPinocchioData = props.channelObject.data

    const pinocchioBoxRef = useRef<HTMLDivElement | null>(null)
    const messagesEndRef = useRef<HTMLSpanElement | null>(null)
    const [isAtBottom, setIsAtBottom] = useState(true)
    const [pinocchioBoxTop, setPinocchioBoxTop] = useState(0)
    const [showPlayground, setShowPlayground] = useState(false)
    const [showConfigTrigger, setShowConfigTrigger] = useState(false)
    const [showConfigLlm, setShowConfigLlm] = useState(false)
    const [showConfigProvider, setShowConfigProvider] = useState(false)
    const [showImportExport, setShowImportExport] = useState(false)
    const [anchorMenu, setAnchorMenu] = useState<Element | undefined>(undefined)
    const priorityOrder = {
        'critical': 0,
        'high': 1,
        'medium': 2,
        'low': 3
    }

    useEffect(() => {
        if (pinocchioBoxRef.current) setPinocchioBoxTop(pinocchioBoxRef.current.getBoundingClientRect().top)
    })

    useEffect(() => {
        if (isAtBottom && pinocchioBoxRef.current) {
            pinocchioBoxRef.current.scrollTo({
                top: pinocchioBoxRef.current.scrollHeight,
                behavior: 'auto',
            })
        }
    }, [isAtBottom, pinocchioData.content.length])

    useEffect(() => {
        const timer = setTimeout(() => {
            if (messagesEndRef.current) {
                messagesEndRef.current.scrollIntoView({
                    behavior: pinocchioData.content.length > 50 ? 'auto' : 'smooth',
                    block: 'end'
                });
            }
        }, 50)

        return () => clearTimeout(timer);
    }, [pinocchioData.content])

    const color = (level:string) => {
        if (level==='low') return 'gray'
        if (level==='medium') return 'green'
        if (level==='high') return 'orange'
        if (level==='critical') return 'red'
    }

    const showContent = () => {
        if (!pinocchioData || !pinocchioData.content) return <></>
        return (<>
            {pinocchioData.content.map((item, index) => {
                if (typeof item !== 'string') {
                    let analysis = item as IAnalysis
                    return (
                        <React.Fragment key={index}>
                            {analysis.text && (
                                <Typography variant='body1' sx={{ mt: 2 }}>
                                    {new Date(analysis.timestamp).toISOString()} {analysis.text}
                                </Typography>
                            )}

                            {analysis.findings && [...analysis.findings]
                                .sort((a, b) => priorityOrder[a.level] - priorityOrder[b.level])
                                .map((f, fIndex) => {
                                    let description = f.description
                                    if (description.includes(' **') && description.includes('** ')) description=description.replace(' **', ' <b><u>').replace('** ', '</u></b> ')
                                    return (
                                        <Stack key={fIndex} direction={'row'} alignItems={'center'}>
                                            <Box sx={{ width: '70px' }}>
                                                <Typography variant='body2' sx={{ backgroundColor: color(f.level), display: 'inline-block', p: 0.5, borderRadius: '4px' }}>
                                                    {f.level}
                                                </Typography>
                                            </Box>
                                            <Typography component={'div'} variant='body2'><div dangerouslySetInnerHTML={{__html: description}}/></Typography>
                                        </Stack>
                                    );
                                })}
                        </React.Fragment>
                    );
                }
                else {
                    let message = item as IMessage
                    return <>
                        <Typography variant='body1' sx={{ mt: 2 }}>
                            {new Date(message.timestamp).toISOString()} {message.text}
                        </Typography>
                    </>
                }
            })}
            <span ref={messagesEndRef} style={{ float: 'left', clear: 'both' }} />
        </>)
    }

    const pinocchioConfigClose = (config:IPinocchioConfig|undefined) => {
        if (config) {
            pinocchioData.config = config
            let msg:IPinocchioMessage = {
                channel: 'pinocchio',
                msgtype: 'pinocchiomessage',
                id: '1',
                accessKey: props.channelObject.accessString!,
                instance: props.channelObject.instanceId,
                command: EPinocchioCommand.CONFIGSET,
                action: EInstanceMessageAction.COMMAND,
                flow: EInstanceMessageFlow.REQUEST,
                type: EInstanceMessageType.DATA,
                data: config
            }
            props.channelObject.webSocket?.send(JSON.stringify(msg))
        }
        setShowConfigTrigger(false)
        setShowConfigLlm(false)
    }

    const aiConfigLlmClose = (llms: ILlm[] | undefined) => {
        if (llms) {
            const updated: IPinocchioConfig = { ...pinocchioData.config, llms }
            pinocchioData.config = updated
            let msg:IPinocchioMessage = {
                channel: 'pinocchio',
                msgtype: 'pinocchiomessage',
                id: '1',
                accessKey: props.channelObject.accessString!,
                instance: props.channelObject.instanceId,
                command: EPinocchioCommand.CONFIGSET,
                action: EInstanceMessageAction.COMMAND,
                flow: EInstanceMessageFlow.REQUEST,
                type: EInstanceMessageType.DATA,
                data: updated
            }
            props.channelObject.webSocket?.send(JSON.stringify(msg))
        }
        setShowConfigLlm(false)
    }

    const pinocchioConfigProviderClose = (providers:ILlmProvider[]|undefined) => {
        if (providers) {
            pinocchioData.providers = providers
            let msg:IPinocchioMessage = {
                channel: 'pinocchio',
                msgtype: 'pinocchiomessage',
                id: '1',
                accessKey: props.channelObject.accessString!,
                instance: props.channelObject.instanceId,
                command: EPinocchioCommand.PROVIDERSSET,
                action: EInstanceMessageAction.COMMAND,
                flow: EInstanceMessageFlow.REQUEST,
                type: EInstanceMessageType.DATA,
                data: providers
            }
            props.channelObject.webSocket?.send(JSON.stringify(msg))
        }
        setShowConfigProvider(false)
    }

    const handleScroll = () => {
        if (pinocchioBoxRef.current) {
            const { scrollTop, scrollHeight, clientHeight } = pinocchioBoxRef.current
            const distanceToBottom = scrollHeight - scrollTop - clientHeight
            const atBottom = distanceToBottom < 25
            setIsAtBottom(atBottom)
        }
    }

    const pinocchioPlaygroundStateChange = (state: IPlaygroundState) => {
        const updatedConfig: IPinocchioConfig = { ...pinocchioData.config, playground: state }
        pinocchioData.config = updatedConfig
        const msg: IPinocchioMessage = {
            channel: 'pinocchio',
            msgtype: 'pinocchiomessage',
            id: '1',
            accessKey: props.channelObject.accessString!,
            instance: props.channelObject.instanceId,
            command: EPinocchioCommand.CONFIGSET,
            action: EInstanceMessageAction.COMMAND,
            flow: EInstanceMessageFlow.REQUEST,
            type: EInstanceMessageType.DATA,
            data: updatedConfig
        }
        props.channelObject.webSocket?.send(JSON.stringify(msg))
    }

    const pinocchioPlaygroundClose = (newTrigger?: IConfigTrigger) => {
        setShowPlayground(false)
        if (!newTrigger) return
        const updatedConfig: IPinocchioConfig = {
            ...pinocchioData.config,
            triggers: [...pinocchioData.config.triggers, newTrigger]
        }
        pinocchioData.config = updatedConfig
        let msg: IPinocchioMessage = {
            channel: 'pinocchio',
            msgtype: 'pinocchiomessage',
            id: '1',
            accessKey: props.channelObject.accessString!,
            instance: props.channelObject.instanceId,
            command: EPinocchioCommand.CONFIGSET,
            action: EInstanceMessageAction.COMMAND,
            flow: EInstanceMessageFlow.REQUEST,
            type: EInstanceMessageType.DATA,
            data: updatedConfig
        }
        props.channelObject.webSocket?.send(JSON.stringify(msg))
    }

    const pinocchioImportExportClose = (providers?: IConfigProvider[], config?: IPinocchioConfig) => {
        if (providers) {
            pinocchioData.providers = providers
            let msg:IPinocchioMessage = {
                channel: 'pinocchio',
                msgtype: 'pinocchiomessage',
                id: '1',
                accessKey: props.channelObject.accessString!,
                instance: props.channelObject.instanceId,
                command: EPinocchioCommand.PROVIDERSSET,
                action: EInstanceMessageAction.COMMAND,
                flow: EInstanceMessageFlow.REQUEST,
                type: EInstanceMessageType.DATA,
                data: providers
            }
            props.channelObject.webSocket?.send(JSON.stringify(msg))
        }
        if (config) {
            pinocchioData.config = config
            let msg:IPinocchioMessage = {
                channel: 'pinocchio',
                msgtype: 'pinocchiomessage',
                id: '1',
                accessKey: props.channelObject.accessString!,
                instance: props.channelObject.instanceId,
                command: EPinocchioCommand.CONFIGSET,
                action: EInstanceMessageAction.COMMAND,
                flow: EInstanceMessageFlow.REQUEST,
                type: EInstanceMessageType.DATA,
                data: config
            }
            props.channelObject.webSocket?.send(JSON.stringify(msg))
        }
        setShowImportExport(false)
    }

    const onConfigAction = (a:string) => {
        setAnchorMenu(undefined)
        switch(a) {
            case 'provider':
                setShowConfigProvider(true)
                break
            case 'llm':
                setShowConfigLlm(true)
                break
            case 'trigger':
                setShowConfigTrigger(true)
                break
            case 'importexport':
                setShowImportExport(true)
                break
        }
    }

    return <>
        { pinocchioData.started &&
        <Card sx={{display: 'flex', flexDirection: 'column', flex: 1, width: '98%', alignSelf: 'center', marginTop: '8px',minHeight: 0}}>
            <CardHeader title={
                <Stack direction={'row'} alignItems={'center'}>
                    <Typography marginRight={'32px'}><b>Events:</b> {pinocchioData.content.length}</Typography>
                    <Typography marginRight={'32px'} flex={1}><Info fontSize='small' sx={{marginBottom:'2px'}} /><b>&nbsp;Status:</b> {pinocchioData.paused?'paused':pinocchioData.started?'started':'stopped'}</Typography>
                    <Button onClick={() => setShowPlayground(true)}>Playground</Button>
                    <Button onClick={(event) => setAnchorMenu(event.currentTarget)}>Config</Button>
                </Stack>}>
            </CardHeader>
                <CardContent sx={{flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, p: 0, '&:last-child': { pb: 0 } }}>
                    <Box ref={pinocchioBoxRef} sx={{ display:'flex', flexDirection:'column', width:'100%', overflowY:'auto', flexGrow:1, height: `calc(100vh - ${pinocchioBoxTop}px - 16px)`}} onScroll={handleScroll}>
                    <Box sx={{ flex:1, overflowY: 'auto', ml:1, mr:1 }}>
                        { showContent() }
                    </Box>
                </Box>
            </CardContent>
        </Card>}
        { showConfigTrigger && <PinocchioConfigTrigger pinocchioConfig={pinocchioData.config} toolsAvailable={pinocchioData.toolsAvailable.map(t => t.name)} onClose={pinocchioConfigClose} />}
        { showConfigLlm && <AiConfigLlm llms={pinocchioData.config.llms} providers={pinocchioData.providers} onClose={aiConfigLlmClose} />}
        { showConfigProvider && <AiConfigProvider providers={pinocchioData.providers} providersAvailable={pinocchioData.providersAvailable} onClose={pinocchioConfigProviderClose} />}
        { showPlayground && <PinocchioPlayground pinocchioConfig={pinocchioData.config} toolsAvailable={pinocchioData.toolsAvailable} accessString={props.channelObject.accessString!} instanceId={props.channelObject.instanceId} webSocket={props.channelObject.webSocket!} clusterUrl={props.channelObject.clusterUrl!} content={pinocchioData.content} onClose={pinocchioPlaygroundClose} onStateChange={pinocchioPlaygroundStateChange} />}
        { showImportExport && <PinocchioImportExport providers={pinocchioData.providers} config={pinocchioData.config} onClose={pinocchioImportExportClose} />}
        { anchorMenu && <MenuConfig anchorParent={anchorMenu} providers={pinocchioData.providers} pinocchioConfig={pinocchioData.config} onAction={onConfigAction} onClose={() => setAnchorMenu(undefined)} />}
    </>
}
export { PinocchioTabContent }
