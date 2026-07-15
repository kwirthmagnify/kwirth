import React, { useEffect, useRef, useState } from 'react'
import { Box, Checkbox, CircularProgress, Chip, DialogContent, DialogTitle, Divider, FormControlLabel, IconButton, InputAdornment, Stack, TextField, Tooltip, Typography } from '@mui/material'
import { Launch, Search, Stop } from '@kwirthmagnify/kwirth-common-front/icons'
import { ResizableDialog, IResizableDialogHandle } from './ResizableDialog'
import { WindowTitleButtons } from './WindowTitleButtons'
import { IContentWindow } from '../MagnifyTabContent'
import { IMagnifyData, ILogSearchResult, EMagnifyCommand } from '../MagnifyData'
import { EInstanceMessageAction, EInstanceMessageFlow, EInstanceMessageType } from '@kwirthmagnify/kwirth-common'
import { IChannelObject } from '@kwirthmagnify/kwirth-common-front'
import { v4 as uuid } from 'uuid'
// @ts-ignore
import './ResizableDialog.css'

export interface ILogSearchData {
    namespaces?: string[]
    pods?: string[]
    scopeLabel: string
    onOpenLog: (namespace: string, pod: string, container: string) => void
    clusterName: string
    accessString: string
    instanceId: string
}

export interface ILogSearchPanelProps extends IContentWindow {
    data: ILogSearchData
    channelObject: IChannelObject
    magnifyData: IMagnifyData
}

