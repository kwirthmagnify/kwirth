import React, { useEffect, useRef, useState } from 'react'
import {
    Box, Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
    FormControl, FormControlLabel, IconButton, InputAdornment, InputLabel, List, ListItemButton,
    MenuItem, Select, Stack, Switch, TextField, Typography
} from '@mui/material'
/*
    DEEP IMPORTS ON PURPOSE, this is not an oversight.

    common-ai is BUNDLED by the front end (webpack), and '@mui/icons-material' is a CommonJS barrel that
    cannot be tree-shaken: importing from the root takes the ~2000 icons into the bundle. Measured: moving
    these four lines to the root barrel put 1.62 MB on the front end's main.

    That is why the "no deep imports" rule is only for PLUGINS — there it breaks @emotion, which loads a
    copy of its own — and common-front and common-ai are the documented exception.
*/
import Download from '@mui/icons-material/Download'
import Upload from '@mui/icons-material/Upload'
import Visibility from '@mui/icons-material/Visibility'
import VisibilityOff from '@mui/icons-material/VisibilityOff'

const downloadJson = async (data: unknown, filename: string) => {
    const json = JSON.stringify(data, null, 2)
    const tauri = (window as any).__TAURI__
    if (tauri?.core?.invoke) {
        await tauri.core.invoke('save_file_dialog', { filename, content: json })
        return
    }
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
}
import { EUsageUnit, ILlm, ILlmModel, ILlmProvider, IUsageAmounts, IUsageLimits, IUsageTotals, IUsageWindows } from './index'

// ── UsageLimits ─────────────────────────────────────────────────────────────

interface IUsageLimitsEditorProps {
    value: IUsageLimits | undefined
    onChange: (limits: IUsageLimits) => void
    /* What these ceilings are set on, so the text can say it instead of talking about 'the subject'. */
    subject: string
    disabled?: boolean
    /* What has been spent so far, so a ceiling is set knowing where you already are. */
    usage?: IUsageTotals
    /* false when the counters live in memory: they are lost on restart, and that has to be said. */
    durable?: boolean
}

/* The four units in the order an admin thinks about them: what it costs, how often, how much it moved. */
const USAGE_ROWS: { unit: EUsageUnit, label: string, of: (a: IUsageAmounts) => number }[] = [
    { unit: EUsageUnit.COST, label: 'Cost (€/$)', of: a => a.cost },
    { unit: EUsageUnit.CALLS, label: 'Calls', of: a => a.calls },
    { unit: EUsageUnit.TOKENS_IN, label: 'Input tokens', of: a => a.tokensIn },
    { unit: EUsageUnit.TOKENS_OUT, label: 'Output tokens', of: a => a.tokensOut }
]

/* 1234.5 → '1,235' and 0.42 → '0.42': a cost needs its decimals, a token count is noise with them. */
const formatSpent = (value: number): string =>
    value >= 100 ? Math.round(value).toLocaleString() : String(Math.round(value * 100) / 100)

