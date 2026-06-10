import { useEffect, useRef, useState } from 'react'
import { Box, Button, Card, CardContent, CardHeader, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from '@mui/material'
import { IPinocchioData } from './PinocchioData'
import { Info } from '@mui/icons-material'
import { EPinocchioCommand, IAnalysis, IConfigTrigger, IFinding, IMessage, IPinocchioConfig, IPinocchioMessage, IPlaygroundState } from './PinocchioConfig'
import { PinocchioConfigTrigger } from './PinocchioConfigTrigger'
import { EInstanceMessageAction, EInstanceMessageFlow, EInstanceMessageType } from '@kwirthmagnify/kwirth-common'
import { AiConfigLlm, AiConfigProvider } from '@kwirthmagnify/kwirth-common-ai/front'
import { ILlm, ILlmProvider } from '@kwirthmagnify/kwirth-common-ai'
import React from 'react'
import { MenuConfig } from './MenuConfig'
import { PinocchioImportExport } from './PinocchioImportExport'
import { PinocchioPlayground } from './PinocchioPlayground'
import { IChannelObject, MarkdownViewer } from '@kwirthmagnify/kwirth-common-front'

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
    const playgroundStartIndex = useRef<number | null>(null)
    const [showConfigTrigger, setShowConfigTrigger] = useState(false)
    const [showConfigLlm, setShowConfigLlm] = useState(false)
    const [showConfigProvider, setShowConfigProvider] = useState(false)
    const [showImportExport, setShowImportExport] = useState(false)
    const [anchorMenu, setAnchorMenu] = useState<Element | undefined>(undefined)
    const [reportContent, setReportContent] = useState<string | null>(null)
    const [selectedFinding, setSelectedFinding] = useState<IFinding | null>(null)
    const [selectedAnalysis, setSelectedAnalysis] = useState<IAnalysis | null>(null)
    const [showClearDialog, setShowClearDialog] = useState(false)
    const [, forceUpdate] = useState(0)
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
    }, [pinocchioData.content.length])

    const color = (level:string) => {
        if (level==='low') return 'gray'
        if (level==='medium') return 'green'
        if (level==='high') return 'orange'
        if (level==='critical') return 'red'
    }

    const showContent = () => {
        if (!pinocchioData || !pinocchioData.content) return <></>
        const visibleContent = (playgroundStartIndex.current !== null
            ? pinocchioData.content.slice(0, playgroundStartIndex.current)
            : pinocchioData.content
        ).filter(item => !(item as IMessage).playground)
        return (<>
            {visibleContent.map((item, index) => {
                if (typeof item !== 'string' && ('findings' in item || 'report' in item)) {
                    let analysis = item as IAnalysis
                    return (
                        <React.Fragment key={index}>
                            {analysis.text && (
                                <Stack direction='row' alignItems='center' sx={{ mt: 2 }}>
                                    <Typography variant='body1' sx={{ flex: 1 }}>
                                        {new Date(analysis.timestamp).toISOString()} {analysis.text}
                                    </Typography>
                                    <Button size='small' variant='outlined' disabled={!analysis.report} onClick={() => setReportContent(analysis.report ?? null)}>Report</Button>
                                </Stack>
                            )}

                            {analysis.findings && [...analysis.findings]
                                .sort((a, b) => priorityOrder[a.level] - priorityOrder[b.level])
                                .map((f, fIndex) => {
                                    let description = f.description
                                    if (description.includes(' **') && description.includes('** ')) description=description.replace(' **', ' <b><u>').replace('** ', '</u></b> ')
                                    return (
                                        <Stack key={fIndex} direction={'row'} alignItems={'center'} onClick={() => setSelectedFinding(f)} sx={{ cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' }, borderRadius: 1 }}>
                                            <Box sx={{ width: '70px', flexShrink: 0 }}>
                                                <Typography variant='body2' sx={{ backgroundColor: color(f.level), display: 'inline-block', p: 0.5, borderRadius: '4px' }}>
                                                    {f.level}
                                                </Typography>
                                            </Box>
                                            <Typography component={'div'} variant='body2'><div dangerouslySetInnerHTML={{__html: description}}/></Typography>
                                        </Stack>
                                    );
                                })}
                            {(analysis.pss_current || analysis.score_summary || analysis.global_risk) && (
                                <Stack direction='row' alignItems='center' gap={2} onClick={() => setSelectedAnalysis(analysis)} sx={{ mt: 0.5, ml: '70px', px: 1, py: 0.5, bgcolor: 'rgba(128,128,128,0.08)', border: '1px solid rgba(128,128,128,0.2)', borderRadius: '6px', opacity: 0.85, alignSelf: 'flex-start', cursor: 'pointer', '&:hover': { bgcolor: 'rgba(128,128,128,0.15)' } }}>
                                    {analysis.pss_current && <Typography variant='body2'>PSS: <b>{analysis.pss_current}</b>{analysis.pss_target ? ` → ${analysis.pss_target}` : ''}</Typography>}
                                    {analysis.score_summary && (
                                        <Typography variant='body2'>
                                            critical:<b>{analysis.score_summary.critical}</b>&nbsp;
                                            high:<b>{analysis.score_summary.high}</b>&nbsp;
                                            medium:<b>{analysis.score_summary.medium}</b>&nbsp;
                                            low:<b>{analysis.score_summary.low}</b>
                                        </Typography>
                                    )}
                                    {analysis.global_risk && (
                                        <Typography variant='body2' sx={{ backgroundColor: color(analysis.global_risk), display: 'inline-block', px: 0.75, py: 0.25, borderRadius: '4px' }}>
                                            {analysis.global_risk}
                                        </Typography>
                                    )}
                                </Stack>
                            )}
                        </React.Fragment>
                    );
                }
                else {
                    let message = item as IMessage
                    return <React.Fragment key={index}>
                        <Typography variant='body1' sx={{ mt: 2 }}>
                            {new Date(message.timestamp).toISOString()} {message.text}
                        </Typography>
                    </React.Fragment>
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
        if (playgroundStartIndex.current !== null) {
            pinocchioData.content = pinocchioData.content.slice(0, playgroundStartIndex.current)
            playgroundStartIndex.current = null
        }
        setShowPlayground(false)
        if (!newTrigger) return
        const existing = pinocchioData.config.triggers.findIndex(t => t.id === newTrigger.id)
        const triggers = existing >= 0
            ? pinocchioData.config.triggers.map((t, i) => i === existing ? newTrigger : t)
            : [...pinocchioData.config.triggers, newTrigger]
        const updatedConfig: IPinocchioConfig = {
            ...pinocchioData.config,
            triggers
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

    const pinocchioImportExportClose = (config?: IPinocchioConfig) => {
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
                    <Button onClick={() => setShowClearDialog(true)}>Clear</Button>
                    <Button onClick={() => { playgroundStartIndex.current = pinocchioData.content.length; setShowPlayground(true) }}>Playground</Button>
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
        { showConfigTrigger && <PinocchioConfigTrigger pinocchioConfig={pinocchioData.config} toolsAvailable={pinocchioData.toolsAvailable} onClose={pinocchioConfigClose} />}
        { showConfigLlm && <AiConfigLlm llms={pinocchioData.config.llms} providers={pinocchioData.providers} onClose={aiConfigLlmClose} />}
        { showConfigProvider && <AiConfigProvider providers={pinocchioData.providers} providersAvailable={pinocchioData.providersAvailable} onClose={pinocchioConfigProviderClose} />}
        { showPlayground && <PinocchioPlayground pinocchioConfig={pinocchioData.config} toolsAvailable={pinocchioData.toolsAvailable} accessString={props.channelObject.accessString!} instanceId={props.channelObject.instanceId} webSocket={props.channelObject.webSocket!} clusterUrl={props.channelObject.clusterUrl!} content={pinocchioData.content} onClose={pinocchioPlaygroundClose} onStateChange={pinocchioPlaygroundStateChange} />}
        { showImportExport && <PinocchioImportExport config={pinocchioData.config} onClose={pinocchioImportExportClose} />}
        { anchorMenu && <MenuConfig anchorParent={anchorMenu} providers={pinocchioData.providers} pinocchioConfig={pinocchioData.config} onAction={onConfigAction} onClose={() => setAnchorMenu(undefined)} />}
        { showClearDialog && (
            <Dialog open={true} onClose={() => setShowClearDialog(false)} PaperProps={{ sx: { width: '420px', maxWidth: '420px' } }}>
                <DialogTitle>Clear findings</DialogTitle>
                <DialogContent>
                    <Typography variant='body2' sx={{ mb: 1 }}><b>Clear my view</b> — removes what you see here. The back keeps its analyses and will send them again if you reconnect.</Typography>
                    <Typography variant='body2'><b>Clear back</b> — deletes all analyses stored in the channel. Affects all connected fronts.</Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => {
                        pinocchioData.content = [{ timestamp: Date.now(), text: 'Findings cleared' } as IMessage]
                        forceUpdate(n => n + 1)
                        setShowClearDialog(false)
                    }}>Clear my view</Button>
                    <Button color='warning' onClick={() => {
                        pinocchioData.content = [{ timestamp: Date.now(), text: 'Back analyses cleared' } as IMessage]
                        forceUpdate(n => n + 1)
                        const msg: IPinocchioMessage = {
                            channel: 'pinocchio',
                            msgtype: 'pinocchiomessage',
                            id: '1',
                            accessKey: props.channelObject.accessString!,
                            instance: props.channelObject.instanceId,
                            command: EPinocchioCommand.CLEARBACK,
                            action: EInstanceMessageAction.COMMAND,
                            flow: EInstanceMessageFlow.REQUEST,
                            type: EInstanceMessageType.DATA,
                        }
                        props.channelObject.webSocket?.send(JSON.stringify(msg))
                        setShowClearDialog(false)
                    }}>Clear back</Button>
                    <Button onClick={() => setShowClearDialog(false)}>Cancel</Button>
                </DialogActions>
            </Dialog>
        )}
        { selectedAnalysis !== null && (
            <Dialog open={true} onClose={() => setSelectedAnalysis(null)} PaperProps={{ sx: { width: '60vw', maxWidth: '860px', maxHeight: '80vh' } }}>
                <DialogTitle>
                    {selectedAnalysis.resource
                        ? `${selectedAnalysis.resource.kind} / ${selectedAnalysis.resource.name}`
                        : 'Analysis detail'}
                </DialogTitle>
                <DialogContent dividers sx={{ display: 'flex', flexDirection: 'row', gap: 3, alignItems: 'flex-start' }}>
                    <Stack sx={{ flex: 1, gap: 1.5 }}>
                        {selectedAnalysis.resource && <>
                            <Box>
                                <Typography variant='caption' sx={{ opacity: 0.6 }}>Kind</Typography>
                                <Typography variant='body2'>{selectedAnalysis.resource.kind}</Typography>
                            </Box>
                            <Box>
                                <Typography variant='caption' sx={{ opacity: 0.6 }}>Name</Typography>
                                <Typography variant='body2'>{selectedAnalysis.resource.name}</Typography>
                            </Box>
                            <Box>
                                <Typography variant='caption' sx={{ opacity: 0.6 }}>Namespace</Typography>
                                <Typography variant='body2'>{selectedAnalysis.resource.namespace}</Typography>
                            </Box>
                            {selectedAnalysis.resource.images?.length ? (
                                <Box>
                                    <Typography variant='caption' sx={{ opacity: 0.6 }}>Images</Typography>
                                    {selectedAnalysis.resource.images.map((img, i) => (
                                        <Typography key={i} variant='body2' sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{img}</Typography>
                                    ))}
                                </Box>
                            ) : null}
                        </>}
                        {selectedAnalysis.pss_current && (
                            <Box>
                                <Typography variant='caption' sx={{ opacity: 0.6 }}>PSS current</Typography>
                                <Typography variant='body2'>{selectedAnalysis.pss_current}</Typography>
                            </Box>
                        )}
                        {selectedAnalysis.pss_target && (
                            <Box>
                                <Typography variant='caption' sx={{ opacity: 0.6 }}>PSS target</Typography>
                                <Typography variant='body2'>{selectedAnalysis.pss_target}</Typography>
                            </Box>
                        )}
                        {selectedAnalysis.global_risk && (
                            <Box>
                                <Typography variant='caption' sx={{ opacity: 0.6, display: 'block' }}>Global risk</Typography>
                                <Typography variant='body2' sx={{ backgroundColor: color(selectedAnalysis.global_risk), display: 'inline-block', px: 0.75, py: 0.25, borderRadius: '4px' }}>
                                    {selectedAnalysis.global_risk}
                                </Typography>
                            </Box>
                        )}
                        {selectedAnalysis.score_summary && (
                            <Box>
                                <Typography variant='caption' sx={{ opacity: 0.6 }}>Score summary</Typography>
                                {(['critical', 'high', 'medium', 'low'] as const).map(lvl => (
                                    <Typography key={lvl} variant='body2'>
                                        <Typography component='span' variant='body2' sx={{ backgroundColor: color(lvl), display: 'inline-block', px: 0.5, borderRadius: '4px', mr: 1, minWidth: '60px', textAlign: 'center' }}>{lvl}</Typography>
                                        {selectedAnalysis.score_summary![lvl]}
                                    </Typography>
                                ))}
                            </Box>
                        )}
                    </Stack>
                    <Stack sx={{ flex: 1, gap: 1.5 }}>
                        {selectedAnalysis.controls_passed?.length ? (
                            <Box>
                                <Typography variant='caption' sx={{ opacity: 0.6 }}>Controls passed</Typography>
                                {selectedAnalysis.controls_passed.map((c, i) => (
                                    <Typography key={i} variant='body2'>{c}</Typography>
                                ))}
                            </Box>
                        ) : null}
                        {selectedAnalysis.not_visible?.length ? (
                            <Box>
                                <Typography variant='caption' sx={{ opacity: 0.6 }}>Not visible</Typography>
                                {selectedAnalysis.not_visible.map((s, i) => (
                                    <Typography key={i} variant='body2'>{s}</Typography>
                                ))}
                            </Box>
                        ) : null}
                        {selectedAnalysis.next_steps?.length ? (
                            <Box>
                                <Typography variant='caption' sx={{ opacity: 0.6 }}>Next steps</Typography>
                                {selectedAnalysis.next_steps.map((s, i) => (
                                    <Typography key={i} variant='body2'>{i + 1}. {s}</Typography>
                                ))}
                            </Box>
                        ) : null}
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setSelectedAnalysis(null)}>Close</Button>
                </DialogActions>
            </Dialog>
        )}
        { selectedFinding !== null && (
            <Dialog open={true} onClose={() => setSelectedFinding(null)} PaperProps={{ sx: { width: '60vw', maxWidth: '860px', maxHeight: '80vh' } }}>
                <DialogTitle>
                    <Stack direction='row' alignItems='center' gap={1}>
                        <Typography variant='body2' sx={{ backgroundColor: color(selectedFinding.level), display: 'inline-block', p: 0.5, borderRadius: '4px', flexShrink: 0 }}>
                            {selectedFinding.level}
                        </Typography>
                        <Typography variant='h6'>{selectedFinding.control_name}</Typography>
                    </Stack>
                </DialogTitle>
                <DialogContent dividers sx={{ display: 'flex', flexDirection: 'row', gap: 3, alignItems: 'flex-start' }}>
                    <Stack sx={{ flex: 1, gap: 1.5 }}>
                        {[
                            { label: 'Control ID',  value: selectedFinding.control_id },
                            { label: 'Category',    value: selectedFinding.category },
                            { label: 'Confidence',  value: selectedFinding.confidence },
                            { label: 'Risk score',  value: selectedFinding.risk_score != null ? String(selectedFinding.risk_score) : undefined },
                            { label: 'Description', value: selectedFinding.description },
                            { label: 'Evidence',    value: selectedFinding.evidence },
                            { label: 'Impact',      value: selectedFinding.impact },
                        ].filter(({ value }) => value != null).map(({ label, value }) => (
                            <Box key={label}>
                                <Typography variant='caption' sx={{ opacity: 0.6 }}>{label}</Typography>
                                <Typography variant='body2'>{value}</Typography>
                            </Box>
                        ))}
                    </Stack>
                    {(selectedFinding.remediation || selectedFinding.references?.length) && (
                        <Stack sx={{ flex: 1, gap: 1.5 }}>
                            {selectedFinding.remediation && (
                                <Box>
                                    <Typography variant='caption' sx={{ opacity: 0.6 }}>Remediation</Typography>
                                    <Typography variant='body2'>{selectedFinding.remediation}</Typography>
                                </Box>
                            )}
                            {selectedFinding.references?.length ? (
                                <Box>
                                    <Typography variant='caption' sx={{ opacity: 0.6 }}>References</Typography>
                                    {selectedFinding.references.map((r, i) => (
                                        <Typography key={i} variant='body2'>{r}</Typography>
                                    ))}
                                </Box>
                            ) : null}
                        </Stack>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setSelectedFinding(null)}>Close</Button>
                </DialogActions>
            </Dialog>
        )}
        { reportContent !== null && (
            <Dialog open={true} onClose={() => setReportContent(null)} PaperProps={{ sx: { width: '60vw', maxWidth: '900px', maxHeight: '70vh' } }}>
                <DialogTitle>Report</DialogTitle>
                <DialogContent sx={{ pt: 2, px: 3, pb: 1 }}>
                    <MarkdownViewer content={reportContent} />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setReportContent(null)}>Close</Button>
                </DialogActions>
            </Dialog>
        )}
    </>
}
export { PinocchioTabContent }
