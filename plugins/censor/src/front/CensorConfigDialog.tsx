import React, { useEffect, useState } from 'react'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import { Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider, FormControl, FormControlLabel, IconButton, InputLabel, List, ListItemButton, MenuItem, Select, Stack, Switch, Tab, Tabs, TextField, Typography } from '@mui/material'
import { IChannelObject } from '@kwirthmagnify/kwirth-common-front'
import { ICensorData } from './CensorData'
import { ECensorCommand, ICensorInstanceConfig, ICensorBusinessSource, ICensorLogstreamSource } from './CensorConfig'
import { CensorImportExport } from './CensorImportExport'
import { MsgBoxButtons, MsgBoxYesNo } from './utils'

interface ICensorConfigDialogProps {
    data: ICensorData
    channelObject: IChannelObject
    sendCommand: (command: ECensorCommand, payload?: unknown) => void
    onClose: () => void
}

// Config dialog tab IDs, decoupled from render position (never use positional indices)
enum ECensorConfigTab {
    General = 'general',
    Prompt = 'prompt',
    Logstream = 'logstream',
    Business = 'business',
    Sender = 'sender'
}

const migrateBusinessSources = (cfg: ICensorInstanceConfig): ICensorBusinessSource[] => {
    if (cfg.businessSources && cfg.businessSources.length > 0) return cfg.businessSources
    if (cfg.space || cfg.businessPath) return [{ space: cfg.space ?? '', type: cfg.type ?? '', businessPath: cfg.businessPath ?? '', addTimestamp: cfg.addTimestamp ?? false }]
    return []
}

