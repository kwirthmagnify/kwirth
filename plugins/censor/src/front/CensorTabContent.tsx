import React, { useEffect, useRef, useState } from 'react'
import { Box, Button, Card, CardContent, CardHeader, Chip, Divider, FormControl, FormControlLabel, IconButton, List, ListItem, ListItemText, Menu, MenuItem, Select, Stack, Switch, Tab, Tabs, Tooltip, Typography } from '@mui/material'
import { Add as AddIcon, ArrowDownward, ArrowUpward, DeleteOutline as DeleteOutlineIcon, DeleteSweep, Download as DownloadIcon, MoreVert as MoreVertIcon, SwapVert } from '@mui/icons-material'
import { cleanANSI, IContentProps, MiniGauge } from '@kwirthmagnify/kwirth-common-front'
import { AiConfigLlm, AiConfigProvider } from '@kwirthmagnify/kwirth-common-ai/front'
import { ILlm, ILlmProvider } from '@kwirthmagnify/kwirth-common-ai'
import { EInstanceMessageAction, EInstanceMessageFlow, EInstanceMessageType } from '@kwirthmagnify/kwirth-common'
import { ICensorData, ICensorUiState, IRunnerData, ECensorTab } from './CensorData'
import { ECensorCommand, ERegexOrigin } from './CensorConfig'
import { CensorConfigDialog } from './CensorConfigDialog'
import { CensorAddRegexDialog } from './CensorAddRegexDialog'

const aggregateRunners = (runners: Map<string, IRunnerData>): IRunnerData => {
    const all = [...runners.values()]
    const seen = new Set<string>()
    return {
        analyzing: all.some(r => r.analyzing),
        regexes: all.flatMap(r => r.regexes).filter(r => { if (seen.has(r.pattern)) return false; seen.add(r.pattern); return true }),
        processedCount: all.reduce((s, r) => s + r.processedCount, 0),
        llmCount: all.reduce((s, r) => s + r.llmCount, 0),
        llmLinesCount: all.reduce((s, r) => s + r.llmLinesCount, 0),
        totalBytesProcessed: all.reduce((s, r) => s + r.totalBytesProcessed, 0),
        tokensIn: all.reduce((s, r) => s + r.tokensIn, 0),
        tokensOut: all.reduce((s, r) => s + r.tokensOut, 0),
        pendingCount: all.reduce((s, r) => s + r.pendingCount, 0),
        llmWarningLines: all.flatMap(r => r.llmWarningLines),
        llmInputLines: all.flatMap(r => r.llmInputLines),
        llmOutputLines: all.flatMap(r => r.llmOutputLines),
        llmErrorLines: all.flatMap(r => r.llmErrorLines),
        allTags: [...new Set(all.flatMap(r => r.allTags))],
    }
}

const _defaultUi = (): ICensorUiState => ({
    tab: ECensorTab.Objects, regexSort: 'none',
    autoScrolls: { regex: true, received: true, business: true, llmInput: true, llmOutput: true, warning: true, llmError: true }
})
const formatPerfValue = (v: number) => v >= 10000 ? `${(v / 1000).toFixed(0)}k` : v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)

const REFRESH_INTERVAL_MS = 250