const LogSearchPanel: React.FC<ILogSearchPanelProps> = (props) => {
    const dialogRef = useRef<IResizableDialogHandle>(null)
    const [query, setQuery] = useState('')
    const [caseSensitive, setCaseSensitive] = useState(false)
    const [useRegex, setUseRegex] = useState(false)
    const [tailLines, setTailLines] = useState(100)
    const [isMaximized, setIsMaximized] = useState(false)
    const [currentSearchId, setCurrentSearchId] = useState<string | null>(null)

    const { magnifyData } = props
    const searching = !magnifyData.logSearchDone
    const results: ILogSearchResult[] = magnifyData.logSearchResults

    const handleSearch = () => {
        if (!query.trim() || !props.channelObject.webSocket) return
        magnifyData.logSearchResults = []
        magnifyData.logSearchDone = false

        const searchId = uuid()
        setCurrentSearchId(searchId)
        const payload = JSON.stringify({ query, namespaces: props.data.namespaces, pods: props.data.pods, tailLines, caseSensitive, useRegex })
        const msg = {
            flow: EInstanceMessageFlow.REQUEST,
            action: EInstanceMessageAction.COMMAND,
            channel: props.channelObject.channelId,
            type: EInstanceMessageType.DATA,
            accessKey: props.data.accessString,
            instance: props.data.instanceId,
            id: searchId,
            command: EMagnifyCommand.LOGSEARCH,
            namespace: '', group: '', pod: '', container: '',
            params: [payload],
            msgtype: 'magnifymessage'
        }
        props.channelObject.webSocket.send(JSON.stringify(msg))
    }

    const handleStopSearch = () => {
        if (!currentSearchId || !props.channelObject.webSocket) return
        const msg = {
            flow: EInstanceMessageFlow.REQUEST,
            action: EInstanceMessageAction.COMMAND,
            channel: props.channelObject.channelId,
            type: EInstanceMessageType.DATA,
            accessKey: props.data.accessString,
            instance: props.data.instanceId,
            id: uuid(),
            command: EMagnifyCommand.LOGSEARCH_STOP,
            namespace: '', group: '', pod: '', container: '',
            params: [JSON.stringify({ searchId: currentSearchId })],
            msgtype: 'magnifymessage'
        }
        props.channelObject.webSocket.send(JSON.stringify(msg))
        magnifyData.logSearchDone = true
        setCurrentSearchId(null)
    }

    useEffect(() => {
        return () => {
            if (currentSearchId && props.channelObject.webSocket) {
                const msg = {
                    flow: EInstanceMessageFlow.REQUEST,
                    action: EInstanceMessageAction.COMMAND,
                    channel: props.channelObject.channelId,
                    type: EInstanceMessageType.DATA,
                    accessKey: props.data.accessString,
                    instance: props.data.instanceId,
                    id: uuid(),
                    command: EMagnifyCommand.LOGSEARCH_STOP,
                    namespace: '', group: '', pod: '', container: '',
                    params: [JSON.stringify({ searchId: currentSearchId })],
                    msgtype: 'magnifymessage'
                }
                props.channelObject.webSocket.send(JSON.stringify(msg))
            }
        }
    }, [currentSearchId])

    const openContainer = (r: ILogSearchResult) => {
        props.data.onOpenLog(r.namespace, r.pod, r.container)
    }

    const handleIsMaximized = () => { props.onWindowChange(props.id, !isMaximized, props.x, props.y, props.width, props.height); setIsMaximized(!isMaximized) }
    const handleSnap = (position: 'left' | 'right') => { setIsMaximized(false); dialogRef.current?.snapTo(position) }

    return (
        <ResizableDialog ref={dialogRef} id={props.id} x={props.x} y={props.y} width={props.width} height={props.height}
            isMaximized={isMaximized} isActive={props.atFront} onFocus={props.onFocus} onWindowChange={props.onWindowChange}>
            <DialogTitle sx={{ cursor: isMaximized ? 'default' : 'move', py: 1 }} id='draggable-dialog-title'>
                <Stack direction='row' alignItems='center'>
                    <Search fontSize='small' sx={{ color: 'text.secondary', mr: 1 }} />
                    <Typography variant='body2' fontWeight={500} flex={1}>Log Search — {props.data.scopeLabel}</Typography>
                    <WindowTitleButtons id={props.id} atTop={props.atTop} isMaximized={isMaximized}
                        onMinimize={() => props.onMinimize(props.id)} onTop={() => props.onTop(props.id)}
                        onMaximize={handleIsMaximized} onClose={() => props.onClose(props.id)} onSnap={handleSnap} />
                </Stack>
            </DialogTitle>

            <DialogContent sx={{ display: 'flex', flexDirection: 'column', p: 1, gap: 1, overflow: 'hidden', height: '100%' }}>
                {/* Search bar */}
                <Stack direction='row' spacing={1} alignItems='center'>
                    <TextField
                        size='small' fullWidth placeholder='Search in logs…'
                        value={query} onChange={e => setQuery(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleSearch(); if (e.key==='Escape') props.onClose(props.id) }}
                        slotProps={{ input: { endAdornment: (
                            <InputAdornment position='end'>
                                <IconButton size='small' onClick={handleSearch} disabled={searching || !query.trim()}>
                                    {searching ? <CircularProgress size={16} /> : <Search fontSize='small' />}
                                </IconButton>
                            </InputAdornment>
                        ) } }}
                    />
                </Stack>
                <Stack direction='row' spacing={1} alignItems='center'>
                    <FormControlLabel control={<Checkbox size='small' checked={caseSensitive} onChange={e => setCaseSensitive(e.target.checked)} />} label={<Typography variant='caption'>Case</Typography>} sx={{ mr: 0 }} />
                    <FormControlLabel control={<Checkbox size='small' checked={useRegex} onChange={e => setUseRegex(e.target.checked)} />} label={<Typography variant='caption'>Regex</Typography>} sx={{ mr: 0 }} />
                    <TextField size='small' type='number' label='Lines' value={tailLines} onChange={e => setTailLines(Math.min(500, +e.target.value))}
                        sx={{ width: 90 }} slotProps={{ htmlInput: { min: 1, max: 500, style: { padding: '4px 8px', fontSize: '0.75rem' } } }} />
                    <Tooltip title='Stop search'>
                        <span>
                            <IconButton size='small' onClick={handleStopSearch} disabled={!searching}>
                                <Stop fontSize='small' color={searching ? 'error' : 'disabled'} />
                            </IconButton>
                        </span>
                    </Tooltip>
                    {searching && <Typography variant='caption' color='text.secondary'>Searching…</Typography>}
                    {magnifyData.logSearchDone && results.length > 0 && !searching &&
                        <Chip label={`${results.length} container${results.length > 1 ? 's' : ''} with matches`} size='small' color='primary' variant='outlined' />}
                    {magnifyData.logSearchDone && results.length === 0 && !searching && query &&
                        <Typography variant='caption' color='text.secondary'>No matches found.</Typography>}
                </Stack>

                <Divider />

                {/* Results */}
                <Box sx={{ flex: 1, overflowY: 'auto' }}>
                    {results.map((r, ri) => (
                        <Box key={ri} sx={{ mb: 1.5 }}>
                            <Stack direction='row' alignItems='center' spacing={0.5} sx={{ mb: 0.5 }}>
                                <Typography variant='caption' fontWeight={600} sx={{ fontFamily: 'monospace', color: 'primary.main' }}>
                                    {r.namespace}/{r.pod}
                                </Typography>
                                <Chip label={r.container} size='small' variant='outlined' sx={{ height: 16, fontSize: '9px', '& .MuiChip-label': { px: 0.5 } }} />
                                <Chip label={`${r.lines.length} line${r.lines.length > 1 ? 's' : ''}`} size='small' sx={{ height: 16, fontSize: '9px', '& .MuiChip-label': { px: 0.5 } }} />
                                <Tooltip title='Open log'>
                                    <IconButton size='small' sx={{ p: 0 }} onClick={() => openContainer(r)}>
                                        <Launch sx={{ fontSize: 12 }} />
                                    </IconButton>
                                </Tooltip>
                            </Stack>
                            {r.lines.map((line, li) => (
                                <Typography key={li} variant='caption' display='block' sx={{ fontFamily: 'monospace', fontSize: '10px', pl: 1, color: 'text.secondary', wordBreak: 'break-all', borderLeft: '2px solid', borderColor: 'divider', mb: 0.25 }}>
                                    {line}
                                </Typography>
                            ))}
                        </Box>
                    ))}
                </Box>
            </DialogContent>
        </ResizableDialog>
    )
}

export { LogSearchPanel }