/*
    The ceilings of one subject — a provider key or a model's own key. Shared by both dialogs because the
    rule is the same in both, and two copies of it would drift.

    Each unit carries its own switch, apart from its numbers: turning a limit off for a week should not
    cost the admin the numbers he had worked out.
*/
const UsageLimitsEditor: React.FC<IUsageLimitsEditorProps> = (props: IUsageLimitsEditorProps) => {
    const limits = props.value ?? {}

    const patch = (unit: EUsageUnit, change: Partial<IUsageWindows>) => {
        const current: IUsageWindows = limits[unit] ?? { enabled: false }
        props.onChange({ ...limits, [unit]: { ...current, ...change } })
    }

    const numberOrUndefined = (text: string): number | undefined => text === '' ? undefined : +text

    return (<Stack direction='column' spacing={1} sx={{ mt: 1 }}>
        <Typography variant='body2' color='text.secondary'>
            Stop spending on <b>{props.subject}</b>. A call goes out only if <b>no</b> enabled ceiling is
            reached — whichever is passed first blocks it, and the channel is told why.
        </Typography>
        {/* The one thing an admin must not learn the hard way, said where the limit is set. */}
        <Typography variant='caption' color='text.secondary'>
            ⚠️ A <b>calls</b> ceiling stops the call that would exceed it. <b>Tokens</b> and <b>cost</b> are
            only known once the model has answered, so those stop the <b>next</b> call: the one that crosses
            the line has already been paid for.
        </Typography>
        {props.usage && props.durable === false &&
            <Typography variant='caption' color='warning.main'>
                ⚠️ These counters are kept <b>in memory</b>, because this Kwirth has no SQL configured:
                they go back to zero on every restart, and so do the limits that depend on them.
            </Typography>
        }
        {USAGE_ROWS.map(({ unit, label, of }) => {
            const w: IUsageWindows = limits[unit] ?? { enabled: false }
            // What has been spent goes in the helper text of its own window: next to the number it is
            // measured against, which is the only place it answers anything.
            const spent = (amounts: IUsageAmounts | undefined): string | undefined =>
                amounts ? `${formatSpent(of(amounts))} so far` : undefined
            return (<Stack key={unit} direction='row' spacing={1} alignItems='flex-start'>
                <FormControlLabel sx={{ width: '190px', mr: 0, mt: 1 }} control={
                    <Checkbox checked={!!w.enabled} disabled={props.disabled}
                        onChange={e => patch(unit, { enabled: e.target.checked })} />
                } label={label} />
                <TextField value={w.daily ?? ''} onChange={e => patch(unit, { daily: numberOrUndefined(e.target.value) })}
                    label='Per day' variant='standard' type='number' fullWidth
                    disabled={props.disabled || !w.enabled} inputProps={{ min: 0 }} placeholder='no limit'
                    helperText={spent(props.usage?.daily)} />
                <TextField value={w.monthly ?? ''} onChange={e => patch(unit, { monthly: numberOrUndefined(e.target.value) })}
                    label='Per month' variant='standard' type='number' fullWidth
                    disabled={props.disabled || !w.enabled} inputProps={{ min: 0 }} placeholder='no limit'
                    helperText={spent(props.usage?.monthly)} />
            </Stack>)
        })}
    </Stack>)
}

// ── LlmSelector ─────────────────────────────────────────────────────────────

interface ILlmSelectorProps {
    llms: ILlm[]
    value: string
    onChange: (id: string) => void
    label?: string
    size?: 'small' | 'medium'
    fullWidth?: boolean
}

const LlmSelector: React.FC<ILlmSelectorProps> = ({ llms, value, onChange, label = 'LLM', size = 'small', fullWidth = true }) => {
    return (
        <FormControl size={size} fullWidth={fullWidth}>
            <InputLabel>{label}</InputLabel>
            <Select label={label} value={value} onChange={e => onChange(e.target.value)}>
                {llms.map(llm => (
                    <MenuItem key={llm.id} value={llm.id}>{llm.id} ({llm.provider}/{llm.model})</MenuItem>
                ))}
            </Select>
        </FormControl>
    )
}

// ── AiConfigLlm ──────────────────────────────────────────────────────────────

interface IAiConfigLlmProps {
    onClose: (llms: ILlm[] | undefined) => void
    providers: ILlmProvider[]
    llms: ILlm[]
    /* What each model with its own key has spent, by llm id. Optional: an older core does not send it. */
    usage?: Record<string, IUsageTotals>
    usageDurable?: boolean
}