const CensorConfigDialog: React.FC<ICensorConfigDialogProps> = ({ data, channelObject, sendCommand, onClose }) => {
    // Local copy of configs — switches only update this, nothing is sent until OK
    const [localConfigs, setLocalConfigs] = useState<ICensorInstanceConfig[]>(() => data.configs.map(c => ({ ...c })))
    const [deletedKeys, setDeletedKeys] = useState<string[]>([])
    const [selectedIdx, setSelectedIdx] = useState<number | null>(null)
    const [configTab, setConfigTab] = useState<ECensorConfigTab>(ECensorConfigTab.General)
    const [msgBox, setMsgBox] = useState(<></>)
    const [showImportExport, setShowImportExport] = useState(false)
    const [senderEntries, setSenderEntries] = useState<Array<{ senderId: string; configName: string }>>([])

    // Form fields for the config being edited in the right panel
    const [configName, setConfigName] = useState('')
    const [configVersion, setConfigVersion] = useState('1')
    const [llmId, setLlmId] = useState('')
    const [system, setSystem] = useState('')
    const [batchSize, setBatchSize] = useState(10)
    const [batchMode, setBatchMode] = useState<'fixed' | 'auto'>('fixed')
    const [batchSizeMin, setBatchSizeMin] = useState(5)
    const [maxLineLength, setMaxLineLength] = useState(0)
    const [batchTimeout, setBatchTimeout] = useState(2)
    const [temperature, setTemperature] = useState(0.2)
    const [exampleJson, setExampleJson] = useState('{"patterns":["example regex"]}')
    const [exampleJsonError, setExampleJsonError] = useState('')
    const [businessSources, setBusinessSources] = useState<ICensorBusinessSource[]>([])
    const [logstreamEnabled, setLogstreamEnabled] = useState(false)
    const [logstreamAll, setLogstreamAll] = useState(false)
    const [logstreamSources, setLogstreamSources] = useState<ICensorLogstreamSource[]>([])
    const [senderId, setSenderId] = useState('')
    const [senderConfigName, setSenderConfigName] = useState('')
    const [configActive, setConfigActive] = useState(false)

    useEffect(() => {
        const url = channelObject.clusterUrl
        const token = channelObject.accessString
        if (!url || !token) return
        fetch(`${url}/senders`, { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.json())
            .then((senders: Array<{ id: string; configNames: string[] }>) => {
                const entries: Array<{ senderId: string; configName: string }> = []
                for (const s of senders) {
                    for (const cn of s.configNames ?? []) entries.push({ senderId: s.id, configName: cn })
                }
                setSenderEntries(entries)
            })
            .catch(() => {})
    }, [])

    // Select first active config on open
    useEffect(() => {
        const activeIdx = localConfigs.findIndex(c => c.active)
        if (activeIdx >= 0) {
            setSelectedIdx(activeIdx)
            loadConfig(localConfigs[activeIdx])
        }
    }, [])

    const loadConfig = (cfg: ICensorInstanceConfig) => {
        setConfigName(cfg.name)
        setConfigVersion(cfg.version)
        setLlmId(cfg.llmId ?? '')
        setSystem(cfg.system ?? '')
        setBatchSize(cfg.batchSize ?? 10)
        setBatchMode(cfg.batchMode ?? 'fixed')
        setBatchSizeMin(cfg.batchSizeMin ?? 5)
        setMaxLineLength(cfg.maxLineLength ?? 0)
        setBatchTimeout(cfg.batchTimeout ?? 2)
        setTemperature(cfg.temperature ?? 0.2)
        setExampleJson(cfg.exampleJson ?? '{"patterns":["example regex"]}')
        setExampleJsonError('')
        setBusinessSources(migrateBusinessSources(cfg))
        setLogstreamEnabled(cfg.logstreamEnabled ?? false)
        setLogstreamAll(cfg.logstreamAll ?? false)
        setLogstreamSources(cfg.logstreamSources ?? [])
        setSenderId(cfg.senderId ?? '')
        setSenderConfigName(cfg.senderConfigName ?? '')
        setConfigActive(cfg.active ?? false)
    }

    const currentConfig = (): ICensorInstanceConfig => ({
        name: configName, version: configVersion, llmId, system, batchSize, batchMode, batchSizeMin,
        maxLineLength, batchTimeout, temperature, exampleJson, businessSources,
        logstreamEnabled, logstreamAll, logstreamSources, senderId, senderConfigName, active: configActive
    })

    const onConfigSelect = (cfg: ICensorInstanceConfig, i: number) => {
        setSelectedIdx(i)
        loadConfig(cfg)
    }

    const onConfigNew = () => {
        setSelectedIdx(null)
        setConfigName(''); setConfigVersion('1'); setLlmId(''); setSystem('')
        setBatchSize(50); setBatchMode('fixed'); setBatchSizeMin(5); setMaxLineLength(0); setBatchTimeout(2)
        setTemperature(0.2); setExampleJson('{"patterns":["example regex"]}'); setExampleJsonError('')
        setBusinessSources([])
        setLogstreamEnabled(false); setLogstreamAll(false); setLogstreamSources([])
        setSenderId(''); setSenderConfigName(''); setConfigActive(false)
    }

    // Add/Update button: upsert into local list only, no sendCommand
    const onSaveLocal = () => {
        const cfg = currentConfig()
        setLocalConfigs(prev => {
            const idx = prev.findIndex(c => c.name === cfg.name && c.version === cfg.version)
            if (idx >= 0) {
                const next = [...prev]; next[idx] = cfg
                setSelectedIdx(idx)
                return next
            } else {
                setSelectedIdx(prev.length)
                return [...prev, cfg]
            }
        })
    }

    const onDeleteLocal = () => {
        if (selectedIdx === null) return
        const cfg = localConfigs[selectedIdx]
        setMsgBox(MsgBoxYesNo('Delete config', `Delete "${cfg.name} v${cfg.version}"?`, setMsgBox, (a: MsgBoxButtons) => {
            if (a !== MsgBoxButtons.Yes) return
            const key = `${cfg.name}:${cfg.version}`
            // Only track for backend deletion if it existed originally
            if (data.configs.some(c => c.name === cfg.name && c.version === cfg.version)) {
                setDeletedKeys(prev => [...prev, key])
            }
            setLocalConfigs(prev => prev.filter((_, i) => i !== selectedIdx))
            setSelectedIdx(null)
        }))
    }

    const handleOk = () => {
        for (const key of deletedKeys) {
            const [name, ...vParts] = key.split(':')
            sendCommand(ECensorCommand.CONFIGDELETE, { name, version: vParts.join(':') })
        }
        // Send full config list + current config in one command — backend saves and restarts atomically
        const cfg = currentConfig()
        data.instanceConfig = cfg
        sendCommand(ECensorCommand.CONFIGSET, { ...cfg, _allConfigs: localConfigs })
        onClose()
    }

    const importExportClose = (imported?: ICensorInstanceConfig[]) => {
        setShowImportExport(false)
        if (imported) {
            setLocalConfigs(prev => {
                let next = [...prev]
                for (const cfg of imported) {
                    const idx = next.findIndex(c => c.name === cfg.name && c.version === cfg.version)
                    if (idx >= 0) next[idx] = cfg
                    else next = [...next, cfg]
                }
                return next
            })
        }
    }

    return <>
        <Dialog open={true} PaperProps={{ sx: { width: '92vw', maxWidth: '1200px', height: '82vh' } }}>
            <DialogTitle>Censor config</DialogTitle>
            <DialogContent sx={{ display: 'flex', height: '100%', overflow: 'hidden', py: 1, px: 2 }}>

                {/* Left panel — config list */}
                <Box sx={{ flex: '0 0 230px', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', pr: 1 }}>
                    <Typography variant='caption' color='text.secondary' sx={{ fontWeight: 'bold', px: 0.5, pt: 0.5 }}>Configs</Typography>
                    <Box sx={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', border: 1, borderColor: 'divider', borderRadius: 1, mt: 0.5 }}>
                        <List dense sx={{ py: 0 }}>
                            {localConfigs.map((cfg, i) => (
                                <ListItemButton key={i} selected={selectedIdx === i} onClick={() => onConfigSelect(cfg, i)} dense sx={{ py: 0.5 }}>
                                    <Stack direction='column' sx={{ minWidth: 0, flex: 1 }}>
                                        <Stack direction='row' spacing={0.5} alignItems='center'>
                                            <Typography variant='body2' sx={{ fontWeight: selectedIdx === i ? 'bold' : 'normal', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                                                {cfg.name}
                                            </Typography>
                                            {cfg.active && <Chip label='ON' size='small' color='success' sx={{ height: 14, fontSize: 9, px: 0, '& .MuiChip-label': { px: 0.5 } }} />}
                                        </Stack>
                                        <Typography color='textSecondary' variant='caption'>v{cfg.version}</Typography>
                                    </Stack>
                                </ListItemButton>
                            ))}
                        </List>
                    </Box>
                    <Stack direction='row' spacing={0.5} sx={{ px: 0.5, pt: 0.5, justifyContent: 'center' }}>
                        <Button variant='outlined' size='small' startIcon={<AddIcon />} onClick={onConfigNew} sx={{ fontSize: 11 }}>New</Button>
                        <Button variant='outlined' size='small' color='error' startIcon={<DeleteIcon />} onClick={onDeleteLocal} disabled={selectedIdx === null} sx={{ fontSize: 11 }}>Delete</Button>
                    </Stack>
                </Box>

                {/* Right panel — editor */}
                <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', pl: 2, pt: 1 }}>
                    <Tabs value={configTab} onChange={(_, v) => setConfigTab(v)} variant='fullWidth'
                        sx={{ borderBottom: 1, borderColor: 'divider', minHeight: 36, '& .MuiTab-root': { minHeight: 36, py: 0.5 } }}>
                        <Tab value={ECensorConfigTab.General} label='General' />
                        <Tab value={ECensorConfigTab.Prompt} label='Prompt' />
                        <Tab value={ECensorConfigTab.Logstream} label='Logstream' />
                        <Tab value={ECensorConfigTab.Business} label='Business' />
                        <Tab value={ECensorConfigTab.Sender} label='Sender' />
                    </Tabs>

                    <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>

                        {configTab === ECensorConfigTab.General && (
                            <Stack spacing={1.5} sx={{ pt: 1.5 }}>
                                <Stack direction='row' spacing={2} alignItems='center'>
                                    <TextField label='Name' size='small' value={configName} onChange={e => setConfigName(e.target.value)} sx={{ flex: 1 }} />
                                    <TextField label='Version' size='small' value={configVersion} onChange={e => setConfigVersion(e.target.value)} sx={{ width: 100 }} />
                                    <FormControlLabel
                                        control={<Switch checked={configActive} onChange={e => setConfigActive(e.target.checked)} />}
                                        label='Active'
                                        sx={{ ml: 0, whiteSpace: 'nowrap' }} />
                                </Stack>
                                <Stack direction='row' spacing={2} alignItems='center'>
                                    <FormControl size='small' sx={{ flex: 3, minWidth: 0 }}>
                                        <InputLabel>LLM</InputLabel>
                                        <Select label='LLM' value={llmId} onChange={e => setLlmId(e.target.value)} renderValue={v => v as string}>
                                            {data.llms.length === 0 && <MenuItem value='' disabled>No LLMs configured</MenuItem>}
                                            {data.llms.map(llm => (
                                                <MenuItem key={llm.id} value={llm.id}>{llm.id} ({llm.provider}/{llm.model})</MenuItem>
                                            ))}
                                        </Select>
                                    </FormControl>
                                    <TextField label='Temperature' size='small' type='number' value={temperature}
                                        onChange={e => setTemperature(Math.min(2, Math.max(0, +e.target.value)))}
                                        sx={{ flex: 1, minWidth: 0 }} inputProps={{ min: 0, max: 2, step: 0.1 }} />
                                </Stack>
                                <Stack direction='row' spacing={2} alignItems='center'>
                                    <FormControl size='small' sx={{ flex: 1, minWidth: 0 }}>
                                        <InputLabel>Batch</InputLabel>
                                        <Select label='Batch' value={batchMode} onChange={e => setBatchMode(e.target.value as 'fixed' | 'auto')}>
                                            <MenuItem value='fixed'>Fixed</MenuItem>
                                            <MenuItem value='auto'>Auto</MenuItem>
                                        </Select>
                                    </FormControl>
                                    <TextField label={batchMode === 'auto' ? 'Initial size' : 'Batch size'} size='small' type='number' value={batchSize}
                                        onChange={e => setBatchSize(Math.max(1, +e.target.value))}
                                        sx={{ flex: 1, minWidth: 0 }} inputProps={{ min: 1 }} />
                                    <TextField label='Min size' size='small' type='number' value={batchSizeMin}
                                        onChange={e => setBatchSizeMin(Math.max(1, +e.target.value))}
                                        disabled={batchMode !== 'auto'}
                                        sx={{ flex: 1, minWidth: 0 }} inputProps={{ min: 1 }} />
                                    <TextField label='Max line (0=∞)' size='small' type='number' value={maxLineLength}
                                        onChange={e => setMaxLineLength(Math.max(0, +e.target.value))}
                                        sx={{ flex: 1, minWidth: 0 }} inputProps={{ min: 0 }} />
                                    <TextField label='Timeout (s)' size='small' type='number' value={batchTimeout}
                                        onChange={e => setBatchTimeout(Math.max(1, +e.target.value))}
                                        sx={{ flex: 1, minWidth: 0 }} inputProps={{ min: 1 }} />
                                </Stack>
                            </Stack>
                        )}

                        {configTab === ECensorConfigTab.Prompt && (
                            <Stack spacing={1.5} sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, pt: 1.5 }}>
                                <TextField label='System prompt (optional)' size='small' multiline value={system}
                                    onChange={e => setSystem(e.target.value)} fullWidth
                                    placeholder='Leave empty to use the default noise-filtering prompt'
                                    sx={{ flex: 1, minHeight: 0, '& .MuiInputBase-root': { height: '100%', alignItems: 'flex-start' }, '& textarea': { height: '100% !important', overflow: 'auto !important', boxSizing: 'border-box' } }} />
                                <TextField label='Output example (JSON)' size='small' multiline value={exampleJson}
                                    onChange={e => {
                                        setExampleJson(e.target.value)
                                        try { JSON.parse(e.target.value); setExampleJsonError('') }
                                        catch (err) { setExampleJsonError(String(err)) }
                                    }}
                                    error={!!exampleJsonError} helperText={exampleJsonError || 'Must be valid JSON with double quotes'}
                                    fullWidth inputProps={{ style: { fontFamily: 'monospace', fontSize: '12px' } }}
                                    sx={{ flex: 1, minHeight: 0, '& .MuiInputBase-root': { height: '100%', alignItems: 'flex-start' }, '& textarea': { height: '100% !important', overflow: 'auto !important', boxSizing: 'border-box' } }} />
                            </Stack>
                        )}

                        {configTab === ECensorConfigTab.Logstream && (
                            <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                                <Stack spacing={1} sx={{ pt: 1.5 }}>
                                    <FormControlLabel
                                        control={<Switch checked={logstreamEnabled} onChange={e => setLogstreamEnabled(e.target.checked)} />}
                                        label='Enable logstream ingestion' />
                                    {logstreamEnabled && (
                                        <>
                                            <FormControlLabel
                                                control={<Switch checked={logstreamAll} onChange={e => setLogstreamAll(e.target.checked)} />}
                                                label='Audit all objects' />
                                            {!logstreamAll && (
                                                <Stack spacing={1}>
                                                    {logstreamSources.map((src, i) => (
                                                        <Stack key={i} direction='row' spacing={1} alignItems='center'>
                                                            <TextField label='Namespace' size='small' value={src.namespace ?? ''}
                                                                onChange={e => setLogstreamSources(prev => prev.map((s, j) => j === i ? { ...s, namespace: e.target.value } : s))}
                                                                sx={{ flex: 1 }} placeholder='any' />
                                                            <TextField label='Pod regex' size='small' value={src.podRegex ?? ''}
                                                                onChange={e => setLogstreamSources(prev => prev.map((s, j) => j === i ? { ...s, podRegex: e.target.value } : s))}
                                                                sx={{ flex: 1.5 }} placeholder='e.g. myapp-.*' />
                                                            <TextField label='Label selector' size='small' value={src.labelSelector ?? ''}
                                                                onChange={e => setLogstreamSources(prev => prev.map((s, j) => j === i ? { ...s, labelSelector: e.target.value } : s))}
                                                                sx={{ flex: 2 }} placeholder='e.g. app=myapp' />
                                                            <IconButton size='small' onClick={() => setLogstreamSources(prev => prev.filter((_, j) => j !== i))}>
                                                                <DeleteOutlineIcon sx={{ fontSize: 14 }} />
                                                            </IconButton>
                                                        </Stack>
                                                    ))}
                                                    <Button variant='outlined' size='small' startIcon={<AddIcon />}
                                                        onClick={() => setLogstreamSources(prev => [...prev, { namespace: '', podRegex: '', labelSelector: '' }])}>
                                                        Add source
                                                    </Button>
                                                </Stack>
                                            )}
                                        </>
                                    )}
                                </Stack>
                            </Box>
                        )}

                        {configTab === ECensorConfigTab.Business && (
                            <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                                <Stack spacing={1} sx={{ pt: 1.5 }}>
                                    {businessSources.map((src, i) => (
                                        <Stack key={i} direction='row' spacing={1} alignItems='center'>
                                            <TextField label='Space' size='small' value={src.space ?? ''}
                                                onChange={e => setBusinessSources(prev => prev.map((s, j) => j === i ? { ...s, space: e.target.value } : s))}
                                                sx={{ flex: 1 }} placeholder='any' />
                                            <TextField label='Type' size='small' value={src.type ?? ''}
                                                onChange={e => setBusinessSources(prev => prev.map((s, j) => j === i ? { ...s, type: e.target.value } : s))}
                                                sx={{ flex: 1 }} placeholder='any' />
                                            <TextField label='Path' size='small' value={src.businessPath ?? ''}
                                                onChange={e => setBusinessSources(prev => prev.map((s, j) => j === i ? { ...s, businessPath: e.target.value } : s))}
                                                sx={{ flex: 2 }} placeholder='dot-notation' />
                                            <FormControlLabel
                                                control={<Switch size='small' checked={src.addTimestamp ?? false}
                                                    onChange={e => setBusinessSources(prev => prev.map((s, j) => j === i ? { ...s, addTimestamp: e.target.checked } : s))} />}
                                                label={<Typography variant='caption'>TS</Typography>}
                                                sx={{ ml: 0, mr: 0, whiteSpace: 'nowrap' }} />
                                            <IconButton size='small' onClick={() => setBusinessSources(prev => prev.filter((_, j) => j !== i))}>
                                                <DeleteOutlineIcon sx={{ fontSize: 14 }} />
                                            </IconButton>
                                        </Stack>
                                    ))}
                                    <Button variant='outlined' size='small' startIcon={<AddIcon />}
                                        onClick={() => setBusinessSources(prev => [...prev, { space: '', type: '', businessPath: '', addTimestamp: false }])}>
                                        Add source
                                    </Button>
                                </Stack>
                            </Box>
                        )}

                        {configTab === ECensorConfigTab.Sender && (
                            <Box sx={{ pt: 1.5 }}>
                                <Stack direction='row' spacing={2} alignItems='center'>
                                    <FormControl size='small' sx={{ flex: 1 }}>
                                        <InputLabel>Sender config</InputLabel>
                                        <Select label='Sender config' value={senderId && senderConfigName ? `${senderId}::${senderConfigName}` : ''}
                                            onChange={e => {
                                                const val = e.target.value
                                                if (!val) { setSenderId(''); setSenderConfigName('') }
                                                else { const [sid, scn] = val.split('::'); setSenderId(sid); setSenderConfigName(scn) }
                                            }}>
                                            <MenuItem value=''><Typography variant='body2' color='text.secondary'>(none)</Typography></MenuItem>
                                            {senderEntries.map(e => (
                                                <MenuItem key={`${e.senderId}::${e.configName}`} value={`${e.senderId}::${e.configName}`}>
                                                    <Stack direction='row' spacing={1} alignItems='center'>
                                                        <Chip label={e.senderId} size='small' variant='outlined' sx={{ fontSize: '0.65rem', height: 18 }} />
                                                        <Typography variant='body2'>{e.configName}</Typography>
                                                    </Stack>
                                                </MenuItem>
                                            ))}
                                        </Select>
                                    </FormControl>
                                </Stack>
                            </Box>
                        )}

                    </Box>

                    <Stack direction='row' spacing={2} alignItems='center' sx={{ pt: 1 }}>
                        <Button variant='outlined' size='small' onClick={() => setShowImportExport(true)}>Import/Export</Button>
                        <Box sx={{ flex: 1 }} />
                        <Button variant='contained' size='small'
                            disabled={!configName || !configVersion || !!exampleJsonError}
                            onClick={onSaveLocal}>
                            {localConfigs.some(c => c.name === configName && c.version === configVersion) ? 'Update' : 'Add'}
                        </Button>
                    </Stack>
                </Box>
            </DialogContent>
            <DialogActions>
                <Button onClick={handleOk} variant='contained' disabled={!llmId || !!exampleJsonError}>OK</Button>
                <Button variant='outlined' onClick={onClose} color='inherit'>Cancel</Button>
            </DialogActions>
        </Dialog>

        {showImportExport && (
            <CensorImportExport configs={localConfigs} onClose={importExportClose} />
        )}
        {msgBox}
    </>
}

export { CensorConfigDialog }
