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

/*
    The height of the content of BOTH config dialogs, and the one number that keeps them still.

    The rule, and it is not negotiable the next time a field is added: THE CONTENT IS FIXED AND THE DIALOG
    ADAPTS TO IT. One size for the two dialogs, because they are the same form seen twice and nothing is
    more obviously broken than the two resizing against each other when the user switches between them.

    Sized for the tallest state either form reaches (the limits editor: four units × two windows). Anything
    taller scrolls inside its column — it does NOT grow the box.
*/
/*
    🔴 THE CONTENT HAS A FIXED SIZE AND THE DIALOG ADAPTS TO IT. Never the reverse.

    'Fixed' does NOT mean a magic number of pixels: that is how the gap between the form and the buttons
    appeared —a panel taller than what was inside it— and how a dialog ends up half empty. It means the
    content cannot CHANGE size: every field is always on screen (disabled when it does not apply, never
    removed), captions are a single fixed line, and the columns are COL_WIDTH wide.

    With nothing left that can grow or vanish, the form measures the same always, the list stretches to
    whatever the form measures, and the dialog is simply as big as the two of them.
*/

/*
    And the WIDTH of each of the two form columns, for the same reason. Fixed too, because 'adapts to the
    content' cuts both ways: columns that stretch with the window are not a fixed content either, and a
    percentage width is what once truncated the 'Temperature' label to 'Tempe…'.

    These two plus the 220px list are the whole content, so the Paper can simply be as wide as they are.
*/
const COL_WIDTH = 340

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

    /*
        Compact on purpose. These rows used to be three paragraphs of prose and four full-height fields,
        which pushed the Add/Update button below the fold — and that button is the one that applies the
        form to the list, so a limit typed above it looked saved and was not. Height here is not a
        cosmetic matter: it is what decides whether the control that commits the edit can be seen.

        What was dropped is repetition, not meaning. The one thing an admin must not learn the hard way
        — that a tokens or cost ceiling stops the NEXT call, because the amount is only known once the
        model has answered — is still said, in one line, where the limit is set.
    */
    return (<Stack direction='column' spacing={0.5} sx={{ mt: 0.5 }}>
        <Typography variant='caption' color='text.secondary'>
            Stop spending on <b>{props.subject}</b>: a call goes out only if <b>no</b> enabled ceiling is
            reached. ⚠️ A <b>calls</b> ceiling stops the call that would exceed it; <b>tokens</b> and
            <b> cost</b> are only known after the answer, so those stop the <b>next</b> one.
        </Typography>
        {props.usage && props.durable === false &&
            <Typography variant='caption' color='warning.main'>
                ⚠️ Counters kept <b>in memory</b> (no SQL): they reset on every restart, and so do these limits.
            </Typography>
        }
        {USAGE_ROWS.map(({ unit, label, of }) => {
            const w: IUsageWindows = limits[unit] ?? { enabled: false }
            /*
                🔴 El gasto YA NO va bajo cada campo. Iba en el helperText de su ventana, y aparecía
                sólo cuando había consumo — así que el diálogo CAMBIABA DE TAMAÑO al seleccionar un
                modelo: ocho helpers que aparecen de golpe son ocho líneas más de alto, y el contenido
                salta bajo el cursor. Un diálogo que se mueve mientras lo lees cuesta más que el dato
                que daba, y el dato está en el panel de consumo.
            */
            return (<Stack key={unit} direction='row' spacing={1} alignItems='flex-start'>
                {/* flexShrink: 0 — inside the row the label box would otherwise shrink below its width
                    and split 'Input tokens' into two lines, which costs the height the two columns were
                    meant to save. */}
                <FormControlLabel sx={{ width: '150px', flexShrink: 0, mr: 0, mt: 0.5 }} control={
                    <Checkbox size='small' checked={!!w.enabled} disabled={props.disabled}
                        onChange={e => patch(unit, { enabled: e.target.checked })} />
                } label={<Typography variant='body2'>{label}</Typography>} />
                <TextField value={w.daily ?? ''} onChange={e => patch(unit, { daily: numberOrUndefined(e.target.value) })}
                    label='Per day' variant='standard' type='number' fullWidth size='small'
                    disabled={props.disabled || !w.enabled} inputProps={{ min: 0 }} placeholder='no limit' />
                <TextField value={w.monthly ?? ''} onChange={e => patch(unit, { monthly: numberOrUndefined(e.target.value) })}
                    label='Per month' variant='standard' type='number' fullWidth size='small'
                    disabled={props.disabled || !w.enabled} inputProps={{ min: 0 }} placeholder='no limit' />
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
    // Empty, not zero, and that is the whole point: empty means 'the provider's price', while 0 is a
    // stated price — a free or self-hosted model. Defaulting these to 0 made every model declare that it
    // was free, and no provider default could ever be reached.
    const [inputCostPerMillion, setInputCostPerMillion] = useState<number | ''>('')
    const [outputCostPerMillion, setOutputCostPerMillion] = useState<number | ''>('')

    // Re-syncs state when the models arrive asynchronously (same race fix as AiConfigProvider): on open,
    // the parent mounts the dialog with props.llms empty and requests them over WS; without this, the list
    // stayed empty until the dialog was closed and reopened.
    useEffect(() => {
        setLlms(JSON.parse(JSON.stringify(props.llms)))
        setSelectedIndex(null)
    }, [props.llms])

    /* What the selected provider charges, as the placeholder of an empty price field: the fallback is
       only useful if the admin can SEE what they are inheriting before leaving the field blank. Nothing
       declared on the provider, and the fallback is 0, so the placeholder says so instead of staying
       empty — an empty cost box is exactly what made this look like 'free'. */
    const providerCost = (providerName: string, field: 'inputCostPerMillion' | 'outputCostPerMillion'): string => {
        const p = props.providers.find(p => p.name === providerName)
        return p?.[field] !== undefined ? `${p[field]} (provider)` : '0 (provider)'
    }

    const onLlmSelected = (index: number) => {
        const l = llms[index]
        if (l) {
            setId(l.id); setProvider(l.provider); setModel(l.model)
            setTemperature(l.temperature); setUseProviderKey(l.useProviderKey); setKey(l.key)
            setInputCostPerMillion(l.inputCostPerMillion ?? '')
            setOutputCostPerMillion(l.outputCostPerMillion ?? '')
            setLimits(l.limits ?? {})
            setSelectedIndex(index)
        }
    }

    const onNew = () => {
        setSelectedIndex(null); setId(''); setProvider(''); setModel('')
        setTemperature(0); setUseProviderKey(false); setKey(''); setInputCostPerMillion(''); setOutputCostPerMillion('')
        setLimits({})
    }

    const onAdd = () => {
        // Prices and limits travel ALWAYS, borrowed key or not, and a field left empty is left out so the
        // back end falls back to the provider's. Writing a 0 for an empty price would persist 'free', and
        // dropping the limits on a borrowed key cost the admin the only way of cutting one model short
        // before the shared budget ran out.
        const llm: ILlm = { id, provider, model, temperature, useProviderKey, key,
            ...(inputCostPerMillion === '' ? {} : { inputCostPerMillion }),
            ...(outputCostPerMillion === '' ? {} : { outputCostPerMillion }),
            limits }
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

    /*
        Height follows the content instead of being pinned at 78vh. A fixed height is what put the
        Add/Update button below the fold on a short screen: the form grew, the dialog did not, and the
        control that applies the form to the list scrolled out of sight.
    */
    return (
        <Dialog open={true} onClose={() => props.onClose(undefined)} PaperProps={{ sx: { width: 'auto', maxWidth: 'none', height: 'auto' } }}>
            <DialogTitle sx={{ pb: 1 }}>AI — LLM config</DialogTitle>
            <DialogContent style={{ display: 'flex' }}>
                {/* The list STRETCHES to the height the form sets, and never sets it itself: absolute
                    inside a relative box, so fifty entries scroll instead of making the dialog taller. */}
                <Box sx={{ flex: '0 0 220px', boxSizing: 'border-box', position: 'relative' }}>
                    <Box sx={{ position: 'absolute', inset: 0, overflowY: 'auto', overflowX: 'hidden' }}>
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
                {/* The buttons acting on the selection live HERE, at the bottom of the data column — not
                    in a row under the list, which is where they ended up when the content was laid out as
                    one column. The list owns its full height and reaches the bottom; New sits under the
                    properties it creates. */}
                <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '16px', minWidth: 0 }}>
                    <Stack spacing={2} style={{ width: '100%' }}>
                        <Stack direction='row' spacing={3} alignItems='stretch' sx={{ flexWrap: 'wrap', height: '100%' }}>
                        <Stack direction='column' spacing={1} sx={{ flex: `0 0 ${COL_WIDTH}px`, width: COL_WIDTH }}>
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
                            <TextField value={temperature} onChange={e => setTemperature(+e.target.value)} label='Temperature' variant='standard' type='number' fullWidth />
                            {/* The two costs on ONE row, always: they are read together —what a thousand
                                tokens in and out cost— and wrapping split them across rows as soon as the
                                column got narrow. No wrap, half the column each.

                                Empty = the provider's price, which the placeholder states outright: a
                                blank cost field otherwise reads as 'free', and that is a bill nobody is
                                counting. */}
                            <Stack direction='row' spacing={1} sx={{ flexWrap: 'nowrap' }}>
                                <TextField value={inputCostPerMillion} onChange={e => setInputCostPerMillion(e.target.value === '' ? '' : +e.target.value)} label='Input cost /M' variant='standard' type='number' sx={{ flex: 1, minWidth: 0 }} inputProps={{ min: 0, step: 0.01 }}
                                    placeholder={providerCost(provider, 'inputCostPerMillion')} InputLabelProps={{ shrink: true }} />
                                <TextField value={outputCostPerMillion} onChange={e => setOutputCostPerMillion(e.target.value === '' ? '' : +e.target.value)} label='Output cost /M' variant='standard' type='number' sx={{ flex: 1, minWidth: 0 }} inputProps={{ min: 0, step: 0.01 }}
                                    placeholder={providerCost(provider, 'outputCostPerMillion')} InputLabelProps={{ shrink: true }} />
                            </Stack>
                            <Stack direction='row' alignItems='center'>
                                <Typography flex={1}>Use provider API Key</Typography>
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
                        </Stack>
                        {/* Editable ALWAYS, borrowed key or not. It used to be hidden behind its own key,
                            on the grounds that the provider bills the key — true, but it left an admin
                            with no way of cutting one model short before the shared budget ran out.

                            Second column, not another row: see the provider dialog — the limits block is
                            what pushed Add/Update below the fold. */}
                        <Stack direction='column' spacing={1} sx={{ flex: `0 0 ${COL_WIDTH}px`, width: COL_WIDTH }}>
                            <Typography variant='subtitle2'>Usage limits</Typography>
                            {/* One fixed wording: the previous one grew by two lines when the checkbox was
                                ticked, and that alone resized the form. */}
                            <UsageLimitsEditor value={limits} onChange={setLimits} subject={`the key this model uses`}
                                usage={props.usage?.[id]} durable={props.usageDurable} />
                            {/* Said where it is typed, not in a guide: the ceiling is real, but what it
                                measures is not what the field seems to promise. ONE fixed line, the same
                                in both cases — a caption that grows when the checkbox is ticked is one
                                more thing resizing the form. */}
                            <Typography variant='caption' color='text.secondary'>
                                Left empty, the provider's limits apply. Spending is counted per API key.
                            </Typography>
                        </Stack>
                        </Stack>
                    </Stack>
                    <Stack direction='row' spacing={1} sx={{ pt: 2 }}>
                        <Button variant='outlined' size='small' onClick={onNew}>New</Button>
                        <Typography flex={1} />
                        <Button color='error' onClick={onRemove} disabled={selectedIndex === null}>Remove</Button>
                        <Button variant='contained' onClick={onAdd} disabled={!id || !model}>{selectedIndex !== null ? 'Update' : 'Add'}</Button>
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
    /* The DEFAULT price of this provider's models, which each model may override. Here so that adding a
       model does not mean looking the provider's rate up again — not because the key has a price. */
    const [providerInputCost, setProviderInputCost] = useState<number | ''>('')
    const [providerOutputCost, setProviderOutputCost] = useState<number | ''>('')
    const [pendingModels, setPendingModels] = useState<ILlmModel[]>([])  // solo para mostrar count en el botón

    const onProviderSelected = (p: ILlmProvider, index: number) => {
        setProviderName(p.name)
        setProviderType(p.type ?? p.name)
        setProviderKey(p.key)
        setProviderEndpoint(p.endpoint ?? '')
        setProviderLimits(p.limits ?? {})
        setProviderInputCost(p.inputCostPerMillion ?? '')
        setProviderOutputCost(p.outputCostPerMillion ?? '')
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
        setProviderInputCost('')
        setProviderOutputCost('')
        loadedModelsRef.current = []
        setPendingModels([])
    }

    const onAdd = () => {
        if (!providerName.trim() || !providerType) return
        const endpoint = providerType === 'openai-compat' ? providerEndpoint : undefined
        const models = loadedModelsRef.current
        // An empty price is left OUT, never written as 0: a model inheriting it would be counted free.
        const costs = {
            ...(providerInputCost === '' ? { inputCostPerMillion: undefined } : { inputCostPerMillion: providerInputCost }),
            ...(providerOutputCost === '' ? { outputCostPerMillion: undefined } : { outputCostPerMillion: providerOutputCost })
        }
        const updated = [...providers]
        if (selectedIndex !== null) updated[selectedIndex] = { ...updated[selectedIndex], name: providerName, type: providerType, key: providerKey, models, endpoint, limits: providerLimits, ...costs }
        else updated.push({ name: providerName, type: providerType, key: providerKey, models, endpoint, limits: providerLimits, ...costs })
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
        <Dialog open={true} onClose={() => props.onClose(undefined)} PaperProps={{ sx: { width: 'auto', maxWidth: 'none', height: 'auto' } }}>
            <DialogTitle sx={{ pb: 1 }}>AI — Provider config</DialogTitle>
            {/* Same layout as the LLM dialog: see the notes there. */}
            <DialogContent style={{ display: 'flex' }}>
                <Box sx={{ flex: '0 0 220px', boxSizing: 'border-box', position: 'relative' }}>
                    <Box sx={{ position: 'absolute', inset: 0, overflowY: 'auto' }}>
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
                {/* The buttons acting on the selection live HERE, at the bottom of the data column — not
                    in a row under the list, which is where they ended up when the content was laid out as
                    one column. The list owns its full height and reaches the bottom; New sits under the
                    properties it creates. */}
                <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '16px', minWidth: 0 }}>
                    <Stack spacing={2} style={{ width: '100%' }}>
                    <Stack direction='row' spacing={3} alignItems='flex-start' sx={{ flexWrap: 'wrap' }}>
                    <Stack direction='column' spacing={1} sx={{ flex: `0 0 ${COL_WIDTH}px`, width: COL_WIDTH }}>
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
                        {/* ALWAYS on screen, disabled when the type does not use it. A field that comes
                            and goes moves everything under it and makes the form look different for each
                            provider type; disabled says the same thing and stays put. */}
                        <TextField label='Base URL' variant='standard' fullWidth placeholder='https://your-maas-host/v1'
                            value={providerEndpoint} onChange={e => setProviderEndpoint(e.target.value)}
                            disabled={providerType !== 'openai-compat'}
                        />
                        {/* The DEFAULT for this provider's models, each free to override it. What is true
                            of the provider as a whole goes here once, instead of being retyped on every
                            model added. Left empty, a model with no price of its own counts as 0. */}
                        <Typography variant='subtitle2' sx={{ pt: 1 }}>Default model costs</Typography>
                        <Stack direction='row' spacing={1} sx={{ flexWrap: 'wrap' }}>
                            <TextField value={providerInputCost} onChange={e => setProviderInputCost(e.target.value === '' ? '' : +e.target.value)} label='Input cost /M' variant='standard' type='number' sx={{ flex: 1, minWidth: '110px' }} inputProps={{ min: 0, step: 0.01 }} />
                            <TextField value={providerOutputCost} onChange={e => setProviderOutputCost(e.target.value === '' ? '' : +e.target.value)} label='Output cost /M' variant='standard' type='number' sx={{ flex: 1, minWidth: '110px' }} inputProps={{ min: 0, step: 0.01 }} />
                        </Stack>
                        <Typography variant='caption' color='text.secondary'>
                            Used by models that declare no cost of their own.
                        </Typography>
                    </Stack>
                    {/* The ceilings of THIS key, shared by every model that borrows it: the provider
                        bills the key, so splitting the budget per model would split a bill that it
                        keeps as one.

                        Second column, not another row: four units × two windows is the tallest block of
                        the form, and stacked under the credentials it pushed the Add/Update button out
                        of sight on a laptop screen. */}
                    <Stack direction='column' spacing={1} sx={{ flex: `0 0 ${COL_WIDTH}px`, width: COL_WIDTH }}>
                        <Typography variant='subtitle2'>Usage limits</Typography>
                        <UsageLimitsEditor value={providerLimits} onChange={setProviderLimits}
                            subject={`this provider's key`} disabled={!providerName.trim()}
                            usage={props.usage?.[providerName]} durable={props.usageDurable} />
                    </Stack>
                    </Stack>
                    </Stack>
                    <Stack direction='row' spacing={1} alignItems='center' sx={{ pt: 2 }}>
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