const AiConfigLlm: React.FC<IAiConfigLlmProps> = (props: IAiConfigLlmProps) => {
    const [llms, setLlms] = useState<ILlm[]>(JSON.parse(JSON.stringify(props.llms)))
    const importLlmRef = useRef<HTMLInputElement>(null)
    const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
    const [showPassword, setShowPassword] = useState(false)
    const [id, setId] = useState('')
    const [provider, setProvider] = useState('')
    const [model, setModel] = useState('')
    const [temperature, setTemperature] = useState(0)
    const [useProviderKey, setUseProviderKey] = useState(true)
    const [key, setKey] = useState('')
    const [limits, setLimits] = useState<IUsageLimits>({})
    const [inputCostPerMillion, setInputCostPerMillion] = useState<number | ''>(0)
    const [outputCostPerMillion, setOutputCostPerMillion] = useState<number | ''>(0)

    // Re-syncs state when the models arrive asynchronously (same race fix as AiConfigProvider): on open,
    // the parent mounts the dialog with props.llms empty and requests them over WS; without this, the list
    // stayed empty until the dialog was closed and reopened.
    useEffect(() => {
        setLlms(JSON.parse(JSON.stringify(props.llms)))
        setSelectedIndex(null)
    }, [props.llms])

    const onLlmSelected = (index: number) => {
        const l = llms[index]
        if (l) {
            setId(l.id); setProvider(l.provider); setModel(l.model)
            setTemperature(l.temperature); setUseProviderKey(l.useProviderKey); setKey(l.key)
            setInputCostPerMillion(l.inputCostPerMillion ?? 0)
            setOutputCostPerMillion(l.outputCostPerMillion ?? 0)
            setLimits(l.limits ?? {})
            setSelectedIndex(index)
        }
    }

    const onNew = () => {
        setSelectedIndex(null); setId(''); setProvider(''); setModel('')
        setTemperature(0); setUseProviderKey(false); setKey(''); setInputCostPerMillion(0); setOutputCostPerMillion(0)
        setLimits({})
    }

    const onAdd = () => {
        // Limits only travel with a model that has its OWN key: with a borrowed one the budget is the
        // provider's, and keeping a stale copy here would show a ceiling that nothing enforces.
        const llm: ILlm = { id, provider, model, temperature, useProviderKey, key, inputCostPerMillion: inputCostPerMillion === '' ? 0 : inputCostPerMillion, outputCostPerMillion: outputCostPerMillion === '' ? 0 : outputCostPerMillion, ...(useProviderKey ? {} : { limits }) }
        const updated = [...llms]
        if (selectedIndex !== null) updated[selectedIndex] = llm
        else updated.push(llm)
        setLlms(updated)
        onNew()
    }

    const onRemove = () => {
        if (selectedIndex === null) return
        setLlms(llms.filter((_, i) => i !== selectedIndex))
        onNew()
    }

    return (
        <Dialog open={true} onClose={() => props.onClose(undefined)} PaperProps={{ sx: { width: '80vw', maxWidth: '800px', height: '78vh' } }}>
            <DialogTitle>AI — LLM config</DialogTitle>
            <DialogContent style={{ display: 'flex', height: '100%' }}>
                <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', boxSizing: 'border-box', maxWidth: '40%' }}>
                    <Box sx={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
                        <List sx={{ flexGrow: 1, mr: 2, width: '100%' }}>
                            {llms.map((llm, index) => (
                                <ListItemButton key={index} selected={selectedIndex === index} onClick={() => onLlmSelected(index)}>
                                    <Stack direction='column'>
                                        <Typography sx={{ fontWeight: selectedIndex === index ? 'bold' : 'normal' }}>{llm.id}</Typography>
                                        <Typography color='darkgray' fontSize={12}>{llm.provider}</Typography>
                                    </Stack>
                                </ListItemButton>
                            ))}
                        </List>
                    </Box>
                </Box>
                <Box sx={{ flex: 1, display: 'flex', alignItems: 'start', padding: '16px' }}>
                    <Stack spacing={2} style={{ width: '100%' }}>
                        <Stack direction='column' spacing={1}>
                            <TextField value={id} onChange={e => setId(e.target.value)} placeholder='Enter LLM id' label='LLM ID' variant='standard' fullWidth />
                            <FormControl variant='standard' sx={{ width: '100%' }}>
                                <InputLabel>Provider</InputLabel>
                                <Select value={provider} onChange={e => { setProvider(e.target.value); setModel('') }} variant='standard' fullWidth>
                                    {props.providers.map(p => (
                                        <MenuItem key={p.name} value={p.name} disabled={!p.models?.length}>{p.name}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                            {props.providers.find(p => p.name === provider)?.models.length
                                ? (
                                    <FormControl variant='standard' sx={{ width: '100%' }}>
                                        <InputLabel>Model</InputLabel>
                                        <Select value={model} onChange={e => setModel(e.target.value)} variant='standard' fullWidth displayEmpty>
                                            {props.providers.find(p => p.name === provider)?.models.map((m, i) => (
                                                <MenuItem key={i} value={m.id}>{m.name}</MenuItem>
                                            ))}
                                        </Select>
                                    </FormControl>
                                )
                                : (
                                    <TextField value={model} onChange={e => setModel(e.target.value)} label='Model ID' placeholder='e.g. claude-sonnet-4-5, glm-5.2' variant='standard' fullWidth />
                                )
                            }
                            <TextField value={temperature} onChange={e => setTemperature(+e.target.value)} label='Model temperature' variant='standard' type='number' fullWidth />
                            <Stack direction='row' spacing={1}>
                                <TextField value={inputCostPerMillion} onChange={e => setInputCostPerMillion(e.target.value === '' ? '' : +e.target.value)} label='Input cost / M tokens (€/$)' variant='standard' type='number' fullWidth inputProps={{ min: 0, step: 0.01 }} />
                                <TextField value={outputCostPerMillion} onChange={e => setOutputCostPerMillion(e.target.value === '' ? '' : +e.target.value)} label='Output cost / M tokens (€/$)' variant='standard' type='number' fullWidth inputProps={{ min: 0, step: 0.01 }} />
                            </Stack>
                            <Stack direction='row' alignItems='center'>
                                <Typography flex={1}>Use provider API Key (or enter a specific one)</Typography>
                                <Checkbox checked={useProviderKey} onChange={e => setUseProviderKey(e.target.checked)} />
                            </Stack>
                            <TextField value={key} onChange={e => setKey(e.target.value)} disabled={useProviderKey} label='API Key' placeholder='Enter API Key' variant='standard' fullWidth
                                type={showPassword ? 'text' : 'password'}
                                InputProps={{
                                    endAdornment: (
                                        <InputAdornment position='end'>
                                            <IconButton onClick={() => setShowPassword(!showPassword)} edge='end'>
                                                {showPassword ? <VisibilityOff /> : <Visibility />}
                                            </IconButton>
                                        </InputAdornment>
                                    )
                                }}
                            />
                            {/* Only with its own key: on a borrowed one the budget belongs to the
                                provider, and showing a ceiling here that nothing enforces is worse
                                than not showing one. */}
                            { useProviderKey
                                ? <Typography variant='caption' color='text.secondary'>
                                    Usage limits for this model live on its provider, because it borrows
                                    the provider's key — and that key is what gets billed.
                                  </Typography>
                                : <UsageLimitsEditor value={limits} onChange={setLimits} subject={`this model's own key`}
                                    usage={props.usage?.[id]} durable={props.usageDurable} />
                            }
                        </Stack>
                        <Stack direction='row' spacing={1}>
                            <Button variant='outlined' size='small' onClick={onNew}>New</Button>
                            <Typography flex={1} />
                            <Button color='error' onClick={onRemove} disabled={selectedIndex === null}>Remove</Button>
                            <Button variant='contained' onClick={onAdd} disabled={!id || !model}>{selectedIndex !== null ? 'Update' : 'Add'}</Button>
                        </Stack>
                    </Stack>
                </Box>
            </DialogContent>
            <DialogActions>
                <input ref={importLlmRef} type='file' accept='.json' style={{ display: 'none' }} onChange={e => {
                    const f = e.target.files?.[0]; if (!f) return
                    const reader = new FileReader()
                    reader.onload = ev => { try { setLlms(JSON.parse(ev.target!.result as string)) } catch {} }
                    reader.readAsText(f)
                    e.target.value = ''
                }} />
                <Button variant='outlined' startIcon={<Upload fontSize='small' />} onClick={() => importLlmRef.current?.click()}>Import</Button>
                <Button variant='outlined' startIcon={<Download fontSize='small' />} onClick={() => downloadJson(llms, 'kwirth-llms.json')}>Export</Button>
                <Box flex={1} />
                <Button onClick={() => props.onClose(llms)} variant='contained'>OK</Button>
                <Button onClick={() => props.onClose(undefined)} variant='outlined'>Cancel</Button>
            </DialogActions>
        </Dialog>
    )
}

// ── AiConfigProvider ─────────────────────────────────────────────────────────

interface IAiConfigProviderProps {
    providersAvailable: string[]
    providers: ILlmProvider[]
    onClose: (providers: ILlmProvider[] | undefined) => void
    onLoadModels?: (provider: ILlmProvider) => Promise<ILlmModel[]>
    /* What each provider key has spent, by provider name. Optional: an older core does not send it. */
    usage?: Record<string, IUsageTotals>
    usageDurable?: boolean
}

const AiConfigProvider: React.FC<IAiConfigProviderProps> = (props: IAiConfigProviderProps) => {
    const [providers, setProviders] = useState<ILlmProvider[]>(JSON.parse(JSON.stringify(props.providers)))
    const importProvRef = useRef<HTMLInputElement>(null)
    const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
    const [showPassword, setShowPassword] = useState(false)
    const [loadingModels, setLoadingModels] = useState(false)
    const loadedModelsRef = useRef<ILlmModel[]>([])

    useEffect(() => {
        setProviders(JSON.parse(JSON.stringify(props.providers)))
        setSelectedIndex(null)
    }, [props.providers])
    const [providerName, setProviderName] = useState('')
    const [providerType, setProviderType] = useState(props.providersAvailable[0] ?? '')
    const [providerKey, setProviderKey] = useState('')
    const [providerEndpoint, setProviderEndpoint] = useState('')
    const [providerLimits, setProviderLimits] = useState<IUsageLimits>({})
    const [pendingModels, setPendingModels] = useState<ILlmModel[]>([])  // solo para mostrar count en el botón

    const onProviderSelected = (p: ILlmProvider, index: number) => {
        setProviderName(p.name)
        setProviderType(p.type ?? p.name)
        setProviderKey(p.key)
        setProviderEndpoint(p.endpoint ?? '')
        setProviderLimits(p.limits ?? {})
        loadedModelsRef.current = p.models ?? []
        setPendingModels(p.models ?? [])
        setSelectedIndex(index)
    }

    const onNew = () => {
        setSelectedIndex(null)
        setProviderName('')
        setProviderType(props.providersAvailable[0] ?? '')
        setProviderKey('')
        setProviderEndpoint('')
        setProviderLimits({})
        loadedModelsRef.current = []
        setPendingModels([])
    }

    const onAdd = () => {
        if (!providerName.trim() || !providerType) return
        const endpoint = providerType === 'openai-compat' ? providerEndpoint : undefined
        const models = loadedModelsRef.current
        const updated = [...providers]
        if (selectedIndex !== null) updated[selectedIndex] = { ...updated[selectedIndex], name: providerName, type: providerType, key: providerKey, models, endpoint, limits: providerLimits }
        else updated.push({ name: providerName, type: providerType, key: providerKey, models, endpoint, limits: providerLimits })
        setProviders(updated)
        onNew()
    }

    const onRemove = () => {
        if (selectedIndex === null) return
        setProviders(providers.filter((_, i) => i !== selectedIndex))
        onNew()
    }

    const onLoadModels = async () => {
        if (!props.onLoadModels || !providerType || !providerKey) return
        setLoadingModels(true)
        try {
            const endpoint = providerType === 'openai-compat' ? providerEndpoint : undefined
            const models = await props.onLoadModels({ name: providerName, type: providerType, key: providerKey, models: [], endpoint })
            loadedModelsRef.current = models
            setPendingModels(models)
            if (selectedIndex !== null) {
                const updated = [...providers]
                updated[selectedIndex] = { ...updated[selectedIndex], models }
                setProviders(updated)
            }
        }
        finally {
            setLoadingModels(false)
        }
    }

    return (
        <Dialog open={true} onClose={() => props.onClose(undefined)} PaperProps={{ sx: { width: '80vw', maxWidth: '900px', height: 'auto', maxHeight: '90vh' } }}>
            <DialogTitle>AI — Provider config</DialogTitle>
            <DialogContent style={{ display: 'flex' }}>
                <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', boxSizing: 'border-box', maxWidth: '30%' }}>
                    <Box sx={{ flex: 1, overflowY: 'auto', maxHeight: '60vh' }}>
                        <List sx={{ mr: 1 }}>
                            {providers.map((p, index) => (
                                <ListItemButton key={index} selected={selectedIndex === index} onClick={() => onProviderSelected(p, index)}>
                                    <Stack direction='column'>
                                        <Typography sx={{ fontWeight: selectedIndex === index ? 'bold' : 'normal' }}>{p.name}</Typography>
                                        <Typography color='darkgray' fontSize={11}>{p.models?.length || 0} models loaded</Typography>
                                    </Stack>
                                </ListItemButton>
                            ))}
                        </List>
                    </Box>
                </Box>
                <Box sx={{ flex: 1, display: 'flex', alignItems: 'start', padding: '24px' }}>
                    <Stack spacing={3} style={{ width: '100%' }}>
                        <TextField label='Name' variant='standard' fullWidth placeholder='e.g. huawei-maas, openai-prod'
                            value={providerName} onChange={e => setProviderName(e.target.value)}
                            helperText='Unique identifier for this provider instance'
                        />
                        <FormControl variant='standard' sx={{ width: '100%' }}>
                            <InputLabel>Type</InputLabel>
                            <Select value={providerType} onChange={e => { setProviderType(e.target.value); if (!providerName) setProviderName(e.target.value) }} variant='standard' fullWidth>
                                {props.providersAvailable.map(t => (
                                    <MenuItem key={t} value={t}>{t}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                        <TextField label='API Key / Token' type={showPassword ? 'text' : 'password'} variant='standard' fullWidth
                            value={providerKey} onChange={e => setProviderKey(e.target.value)}
                            helperText='This key can be afterwards linked to specific uses.'
                            InputProps={{
                                endAdornment: (
                                    <InputAdornment position='end'>
                                        <IconButton onClick={() => setShowPassword(!showPassword)} edge='end'>
                                            {showPassword ? <VisibilityOff /> : <Visibility />}
                                        </IconButton>
                                    </InputAdornment>
                                )
                            }}
                        />
                        {providerType === 'openai-compat' && (
                            <TextField label='Base URL' variant='standard' fullWidth placeholder='https://your-maas-host/v1'
                                value={providerEndpoint} onChange={e => setProviderEndpoint(e.target.value)}
                                helperText='OpenAI-compatible API base URL (e.g. Huawei MaaS, vLLM, LM Studio…)'
                            />
                        )}
                        {/* The ceilings of THIS key, shared by every model that borrows it: the provider
                            bills the key, so splitting the budget per model would split a bill that it
                            keeps as one. */}
                        <UsageLimitsEditor value={providerLimits} onChange={setProviderLimits}
                            subject={`this provider's key`} disabled={!providerName.trim()}
                            usage={props.usage?.[providerName]} durable={props.usageDurable} />
                        <Box sx={{ flexGrow: 1 }} />
                        <Stack direction='row' spacing={1} alignItems='center'>
                            <Button variant='outlined' onClick={onNew}>New</Button>
                            { props.onLoadModels && (
                                <Button variant='outlined' onClick={onLoadModels} disabled={!providerType || !providerKey || loadingModels}
                                    startIcon={loadingModels ? <CircularProgress size={14} /> : undefined}>
                                    {loadingModels ? 'Loading...' : `Load models${pendingModels.length ? ` (${pendingModels.length})` : ''}`}
                                </Button>
                            )}
                            <Typography flex={1} />
                            <Button variant='text' color='error' onClick={onRemove} disabled={selectedIndex === null}>Remove</Button>
                            <Button variant='contained' onClick={onAdd} disabled={!providerName.trim() || !providerType}>{selectedIndex !== null ? 'Update' : 'Add'}</Button>
                        </Stack>
                    </Stack>
                </Box>
            </DialogContent>
            <DialogActions sx={{ p: 2 }}>
                <input ref={importProvRef} type='file' accept='.json' style={{ display: 'none' }} onChange={e => {
                    const f = e.target.files?.[0]; if (!f) return
                    const reader = new FileReader()
                    reader.onload = ev => { try { setProviders(JSON.parse(ev.target!.result as string)) } catch {} }
                    reader.readAsText(f)
                    e.target.value = ''
                }} />
                <Button variant='outlined' startIcon={<Upload fontSize='small' />} onClick={() => importProvRef.current?.click()}>Import</Button>
                <Button variant='outlined' startIcon={<Download fontSize='small' />} onClick={() => downloadJson(providers.map(p => ({ name: p.name, type: p.type ?? p.name, key: p.key, ...(p.endpoint ? { endpoint: p.endpoint } : {}) })), 'kwirth-providers.json')}>Export</Button>
                <Box flex={1} />
                <Button onClick={() => props.onClose(providers)} variant='contained'>Save</Button>
                <Button onClick={() => props.onClose(undefined)} variant='outlined'>Cancel</Button>
            </DialogActions>
        </Dialog>
    )
}

// ── ToolSelector ─────────────────────────────────────────────────────────────

interface IToolSelectorProps {
    tools: { name: string, description: string }[]
    selected: string[]
    autoTools: boolean
    disabled?: boolean
    onChange: (selected: string[], autoTools: boolean) => void
}

const ToolSelector: React.FC<IToolSelectorProps> = ({ tools, selected, autoTools, disabled, onChange }) => (
    <Stack direction='row' alignItems='flex-end' spacing={1} sx={{ width: '100%' }}>
        <FormControlLabel
            control={<Switch size='small' checked={autoTools} onChange={e => onChange(selected, e.target.checked)} disabled={disabled} />}
            label={<Typography variant='caption'>Auto</Typography>}
            sx={{ ml: 1, mr: 0, flexShrink: 0 }}
        />
        <FormControl variant='standard' fullWidth>
            <InputLabel>Tools</InputLabel>
            <Select
                multiple
                value={selected}
                onChange={e => onChange(e.target.value as string[], autoTools)}
                renderValue={sel => autoTools ? `all (${tools.length})` : (sel as string[]).join(', ')}
                variant='standard'
                disabled={disabled || autoTools}
            >
                {tools.map(t => (
                    <MenuItem key={t.name} value={t.name}>
                        <Checkbox size='small' checked={selected.includes(t.name)} />
                        <Stack direction='column'>
                            <Typography variant='body2'>{t.name}</Typography>
                            {t.description && <Typography variant='caption' color='text.secondary' sx={{ fontSize: '0.65rem' }}>{t.description}</Typography>}
                        </Stack>
                    </MenuItem>
                ))}
            </Select>
        </FormControl>
    </Stack>
)

export { LlmSelector, AiConfigLlm, AiConfigProvider, ToolSelector }