const CensorTabContent: React.FC<IContentProps> = (props: IContentProps) => {
    const data: ICensorData = props.channelObject.data
    const contentRef = useRef<HTMLDivElement>(null)
    const [contentTop, setContentTop] = useState(0)
    const [, forceUpdate] = useState(0)
    const [selectedRunnerKey, setSelectedRunnerKey] = useState<string>('')
    const rd = data.runners.size === 0 ? null
        : selectedRunnerKey && data.runners.has(selectedRunnerKey)
            ? data.runners.get(selectedRunnerKey)!
            : aggregateRunners(data.runners)
    useEffect(() => {
        const id = setInterval(() => forceUpdate(v => v + 1), REFRESH_INTERVAL_MS)
        return () => clearInterval(id)
    }, [])
    const prevContentTopRef = useRef(0)
    const peakProcessedRef = useRef(10)
    const peakTkInRef = useRef(100)
    const peakTkOutRef = useRef(100)
    const peakLlmLinesRef = useRef(10)

    // Restore UI state from channelObject.data so it survives tab switches
    const _ui = data.uiState
    const [tab, setTabState] = useState<ECensorTab>(_ui?.tab ?? ECensorTab.Objects)
    const setTab = (v: ECensorTab) => { setTabState(v); data.uiState = { ...(data.uiState ?? _defaultUi()), tab: v } }
    const perfSamplesRef = useRef<{ ts: number, count: number, tokensIn: number, tokensOut: number, llmLines: number }[]>([])
    const [msgsPerSec, setMsgsPerSec] = useState(0)
    const [msgsPerMin, setMsgsPerMin] = useState(0)
    const [tokensInPerSec, setTokensInPerSec] = useState(0)
    const [tokensInPerMin, setTokensInPerMin] = useState(0)
    const [tokensOutPerSec, setTokensOutPerSec] = useState(0)
    const [tokensOutPerMin, setTokensOutPerMin] = useState(0)
    const [llmLinesPerSec, setLlmLinesPerSec] = useState(0)
    const [llmLinesPerMin, setLlmLinesPerMin] = useState(0)
    useEffect(() => {
        const now = Date.now()
        const samples = perfSamplesRef.current
        samples.push({ ts: now, count: rd?.processedCount ?? 0, tokensIn: rd?.tokensIn ?? 0, tokensOut: rd?.tokensOut ?? 0, llmLines: rd?.llmLinesCount ?? 0 })
        if (samples.length > 120) samples.splice(0, samples.length - 120)
        const calcRate = (windowMs: number, scaleToMin: boolean, field: 'count' | 'tokensIn' | 'tokensOut' | 'llmLines') => {
            const w = samples.filter(s => now - s.ts < windowMs)
            if (w.length < 2) return 0
            const dt = (w[w.length - 1].ts - w[0].ts) / 1000
            if (dt === 0) return 0
            const rate = (w[w.length - 1][field] - w[0][field]) / dt
            return Math.round(scaleToMin ? rate * 60 : rate)
        }
        setMsgsPerSec(calcRate(10000, false, 'count'))
        setMsgsPerMin(calcRate(60000, true, 'count'))
        setTokensInPerSec(calcRate(10000, false, 'tokensIn'))
        setTokensInPerMin(calcRate(60000, true, 'tokensIn'))
        setTokensOutPerSec(calcRate(10000, false, 'tokensOut'))
        setTokensOutPerMin(calcRate(60000, true, 'tokensOut'))
        setLlmLinesPerSec(calcRate(10000, false, 'llmLines'))
        setLlmLinesPerMin(calcRate(60000, true, 'llmLines'))
    }, [rd?.processedCount, rd?.tokensIn, rd?.tokensOut, rd?.llmLinesCount])
    const [showConfig, setShowConfig] = useState(false)
    const [showConfigLlm, setShowConfigLlm] = useState(false)
    const [showConfigProvider, setShowConfigProvider] = useState(false)
    const [addRegexState, setAddRegexState] = useState<{ runnerKey?: string, pattern?: string, explanation?: string, lockRunner?: boolean } | null>(null)
    const [activeTagFilters, setActiveTagFilters] = useState<string[]>([])
    const [tagFilterAnd, setTagFilterAnd] = useState(false)
    const [businessAutoScroll, setBusinessAutoScrollState] = useState(_ui?.autoScrolls?.business ?? true)
    const [regexAutoScroll, setRegexAutoScrollState] = useState(_ui?.autoScrolls?.regex ?? true)
    const [regexSort, setRegexSortState] = useState<'asc' | 'desc' | 'none'>(_ui?.regexSort ?? 'none')
    const [receivedAutoScroll, setReceivedAutoScrollState] = useState(_ui?.autoScrolls?.received ?? true)
    const [llmInputAutoScroll, setLlmInputAutoScrollState] = useState(_ui?.autoScrolls?.llmInput ?? true)
    const [llmOutputAutoScroll, setLlmOutputAutoScrollState] = useState(_ui?.autoScrolls?.llmOutput ?? true)
    const [warningAutoScroll, setWarningAutoScrollState] = useState(_ui?.autoScrolls?.warning ?? true)
    const [llmErrorAutoScroll, setLlmErrorAutoScrollState] = useState(_ui?.autoScrolls?.llmError ?? true)

    const _saveAs = (key: keyof ICensorUiState['autoScrolls'], val: boolean) => {
        const cur = data.uiState ?? _defaultUi()
        data.uiState = { ...cur, autoScrolls: { ...cur.autoScrolls, [key]: val } }
    }
    const setBusinessAutoScroll  = (v: boolean) => { setBusinessAutoScrollState(v);  _saveAs('business', v) }
    const setRegexAutoScroll     = (v: boolean) => { setRegexAutoScrollState(v);     _saveAs('regex', v) }
    const setReceivedAutoScroll  = (v: boolean) => { setReceivedAutoScrollState(v);  _saveAs('received', v) }
    const setLlmInputAutoScroll  = (v: boolean) => { setLlmInputAutoScrollState(v);  _saveAs('llmInput', v) }
    const setLlmOutputAutoScroll = (v: boolean) => { setLlmOutputAutoScrollState(v); _saveAs('llmOutput', v) }
    const setWarningAutoScroll   = (v: boolean) => { setWarningAutoScrollState(v);   _saveAs('warning', v) }
    const setLlmErrorAutoScroll  = (v: boolean) => { setLlmErrorAutoScrollState(v);  _saveAs('llmError', v) }
    const setRegexSort = (fn: (s: 'asc'|'desc'|'none') => 'asc'|'desc'|'none') => {
        setRegexSortState(prev => { const v = fn(prev); data.uiState = { ...(data.uiState ?? _defaultUi()), regexSort: v }; return v })
    }
    const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null)
    useEffect(() => {
        if (selectedRunnerKey !== '' && !data.runners.has(selectedRunnerKey)) {
            setSelectedRunnerKey('')
        }
    }, [data.runners.size])

    useEffect(() => {
        if (contentRef.current) {
            const top = contentRef.current.getBoundingClientRect().top
            if (top !== prevContentTopRef.current) { prevContentTopRef.current = top; setContentTop(top) }
        }
    })

    useEffect(() => {
        if (!contentRef.current) return
        const shouldScroll =
            (tab === ECensorTab.Regex && regexAutoScroll) ||
            (tab === ECensorTab.Logstream && receivedAutoScroll) ||
            (tab === ECensorTab.Business && businessAutoScroll) ||
            (tab === ECensorTab.LlmInput && llmInputAutoScroll) ||
            (tab === ECensorTab.LlmResponses && llmOutputAutoScroll) ||
            (tab === ECensorTab.Issues && warningAutoScroll) ||
            (tab === ECensorTab.LlmErrors && llmErrorAutoScroll)
        if (!shouldScroll) return
        contentRef.current.scrollTop = contentRef.current.scrollHeight
    }, [data.runners.get(selectedRunnerKey)?.regexes.length, data.receivedLines.length, data.runners.get(selectedRunnerKey)?.llmInputLines.length, data.runners.get(selectedRunnerKey)?.llmOutputLines.length, data.runners.get(selectedRunnerKey)?.llmWarningLines.length, data.runners.get(selectedRunnerKey)?.llmErrorLines.length, data.businessLines.length, tab, regexAutoScroll, receivedAutoScroll, llmInputAutoScroll, llmOutputAutoScroll, warningAutoScroll, llmErrorAutoScroll, businessAutoScroll])

    const sendCommand = (command: ECensorCommand, payload?: unknown) => {
        if (!props.channelObject.instanceId) return
        props.channelObject.webSocket?.send(JSON.stringify({
            msgtype: 'censormessage',
            channel: 'censor',
            action: EInstanceMessageAction.COMMAND,
            flow: EInstanceMessageFlow.REQUEST,
            type: EInstanceMessageType.DATA,
            accessKey: props.channelObject.accessString!,
            instance: props.channelObject.instanceId,
            command,
            ...(payload !== undefined ? { data: payload } : {})
        }))
    }

    const openConfig = () => {
        sendCommand(ECensorCommand.CONFIGGET)
        setShowConfig(true)
    }

    // LLM/Provider config manage the shared AI catalog. They live in the ⋮ menu (not inside the config
    // dialog) so their sub-dialogs are not nested under another modal — that nesting tripped MUI's focus
    // trap and blocked typing in the sub-dialog inputs.
    const aiConfigLlmClose = (llms: ILlm[] | undefined) => {
        setShowConfigLlm(false)
        // Persist the shared llm list; spread the active config so the backend does not blank instance.cfg
        if (llms) sendCommand(ECensorCommand.CONFIGSET, { ...data.instanceConfig, _llms: llms })
    }

    const aiConfigProviderClose = (providers: ILlmProvider[] | undefined) => {
        setShowConfigProvider(false)
        if (providers) sendCommand(ECensorCommand.PROVIDERSSET, providers)
    }

    const panelHeight = `calc(100vh - ${contentTop}px - 16px)`
    return <>
        {data.started &&
        <Card sx={{ display: 'flex', flexDirection: 'column', flex: 1, width: '98%', alignSelf: 'center', mt: 1, minHeight: 0 }}>
            <CardHeader title={
                <Stack direction='row' alignItems='center' spacing={1}>
                    <Typography><b>Processed:</b> {rd?.processedCount ?? 0}</Typography>
                    <Typography><b>Pending:</b> {rd?.pendingCount ?? 0}</Typography>
                    <Typography flex={1} />
                    {data.runners.size > 0 && (<>
                        {data.ephemeralSessionName
                            ? <Chip label={data.ephemeralSessionName} size='small' color='default' sx={{ maxWidth: 160 }} />
                            : null
                        }
                        <FormControl size='small' sx={{ width: 255, flexShrink: 0 }}>
                            <Select value={selectedRunnerKey} onChange={e => setSelectedRunnerKey(e.target.value)} displayEmpty
                                sx={{ fontSize: '11px', height: 26 }}>
                                <MenuItem value='' sx={{ fontSize: '12px', fontStyle: 'italic' }}>All configs</MenuItem>
                                {[...data.runners.keys()].map(rk => (
                                    <MenuItem key={rk} value={rk} sx={{ fontSize: '12px', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{rk}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </>)}
                    { data.instanceConfig.name && (
                        <Stack direction='column' alignItems='flex-end' spacing={0}>
                            <Typography variant='caption' color='text.secondary'>
                                {data.instanceConfig.name} (v{data.instanceConfig.version})
                            </Typography>
                            { (() => {
                                const llm = data.llms.find(l => l.id === data.instanceConfig.llmId)
                                return llm ? (
                                    <Typography variant='caption' color='text.disabled' sx={{ fontSize: '10px' }}>
                                        {llm.provider} / {llm.model}
                                    </Typography>
                                ) : null
                            })() }
                        </Stack>
                    )}
                    <Stack direction='column' alignItems='center' spacing={0} sx={{ width: 64 }}>
                        <Switch
                            size='small'
                            checked={(data.instanceConfig?.mode ?? 'inference') === 'audit'}
                            disabled={!data.ephemeralSessionName || (rd?.analyzing ?? false)}
                            onChange={(e) => {
                                const newMode = e.target.checked ? 'audit' : 'inference'
                                data.instanceConfig.mode = newMode
                                forceUpdate(n => n + 1)
                            }}
                        />
                        <Typography variant='caption' sx={{ fontSize: '0.6rem', lineHeight: 1 }}>
                            {data.instanceConfig?.mode ?? 'inference'}
                        </Typography>
                    </Stack>
                    <Button onClick={() => {
                        const isAnalyzing = rd?.analyzing ?? false
                        if (!isAnalyzing) { data.startTime = Date.now(); data.stopTime = undefined }
                        else data.stopTime = Date.now()
                        sendCommand(isAnalyzing ? ECensorCommand.ANALYZESTOP : ECensorCommand.ANALYZESTART)
                    }} color={(rd?.analyzing ?? false) ? 'error' : 'success'} variant='outlined' size='small'
                        disabled={!data.ephemeralSessionName || (!(rd?.analyzing ?? false) && !data.configs.filter(c => c.active).some(c => c.logstreamEnabled || (c.businessSources?.length ?? 0) > 0))}>
                        {(rd?.analyzing ?? false) ? 'Stop' : 'Start'}
                    </Button>
                    <IconButton size='small' onClick={(e) => setMenuAnchor(e.currentTarget)}>
                        <MoreVertIcon fontSize='small' />
                    </IconButton>
                    <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
                        <MenuItem onClick={() => { setMenuAnchor(null); openConfig() }} disabled={!data.ephemeralSessionName}>Config</MenuItem>
                        <Divider />
                        <MenuItem onClick={() => { setMenuAnchor(null); setShowConfigProvider(true) }} disabled={!data.ephemeralSessionName}>AI Providers</MenuItem>
                        <MenuItem onClick={() => { setMenuAnchor(null); setShowConfigLlm(true) }} disabled={!data.ephemeralSessionName}>AI Models</MenuItem>
                    </Menu>
                </Stack>
            } />
            <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, p: 0, '&:last-child': { pb: 0 } }}>
                <Tabs value={tab} onChange={(_, v) => setTab(v)} variant='fullWidth'
                    sx={{ borderBottom: 1, borderColor: 'divider', px: 1, minHeight: 36, '& .MuiTab-root': { minHeight: 36, py: 0.5 } }}>
                    <Tab value={ECensorTab.Objects} label={`Objects (${data.assets.length})`} />
                    <Tab value={ECensorTab.Regex} label={`Regex (${(rd?.regexes ?? []).length})`} />
                    <Tab value={ECensorTab.Logstream} label={`Logstream (${data.receivedLines.length})`} />
                    <Tab value={ECensorTab.Business} label={`Business (${data.businessLines.length})`} />
                    <Tab value={ECensorTab.LlmInput} label={`LLM Input (${(rd?.llmInputLines ?? []).length})`} />
                    <Tab value={ECensorTab.LlmResponses} label={`LLM Responses (${(rd?.llmOutputLines ?? []).length})`} />
                    <Tab value={ECensorTab.Issues} label={`Issues (${(rd?.llmWarningLines ?? []).length})`} />
                    <Tab value={ECensorTab.LlmErrors} label={`LLM Errors (${(rd?.llmErrorLines ?? []).length})`} />
                    <Tab value={ECensorTab.Performance} label='Performance' />
                </Tabs>
                {(tab === ECensorTab.Regex || tab === ECensorTab.Logstream || tab === ECensorTab.Business || tab === ECensorTab.LlmInput || tab === ECensorTab.LlmResponses || tab === ECensorTab.LlmErrors) && (
                    <Box sx={{ display: 'flex', alignItems: 'center', px: 0.5, py: 0.5, borderBottom: 1, borderColor: 'divider' }}>
                        {tab === ECensorTab.Regex && (
                            <>
                            <Tooltip title='Add regex manually'>
                                <IconButton size='small' onClick={() => setAddRegexState({})}>
                                    <AddIcon fontSize='small' />
                                </IconButton>
                            </Tooltip>
                            <Tooltip title={regexSort === 'none' ? 'Sort by matches: no order' : regexSort === 'desc' ? 'Sort by matches: descending' : 'Sort by matches: ascending'}>
                                <IconButton size='small' onClick={() => setRegexSort(s => s === 'none' ? 'desc' : s === 'desc' ? 'asc' : 'none')}>
                                    {regexSort === 'none' ? <SwapVert fontSize='small' sx={{ color: 'text.disabled' }} /> : regexSort === 'desc' ? <ArrowDownward fontSize='small' color='primary' /> : <ArrowUpward fontSize='small' color='primary' />}
                                </IconButton>
                            </Tooltip>
                            </>
                        )}
                        <Box sx={{ flex: 1 }} />
                        {tab === ECensorTab.Regex && (
                            <>
                                <Tooltip title='Download CSV'>
                                    <IconButton size='small' onClick={() => {
                                        const rows = [['matches', 'regex', 'explanation']]
                                        for (const r of (rd?.regexes ?? [])) {
                                            const esc = (s: string) => `"${s.replace(/"/g, '""')}"`
                                            rows.push([String(r.matches ?? 0), esc(r.pattern), esc(r.explanation)])
                                        }
                                        const csv = rows.map(r => r.join(',')).join('\n')
                                        const a = document.createElement('a')
                                        a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
                                        a.download = 'regex.csv'
                                        a.click()
                                        URL.revokeObjectURL(a.href)
                                    }}>
                                        <DownloadIcon fontSize='small' />
                                    </IconButton>
                                </Tooltip>
                                <Tooltip title='Clear'>
                                    <IconButton size='small' onClick={() => { if (rd) rd.regexes = []; forceUpdate(n => n + 1) }}>
                                        <DeleteSweep fontSize='small' />
                                    </IconButton>
                                </Tooltip>
                            </>
                        )}
                        {tab !== ECensorTab.Regex && (
                            <Tooltip title='Clear'>
                                <IconButton size='small' onClick={() => {
                                    if (tab === ECensorTab.Logstream) { data.receivedLines = []; forceUpdate(n => n + 1) }
                                    else if (tab === ECensorTab.Business) { data.businessLines = []; forceUpdate(n => n + 1) }
                                    else if (tab === ECensorTab.LlmInput) { if (rd) rd.llmInputLines = []; forceUpdate(n => n + 1) }
                                    else if (tab === ECensorTab.LlmResponses) { if (rd) rd.llmOutputLines = []; forceUpdate(n => n + 1) }
                                    else if (tab === ECensorTab.LlmErrors) { if (rd) rd.llmErrorLines = []; forceUpdate(n => n + 1) }
                                }}>
                                    <DeleteSweep fontSize='small' />
                                </IconButton>
                            </Tooltip>
                        )}
                        <FormControlLabel
                            control={<Switch size='small'
                                checked={tab === ECensorTab.Regex ? regexAutoScroll : tab === ECensorTab.Logstream ? receivedAutoScroll : tab === ECensorTab.Business ? businessAutoScroll : tab === ECensorTab.LlmInput ? llmInputAutoScroll : tab === ECensorTab.LlmResponses ? llmOutputAutoScroll : llmErrorAutoScroll}
                                onChange={e => { if (tab === ECensorTab.Regex) setRegexAutoScroll(e.target.checked); else if (tab === ECensorTab.Logstream) setReceivedAutoScroll(e.target.checked); else if (tab === ECensorTab.Business) setBusinessAutoScroll(e.target.checked); else if (tab === ECensorTab.LlmInput) setLlmInputAutoScroll(e.target.checked); else if (tab === ECensorTab.LlmResponses) setLlmOutputAutoScroll(e.target.checked); else setLlmErrorAutoScroll(e.target.checked) }} />}
                            label={<Typography variant='caption'>Autoscroll</Typography>}
                            sx={{ ml: 0.5, mr: 0 }} />
                    </Box>
                )}
                {tab === ECensorTab.Issues && (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0.5, px: 0.5, py: 0.5, borderBottom: 1, borderColor: 'divider' }}>
                        {(rd?.allTags ?? []).map(tag => (
                            <Chip key={tag} label={tag} size='small'
                                color={activeTagFilters.includes(tag) ? 'primary' : 'default'}
                                variant={activeTagFilters.includes(tag) ? 'filled' : 'outlined'}
                                onClick={() => setActiveTagFilters(prev =>
                                    prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
                                )}
                                sx={{ fontSize: '10px', height: 20 }} />
                        ))}
                        {(rd?.allTags ?? []).length > 0 && (
                            <FormControlLabel
                                control={<Switch size='small' checked={tagFilterAnd} disabled={activeTagFilters.length < 2} onChange={e => setTagFilterAnd(e.target.checked)} />}
                                label={<Typography variant='caption'>{tagFilterAnd ? 'All' : 'Any'}</Typography>}
                                sx={{ ml: 0.5, mr: 0 }} />
                        )}
                        <Box sx={{ flex: 1 }} />
                        <Tooltip title='Download CSV'>
                            <IconButton size='small' onClick={() => {
                                const rows = [['tags', 'original', 'explanation']]
                                for (const w of (rd?.llmWarningLines ?? [])) {
                                    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`
                                    rows.push([esc(w.tags.join(';')), esc(w.original), esc(w.explanation)])
                                }
                                const csv = rows.map(r => r.join(',')).join('\n')
                                const a = document.createElement('a')
                                a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
                                a.download = 'issues.csv'
                                a.click()
                                URL.revokeObjectURL(a.href)
                            }}>
                                <DownloadIcon fontSize='small' />
                            </IconButton>
                        </Tooltip>
                        <Tooltip title='Clear'>
                            <IconButton size='small' onClick={() => { if (rd) rd.llmWarningLines = []; forceUpdate(n => n + 1) }}>
                                <DeleteSweep fontSize='small' />
                            </IconButton>
                        </Tooltip>
                        <FormControlLabel
                            control={<Switch size='small' checked={warningAutoScroll} onChange={e => setWarningAutoScroll(e.target.checked)} />}
                            label={<Typography variant='caption'>Autoscroll</Typography>}
                            sx={{ ml: 0, mr: 0 }} />
                    </Box>
                )}

                <Box ref={contentRef} sx={{ overflowY: 'auto', height: panelHeight }}>

                    {/* Objects being analyzed */}
                    {tab === ECensorTab.Objects && (
                        data.assets.length === 0
                            ? <Typography variant='caption' color='text.secondary' sx={{ p: 1, display: 'block' }}>No objects currently being analyzed.</Typography>
                            : <List dense disablePadding>
                                {data.assets.map((asset, i) => (
                                    <ListItem key={i} disableGutters sx={{ px: 0.5 }}>
                                        <ListItemText
                                            primary={`${asset.pod} / ${asset.container}`}
                                            secondary={asset.namespace}
                                            primaryTypographyProps={{ variant: 'caption', fontFamily: 'monospace', fontSize: '11px' }}
                                            secondaryTypographyProps={{ variant: 'caption', fontSize: '10px' }} />
                                    </ListItem>
                                ))}
                            </List>
                    )}

                    {/* Regex list */}
                    {tab === ECensorTab.Regex && (() => {
                        const regexes = rd?.regexes ?? []
                        return regexes.length === 0
                            ? <Typography variant='caption' color='text.secondary' sx={{ p: 1, display: 'block' }}>
                                No filters yet. Waiting for first lines...
                            </Typography>
                            : <List dense disablePadding>
                                {[...regexes].sort((a, b) => regexSort === 'desc' ? (b.matches ?? 0) - (a.matches ?? 0) : regexSort === 'asc' ? (a.matches ?? 0) - (b.matches ?? 0) : 0).map((regex, i) => (
                                    <Tooltip key={i} title={regex.explanation || '(no explanation)'} placement='bottom-start' arrow>
                                        <ListItem disableGutters sx={{ px: 0.5 }}>
                                            <IconButton size='small' sx={{ mr: 0.5 }} disabled={!selectedRunnerKey} onClick={() => {
                                                const idx = regexes.findIndex(r => r.pattern === regex.pattern)
                                                if (idx >= 0) regexes.splice(idx, 1)
                                                forceUpdate(n => n + 1)
                                                sendCommand(ECensorCommand.REGEXDELETE, { pattern: regex.pattern, runnerKey: selectedRunnerKey })
                                            }}>
                                                <DeleteOutlineIcon sx={{ fontSize: 14 }} />
                                            </IconButton>
                                            {(() => {
                                                const totalMatches = regexes.reduce((s, r) => s + (r.matches ?? 0), 0)
                                                const pct = totalMatches > 0 ? Math.round(((regex.matches ?? 0) / totalMatches) * 100) : 0
                                                const originLabel = regex.origin === ERegexOrigin.LLM ? 'L' : regex.origin === ERegexOrigin.MANUAL ? 'M' : 'H'
                                                const originColor = regex.origin === ERegexOrigin.LLM ? '#1976d2' : regex.origin === ERegexOrigin.MANUAL ? '#388e3c' : '#f57c00'
                                                return (<>
                                                    <Chip label={regex.matches ?? 1} size='small' variant='outlined'
                                                        sx={{ height: 16, fontSize: '9px', minWidth: 42, mr: 0.5, '& .MuiChip-label': { px: 0.5 } }} />
                                                    <Chip label={`${pct}%`} size='small' variant='outlined' color='primary'
                                                        sx={{ height: 16, fontSize: '9px', minWidth: 36, mr: 0.5, '& .MuiChip-label': { px: 0.5 } }} />
                                                    <Chip label={originLabel} size='small'
                                                        sx={{ height: 16, fontSize: '9px', minWidth: 20, mr: 0.5, bgcolor: originColor, color: '#fff', '& .MuiChip-label': { px: 0.5 } }} />
                                                </>)
                                            })()}
                                            <ListItemText primary={regex.pattern}
                                                primaryTypographyProps={{ variant: 'caption', fontFamily: 'monospace', fontSize: '10px', sx: { wordBreak: 'break-all' } }} />
                                        </ListItem>
                                    </Tooltip>
                                ))}
                            </List>
                    })()}

                    {/* All received lines */}
                    {tab === ECensorTab.Logstream && data.receivedLines.map((line, i) => (
                        <Box key={i} sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5, '&:hover': { bgcolor: 'action.hover' }, px: 0.5, borderRadius: 0.5 }}>
                            <Typography variant='caption' color='text.disabled' sx={{ minWidth: '160px', fontFamily: 'monospace', flexShrink: 0 }}>
                                {line.pod}/{line.container}
                            </Typography>
                            <Typography variant='caption' sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                                {cleanANSI(line.text)}
                            </Typography>
                        </Box>
                    ))}

                    {/* Business events */}
                    {tab === ECensorTab.Business && data.businessLines.map((line, i) => (
                        <Box key={i} sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5, '&:hover': { bgcolor: 'action.hover' }, px: 0.5, borderRadius: 0.5 }}>
                            <Typography variant='caption' color='text.disabled' sx={{ minWidth: '120px', fontFamily: 'monospace', flexShrink: 0 }}>
                                {line.namespace}/{line.pod}
                            </Typography>
                            {data.instanceConfig.addTimestamp && line.timestamp && (
                                <Typography variant='caption' sx={{ minWidth: '80px', fontFamily: 'monospace', flexShrink: 0 }}>
                                    [{line.timestamp.substring(11, 19)}]
                                </Typography>
                            )}
                            <Typography variant='caption' sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                                {line.text}
                            </Typography>
                        </Box>
                    ))}

                    {/* Lines sent to LLM (one block per call) */}
                    {tab === ECensorTab.LlmInput && (rd?.llmInputLines ?? []).map((batch, i) => (
                        <Box key={i} sx={{ mb: 1, p: 1, bgcolor: 'action.hover', borderRadius: 1, fontFamily: 'monospace', fontSize: '11px' }}>
                            <Typography variant='caption' sx={{ fontWeight: 'bold', display: 'block', mb: 0.5 }}>Call #{i + 1} — {batch.length} lines</Typography>
                            {batch.map((line, j) => <Typography key={j} variant='caption' sx={{ fontFamily: 'monospace', display: 'block', wordBreak: 'break-all' }}>{line}</Typography>)}
                        </Box>
                    ))}

                    {/* LLM responses */}
                    {tab === ECensorTab.LlmResponses && (rd?.llmOutputLines ?? []).map((out, i) => (
                        <Box key={i} sx={{ mb: 1, p: 1, bgcolor: 'action.hover', borderRadius: 1, fontFamily: 'monospace', fontSize: '11px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                            {out}
                        </Box>
                    ))}

                    {/* Issues */}
                    {tab === ECensorTab.Issues && <>
                        {(rd?.llmWarningLines ?? [])
                            .filter(w => {
                                if (activeTagFilters.length === 0) return true
                                return tagFilterAnd
                                    ? activeTagFilters.every(t => w.tags.includes(t))
                                    : activeTagFilters.some(t => w.tags.includes(t))
                            })
                            .map((w, i) => (
                                <Box key={i} sx={{ display: 'flex', flexDirection: 'column', px: 0.5, py: 0.25, borderBottom: 1, borderColor: 'divider', '&:hover': { bgcolor: 'action.hover' } }}>
                                    <Box sx={{ display: 'flex', alignItems: 'flex-start' }}>
                                        <Box sx={{ flex: 1 }}>
                                            {w.tags.length > 0 && (
                                                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 0.25 }}>
                                                    {w.tags.map(t => <Chip key={t} label={t} size='small' variant='outlined' sx={{ fontSize: '10px', height: 18 }} />)}
                                                </Box>
                                            )}
                                            <Typography variant='caption' sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{w.original}</Typography>
                                            <Typography variant='caption' color='text.secondary' sx={{ fontStyle: 'italic' }}>{w.explanation}</Typography>
                                        </Box>
                                        <Tooltip title='Add as regex'>
                                            <IconButton size='small' sx={{ ml: 0.5, mt: 0.25, flexShrink: 0 }} onClick={() => {
                                                const escaped = w.original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                                                setAddRegexState({ runnerKey: w.runnerKey, pattern: escaped, explanation: w.explanation, lockRunner: true })
                                            }}>
                                                <AddIcon sx={{ fontSize: 14 }} />
                                            </IconButton>
                                        </Tooltip>
                                    </Box>
                                </Box>
                            ))
                        }
                    </>}

                    {/* LLM Errors */}
                    {tab === ECensorTab.LlmErrors && (rd?.llmErrorLines ?? []).map((e, i) => (
                        <Box key={i} sx={{ display: 'flex', flexDirection: 'column', px: 0.5, py: 0.5, borderBottom: 1, borderColor: 'divider', '&:hover': { bgcolor: 'action.hover' } }}>
                            <Typography variant='caption' color='text.disabled' sx={{ fontFamily: 'monospace', fontSize: '10px' }}>{e.timestamp}</Typography>
                            <Typography variant='caption' color='error.main' sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{e.text}</Typography>
                            {e.lines && e.lines.length > 0 && (
                                <Box sx={{ mt: 0.5, pl: 1, borderLeft: 2, borderColor: 'error.light' }}>
                                    <Typography variant='caption' color='text.disabled' sx={{ fontSize: '9px', fontWeight: 'bold', display: 'block', mb: 0.25 }}>
                                        INPUT ({e.lines.length} lines)
                                    </Typography>
                                    {e.lines.map((l, j) => (
                                        <Typography key={j} variant='caption' sx={{ fontFamily: 'monospace', fontSize: '10px', display: 'block', wordBreak: 'break-all', color: 'text.secondary' }}>
                                            {l}
                                        </Typography>
                                    ))}
                                </Box>
                            )}
                        </Box>
                    ))}

                    {tab === ECensorTab.Performance && (() => {
                        const selectedLlm = data.llms.find(l => l.id === data.instanceConfig?.llmId)
                        const icpm = selectedLlm?.inputCostPerMillion ?? 0
                        const ocpm = selectedLlm?.outputCostPerMillion ?? 0
                        const tokensIn = rd?.tokensIn ?? 0
                        const tokensOut = rd?.tokensOut ?? 0
                        const llmLinesCount = rd?.llmLinesCount ?? 0
                        const processedCount = rd?.processedCount ?? 0
                        const pendingCount = rd?.pendingCount ?? 0
                        const llmCount = rd?.llmCount ?? 0
                        const totalBytesProcessed = rd?.totalBytesProcessed ?? 0
                        const spent = (icpm > 0 || ocpm > 0) ? (tokensIn / 1_000_000 * icpm + tokensOut / 1_000_000 * ocpm) : 0
                        const avgTkPerLine = llmLinesCount > 0 ? tokensIn / llmLinesCount : 0
                        const filtered = Math.max(0, processedCount - llmLinesCount - pendingCount)
                        const savedTk = filtered > 0 && avgTkPerLine > 0 ? Math.round(filtered * avgTkPerLine) : 0
                        const savedCost = icpm > 0 && savedTk > 0 ? savedTk / 1_000_000 * icpm : 0
                        const total = spent + savedCost
                        const fmt = (n: number) => n > 0 ? `${n.toFixed(4)} €` : '—'
                        const col = (label: string, val: string | number) => (
                            <Stack direction='row' justifyContent='space-between'>
                                <Typography variant='body2' color='text.secondary'>{label}</Typography>
                                <Typography variant='body2' fontWeight='bold'>{typeof val === 'number' ? val.toLocaleString() : val}</Typography>
                            </Stack>
                        )
                        return (
                        <Stack direction='row' spacing={2} sx={{ p: 1.5, flexWrap: 'wrap' }} useFlexGap>
                            <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.5, minWidth: 190, flex: 1 }}>
                                <Typography variant='subtitle2' fontWeight='bold' gutterBottom>Log</Typography>
                                <Stack spacing={0.5}>
                                    {col('Processed', processedCount)}
                                    {col('Sent to LLM', llmLinesCount)}
                                    {col('Filtered (regex)', filtered)}
                                    {col('Savings', processedCount > 0 ? `${Math.round(filtered / processedCount * 100)}%` : '—')}
                                    {col('Pending', pendingCount)}
                                    {col('Subscribers', data.subscriberCount)}
                                    {col('Avg line size', processedCount > 0 && totalBytesProcessed > 0 ? `${Math.round(totalBytesProcessed / processedCount)} B` : '—')}
                                    <Divider sx={{ my: 0.5 }} />
                                    {col('Start', data.startTime ? new Date(data.startTime).toLocaleTimeString() : '—')}
                                    {col('Elapsed', data.startTime ? (() => {
                                        const s = Math.floor(((data.stopTime ?? Date.now()) - data.startTime) / 1000)
                                        const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
                                        return h > 0 ? `${h}h ${m}m ${sec}s` : m > 0 ? `${m}m ${sec}s` : `${sec}s`
                                    })() : '—')}
                                </Stack>
                            </Box>
                            <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.5, minWidth: 190, flex: 1 }}>
                                <Typography variant='subtitle2' fontWeight='bold' gutterBottom>LLM</Typography>
                                <Stack spacing={0.5}>
                                    {col('Calls', llmCount)}
                                    {col('Responses', llmCount)}
                                    {col('Avg lines/call', llmCount > 0 ? Math.round(llmLinesCount / llmCount) : '—')}
                                    {col('Tokens in', tokensIn)}
                                    {col('Tokens out', tokensOut)}
                                    {savedTk > 0 && col('Est. tokens saved', `~${savedTk.toLocaleString()} (${Math.round(savedTk / (tokensIn + savedTk) * 100)}%)`)}
                                </Stack>
                                <Stack spacing={0.5} sx={{ mt: 1, pt: 1, borderTop: 1, borderColor: 'divider' }}>
                                    {col('Batch mode', data.instanceConfig?.batchMode ?? 'fixed')}
                                    {col('Batch size', data.instanceConfig?.batchMode === 'auto'
                                        ? `${rd?.currentBatchSize ?? data.instanceConfig?.batchSize ?? 10} / ${data.instanceConfig?.batchSize ?? 10} (min ${data.instanceConfig?.batchSizeMin ?? 5})`
                                        : (data.instanceConfig?.batchSize ?? 10))}
                                    {col('Avg tokens/batch', llmCount > 0 ? Math.round(tokensIn / llmCount) : '—')}
                                </Stack>
                            </Box>
                            <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.5, minWidth: 260, flex: 1 }}>
                                <Typography variant='subtitle2' fontWeight='bold' gutterBottom>Performance</Typography>
                                {(() => {
                                    if (msgsPerSec > peakProcessedRef.current) peakProcessedRef.current = msgsPerSec
                                    if (tokensInPerSec > peakTkInRef.current) peakTkInRef.current = tokensInPerSec
                                    if (tokensOutPerSec > peakTkOutRef.current) peakTkOutRef.current = tokensOutPerSec
                                    if (llmLinesPerSec > peakLlmLinesRef.current) peakLlmLinesRef.current = llmLinesPerSec
                                    const elapsedSec = data.startTime ? Math.max(1, ((data.stopTime ?? Date.now()) - data.startTime) / 1000) : null
                                    const avgProcessed = elapsedSec ? processedCount / elapsedSec : 0
                                    const avgLlmLines = elapsedSec ? llmLinesCount / elapsedSec : 0
                                    const avgTkIn = elapsedSec ? tokensIn / elapsedSec : 0
                                    const avgTkOut = elapsedSec ? tokensOut / elapsedSec : 0
                                    return (
                                        <>
                                        <Stack direction='row' spacing={0} sx={{ mb: 2 }}>
                                            <MiniGauge value={msgsPerSec} max={(peakProcessedRef.current * 1.1) || 10} label='Lines/sec' format={formatPerfValue} valuePosition='inside' />
                                            <MiniGauge value={llmLinesPerSec} max={(peakLlmLinesRef.current * 1.1) || 10} label='LLM lines/s' format={formatPerfValue} valuePosition='inside' />
                                            <MiniGauge value={tokensInPerSec} max={(peakTkInRef.current * 1.1) || 10} label='Tok in/sec' format={formatPerfValue} valuePosition='inside' />
                                            <MiniGauge value={tokensOutPerSec} max={(peakTkOutRef.current * 1.1) || 10} label='Tok out/sec' format={formatPerfValue} valuePosition='inside' />
                                        </Stack>
                                        <Stack direction='row' spacing={0} sx={{ mb: 1 }}>
                                            <MiniGauge value={avgProcessed} max={(peakProcessedRef.current * 1.1) || 10} label='Avg l/sec' valuePosition='inside' />
                                            <MiniGauge value={avgLlmLines} max={(peakLlmLinesRef.current * 1.1) || 10} label='Avg LLM/s' valuePosition='inside' />
                                            <MiniGauge value={avgTkIn} max={(peakTkInRef.current * 1.1) || 10} label='Avg tk in' valuePosition='inside' />
                                            <MiniGauge value={avgTkOut} max={(peakTkOutRef.current * 1.1) || 10} label='Avg tk out' valuePosition='inside' />
                                        </Stack>
                                        </>
                                    )
                                })()}
                                <Stack direction='row' spacing={1} sx={{ mb: 0.5 }}>
                                    <Box sx={{ flex: 1 }} />
                                    <Typography variant='caption' color='text.disabled' sx={{ width: 48, textAlign: 'right' }}>/sec</Typography>
                                    <Typography variant='caption' color='text.disabled' sx={{ width: 56, textAlign: 'right' }}>/min</Typography>
                                    <Typography variant='caption' color='text.disabled' sx={{ width: 64, textAlign: 'right' }}>/hour</Typography>
                                </Stack>
                                {[
                                    { label: 'Processed', sec: msgsPerSec, min: msgsPerMin, hour: msgsPerMin * 60 },
                                    { label: 'Sent to LLM', sec: llmLinesPerSec, min: llmLinesPerMin, hour: llmLinesPerMin * 60 },
                                    { label: 'Tokens in', sec: tokensInPerSec, min: tokensInPerMin, hour: tokensInPerMin * 60 },
                                    { label: 'Tokens out', sec: tokensOutPerSec, min: tokensOutPerMin, hour: tokensOutPerMin * 60 },
                                ].map(({ label, sec, min, hour }) => (
                                    <Stack key={label} direction='row' spacing={1} alignItems='center'>
                                        <Typography variant='body2' color='text.secondary' sx={{ flex: 1 }}>{label}</Typography>
                                        <Typography variant='body2' fontWeight='bold' sx={{ width: 48, textAlign: 'right' }}>{sec.toLocaleString()}</Typography>
                                        <Typography variant='body2' fontWeight='bold' sx={{ width: 56, textAlign: 'right' }}>{min.toLocaleString()}</Typography>
                                        <Typography variant='body2' fontWeight='bold' sx={{ width: 64, textAlign: 'right' }}>{hour.toLocaleString()}</Typography>
                                    </Stack>
                                ))}
                            </Box>
                            <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.5, minWidth: 190, flex: 1 }}>
                                <Typography variant='subtitle2' fontWeight='bold' gutterBottom>DataDog</Typography>
                                {(() => {
                                    const INGEST_PER_GB = 0.10
                                    const IDX = { '3d': 1.27, '15d': 1.70, '30d': 2.50 }
                                    const totalBytes = totalBytesProcessed
                                    const avgBytes = processedCount > 0 && totalBytes > 0 ? totalBytes / processedCount : 0
                                    const filteredBytes = avgBytes > 0 ? filtered * avgBytes : 0
                                    const remainBytes = totalBytes - filteredBytes
                                    const fmtSz = (b: number) => b < 1024 * 1024 ? `${Math.round(b / 1024)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`
                                    const fmtIng = (b: number) => `$${(b / (1024 ** 3) * INGEST_PER_GB).toFixed(4)}`
                                    const fmtIdx = (n: number, rate: number) => `$${(n / 1_000_000 * rate).toFixed(4)}`
                                    const pct = totalBytes > 0 ? Math.round(filteredBytes / totalBytes * 100) : 0
                                    return (
                                        <Stack spacing={0.5}>
                                            <Typography variant='caption' color='text.secondary' sx={{ fontWeight: 'bold' }}>Ingestion ($0.10/GB)</Typography>
                                            {col('All logs', `${fmtSz(totalBytes)}  ${fmtIng(totalBytes)}`)}
                                            {col('Regex filtered', `${fmtSz(filteredBytes)}  ${fmtIng(filteredBytes)}`)}
                                            {col('Remaining', `${fmtSz(remainBytes)}  ${fmtIng(remainBytes)}`)}
                                            {pct > 0 && col('Ingestion saved', `${pct}%`)}
                                            <Typography variant='caption' color='text.secondary' sx={{ mt: 0.5, fontWeight: 'bold' }}>Indexing (per M events)</Typography>
                                            <Stack direction='row' spacing={0}>
                                                <Box sx={{ flex: 1 }} />
                                                {Object.keys(IDX).map(k => <Typography key={k} variant='caption' color='text.disabled' sx={{ width: 56, textAlign: 'right' }}>{k}</Typography>)}
                                            </Stack>
                                            {[
                                                { label: 'All events', n: processedCount },
                                                { label: 'Regex filtered', n: filtered },
                                                { label: 'Remaining', n: processedCount - filtered },
                                            ].map(({ label, n }) => (
                                                <Stack key={label} direction='row' alignItems='center'>
                                                    <Typography variant='body2' color='text.secondary' sx={{ flex: 1 }}>{label}</Typography>
                                                    {Object.values(IDX).map((rate, i) => (
                                                        <Typography key={i} variant='body2' fontWeight='bold' sx={{ width: 56, textAlign: 'right' }}>{fmtIdx(n, rate)}</Typography>
                                                    ))}
                                                </Stack>
                                            ))}
                                        </Stack>
                                    )
                                })()}
                            </Box>
                            <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.5, minWidth: 190, flex: 1 }}>
                                <Typography variant='subtitle2' fontWeight='bold' gutterBottom>Cost</Typography>
                                <Stack spacing={0.5}>
                                    {col('Total (w/o filtering)', fmt(total))}
                                    {col('Spent', fmt(spent))}
                                    {col('Saved', fmt(savedCost))}
                                    {savedCost > 0 && col('Savings %', `${Math.round(savedCost / total * 100)}%`)}
                                </Stack>
                                {!selectedLlm?.inputCostPerMillion && (
                                    <Typography variant='caption' color='text.disabled' sx={{ mt: 1, display: 'block' }}>
                                        Set cost/M tokens in AI Models to see costs
                                    </Typography>
                                )}
                            </Box>
                        </Stack>
                        )
                    })()}

                </Box>
            </CardContent>
        </Card>}

        {addRegexState !== null && (
            <CensorAddRegexDialog
                data={data} sendCommand={sendCommand}
                initialRunnerKey={addRegexState.runnerKey}
                initialPattern={addRegexState.pattern}
                initialExplanation={addRegexState.explanation}
                lockRunner={addRegexState.lockRunner}
                onAdded={(pattern, rk, origin, explanation) => {
                    try {
                        const re = new RegExp(pattern)
                        let matches = 0
                        for (const runner of data.runners.values()) {
                            const before = runner.llmWarningLines.length
                            runner.llmWarningLines = runner.llmWarningLines.filter(w => !re.test(w.original))
                            matches += before - runner.llmWarningLines.length
                        }
                        const targetRunner = data.runners.get(rk)
                        if (targetRunner && !targetRunner.regexes.some(r => r.pattern === pattern)) {
                            targetRunner.regexes.push({ pattern, example: '', explanation, matches, origin })
                        }
                        forceUpdate(n => n + 1)
                    } catch {}
                }}
                onClose={() => setAddRegexState(null)}
            />
        )}
        {showConfig && (
            <CensorConfigDialog data={data} channelObject={props.channelObject} sendCommand={sendCommand} onClose={() => setShowConfig(false)} />
        )}
        {showConfigLlm && (
            <AiConfigLlm llms={data.llms} providers={data.providers} onClose={aiConfigLlmClose} />
        )}
        {showConfigProvider && (
            <AiConfigProvider providers={data.providers} providersAvailable={data.providersAvailable} onClose={aiConfigProviderClose} />
        )}
    </>
}

export { CensorTabContent }
