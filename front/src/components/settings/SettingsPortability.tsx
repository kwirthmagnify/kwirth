import React, { useMemo, useRef, useState } from 'react'
import { Alert, Box, Button, Checkbox, CircularProgress, FormControlLabel, IconButton, Radio, Stack, Tooltip, Typography } from '@mui/material'
import { ArrowDownward, ArrowUpward, Delete, Visibility, VisibilityOff } from '@kwirthmagnify/kwirth-common-front/icons'
import { IConfigBundle, IConfigMergeDifference, IConfigMergeSource, TConfigMergeChoices, EConfigMergeItemKind, analyzeMerge, buildMerged, validateBundle } from '@kwirthmagnify/kwirth-common'
import { addGetAuthorization } from '../../tools/AuthorizationManagement'
import { VERSION } from '../../version'

/*
    Kwirth settings → Portability (plans/config-merge).

    The user adds as many sources as they want (exported files and, if they want, this Kwirth's current
    configuration). The screen shows them in the ORDER they are merged (#1, #2…), which the user changes with
    the arrows. What is in one source only, or identical in all, goes in on its own and is never asked; for
    every element that DIFFERS the user says which source to apply. Nothing is applied to this Kwirth: the
    result is downloaded and imported with Kwirth import.

    The merge itself is common's (`analyzeMerge`, `buildMerged`): the same reading of the format as the import.
*/

const THIS_KWIRTH = 'This Kwirth'

const KIND_NAMES: Record<EConfigMergeItemKind, string> = {
    [EConfigMergeItemKind.SETTING]: 'Setting',
    [EConfigMergeItemKind.MARKETPLACE]: 'Marketplace',
    [EConfigMergeItemKind.PACKAGE_REGISTRY]: 'Package registry',
    [EConfigMergeItemKind.TRUSTED_PROXY]: 'Trusted proxy',
    [EConfigMergeItemKind.LOGIN_IP_ALLOWED]: 'Login address',
    [EConfigMergeItemKind.LOG_LEVEL]: 'Log level',
    [EConfigMergeItemKind.AI_PROVIDER]: 'AI provider',
    [EConfigMergeItemKind.AI_MODEL]: 'AI model',
    [EConfigMergeItemKind.EXTENSION]: 'Extension'
}

// The fields that hold a secret: masked unless the eye is open.
const SECRET_FIELD = /(password|token|secret|apikey|^key$)/i
const MASK = '••••••'

type TObject = Record<string, unknown>
const isObject = (v: unknown): v is TObject => typeof v === 'object' && v !== null && !Array.isArray(v)

const masked = (value: unknown, reveal: boolean): unknown => {
    if (reveal) return value
    if (Array.isArray(value)) return value.map(v => masked(v, reveal))
    if (isObject(value)) {
        const result: TObject = {}
        for (const key of Object.keys(value)) {
            const v = value[key]
            result[key] = SECRET_FIELD.test(key) && typeof v === 'string' && v !== '' ? MASK : masked(v, reveal)
        }
        return result
    }
    return value
}

const shown = (v: unknown): string => v === undefined ? '(not set)' : typeof v === 'string' ? v : JSON.stringify(v)


interface ISettingsPortabilityProps {
    clusterUrl: string
    accessString: string
    disabled: boolean
}

const SettingsPortability: React.FC<ISettingsPortabilityProps> = (props: ISettingsPortabilityProps) => {
    const [sources, setSources] = useState<IConfigMergeSource[]>([])
    const [choices, setChoices] = useState<TConfigMergeChoices>({})
    const [withCredentials, setWithCredentials] = useState(false)
    const [loadingThis, setLoadingThis] = useState(false)
    const [message, setMessage] = useState<{ error: boolean, text: string }>({ error: false, text: '' })
    const [reveal, setReveal] = useState(false)
    const fileInput = useRef<HTMLInputElement | null>(null)

    const analysis = useMemo(() => analyzeMerge(sources), [sources])
    const pending = analysis.differences.filter(d => choices[d.key] === undefined).length
    const automatic = Object.values(analysis.merged).reduce<number>((a, b) => a + (b ?? 0), 0)
    const hasThisKwirth = sources.some(s => s.name === THIS_KWIRTH)
    const off = props.disabled

    const addSources = (added: IConfigMergeSource[]) => {
        setSources(prev => [...prev, ...added])
    }

    const addFiles = async (files: FileList | null) => {
        if (!files || files.length === 0) return
        const added: IConfigMergeSource[] = []
        const rejected: string[] = []
        for (const file of Array.from(files)) {
            try {
                const data: unknown = JSON.parse(await file.text())
                // The same checks as the import: a file that is not Kwirth's never enters the list.
                const problem = validateBundle(data)
                if (problem) rejected.push(`${file.name}: ${problem}`)
                else added.push({ name: file.name, bundle: data as IConfigBundle })
            }
            catch {
                rejected.push(`${file.name}: not valid JSON`)
            }
        }
        if (fileInput.current) fileInput.current.value = ''
        addSources(added)
        setMessage(rejected.length > 0 ? { error: true, text: `Rejected ${rejected.join('; ')}` } : { error: false, text: '' })
    }

    // This Kwirth's configuration is exactly its export. Reading it changes nothing.
    const addThisKwirth = async () => {
        setLoadingThis(true)
        try {
            const response = await fetch(`${props.clusterUrl}/core/config-bundle/export?credentials=${withCredentials}`, addGetAuthorization(props.accessString))
            if (!response.ok) {
                setMessage({ error: true, text: `Could not read this Kwirth's configuration (${response.status}).` })
                return
            }
            const data: unknown = await response.json()
            const problem = validateBundle(data)
            if (problem) {
                setMessage({ error: true, text: `This Kwirth's configuration could not be read: ${problem}` })
                return
            }
            addSources([{ name: THIS_KWIRTH, bundle: data as IConfigBundle }])
            setMessage({ error: false, text: '' })
        }
        catch {
            setMessage({ error: true, text: 'Could not reach Kwirth to read its configuration.' })
        }
        finally {
            setLoadingThis(false)
        }
    }

    // The choices point at source positions: moving or removing a source carries them along.
    const remapChoices = (map: (index: number) => number | undefined) => setChoices(prev => {
        const next: TConfigMergeChoices = {}
        for (const key of Object.keys(prev)) {
            const index = map(prev[key])
            if (index !== undefined) next[key] = index
        }
        return next
    })

    const move = (index: number, delta: number) => {
        const other = index + delta
        if (other < 0 || other >= sources.length) return
        setSources(prev => prev.map((s, i) => i === index ? prev[other] : i === other ? prev[index] : s))
        remapChoices(i => i === index ? other : i === other ? index : i)
    }

    const remove = (index: number) => {
        setSources(prev => prev.filter((_, i) => i !== index))
        remapChoices(i => i === index ? undefined : i > index ? i - 1 : i)
    }

    const download = () => {
        try {
            const merged = buildMerged(sources, choices, VERSION, new Date().toISOString())
            const blob = new Blob([JSON.stringify(merged, null, 2)], { type: 'application/json' })
            const link = document.createElement('a')
            link.href = URL.createObjectURL(blob)
            link.download = `kwirth-config-merged-${new Date().toISOString().slice(0, 10)}.json`
            link.click()
            URL.revokeObjectURL(link.href)
        }
        catch (err) {
            setMessage({ error: true, text: `Could not build the merged file: ${err instanceof Error ? err.message : String(err)}` })
        }
    }

    // What the user has to do, in one sentence.
    const status = sources.length === 0
        ? { severity: 'info' as const, text: 'Add the files to merge (and, if you want, this Kwirth). They are merged in the order shown.' }
        : analysis.differences.length === 0
            ? { severity: 'success' as const, text: `Nothing to decide: all ${automatic} elements are identical or in one source only. Ready to download.` }
            : pending > 0
                ? { severity: 'warning' as const, text: `${analysis.differences.length} elements differ between sources: choose which one to apply in each. ${pending} left to choose. The other ${automatic} go in on their own.` }
                : { severity: 'success' as const, text: `All ${analysis.differences.length} differences decided. The other ${automatic} elements go in on their own. Ready to download.` }

    const differenceRow = (d: IConfigMergeDifference) => {
        // what really differs, as the engine sees it (a secret blanked by a credential-free export does not count)
        const fields = d.fields
        const chosen = choices[d.key]
        const valueOf = (value: unknown): string => {
            const m = masked(value, reveal)
            if (fields === undefined) return shown(m)
            return fields.map(f => `${f}: ${shown((m as TObject)[f])}`).join(' · ')
        }
        return (
            <Box key={d.key} data-testid={`portability-diff-${d.key}`}
                sx={{ borderLeft: 4, borderColor: chosen === undefined ? 'warning.main' : 'success.main', px: 1, py: 0.5, mb: 0.5, bgcolor: 'action.hover' }}>
                <Typography variant='body2' noWrap title={d.key}>
                    <b>{KIND_NAMES[d.kind]} {d.label}</b>
                    <Typography component='span' variant='body2' sx={{ color: 'text.secondary' }}>
                        {fields === undefined ? ' — different value' : ` — differs in: ${fields.join(', ')}`}
                    </Typography>
                </Typography>
                { d.values.map(v =>
                    <Stack key={v.sourceIndex} direction='row' sx={{ alignItems: 'center', cursor: off ? undefined : 'pointer' }}
                        onClick={() => { if (!off) setChoices(prev => ({ ...prev, [d.key]: v.sourceIndex })) }}>
                        <Radio size='small' checked={chosen === v.sourceIndex} disabled={off} sx={{ py: 0.25 }}
                            slotProps={{ input: { 'aria-label': `Apply ${sources[v.sourceIndex]?.name} for ${d.label}` } }} />
                        <Typography variant='body2' sx={{ width: 200, flexShrink: 0 }} noWrap title={sources[v.sourceIndex]?.name}>
                            #{v.sourceIndex + 1} {sources[v.sourceIndex]?.name}
                        </Typography>
                        <Typography variant='body2' noWrap sx={{ minWidth: 0, fontFamily: 'monospace', fontSize: 12 }} title={valueOf(v.value)}>{valueOf(v.value)}</Typography>
                    </Stack>
                )}
            </Box>
        )
    }

    return (
        <Stack spacing={1} direction='column' sx={{ mt: 2 }}>
            {/* 1. Sources, in merge order */}
            <Stack direction='row' spacing={1} sx={{ alignItems: 'center' }}>
                <Typography variant='subtitle2' sx={{ width: 110 }}>Merge order</Typography>
                <input ref={fileInput} type='file' accept='.json,application/json' multiple hidden data-testid='portability-file-input'
                    onChange={e => addFiles(e.target.files)} />
                <Button size='small' variant='outlined' onClick={() => fileInput.current?.click()} disabled={off}>Add files</Button>
                <Button size='small' variant='outlined' onClick={addThisKwirth} disabled={off || loadingThis || hasThisKwirth}
                    startIcon={loadingThis ? <CircularProgress size={14} /> : undefined}>Add this Kwirth</Button>
                <FormControlLabel sx={{ ml: 0 }} control={<Checkbox size='small' checked={withCredentials} onChange={e => setWithCredentials(e.target.checked)} disabled={off || hasThisKwirth} />}
                    label={<Typography variant='body2'>Include credentials</Typography>} />
                <Typography variant='body2' noWrap title={message.text} color='error' sx={{ flex: 1, minWidth: 0 }} data-testid='portability-message'>{message.text}</Typography>
            </Stack>
            <Box sx={{ height: 92, overflowY: 'auto', border: 1, borderColor: 'divider', borderRadius: 1, px: 1 }} data-testid='portability-sources'>
                { sources.map((s, i) =>
                    <Stack key={`${i}-${s.name}`} direction='row' spacing={1} sx={{ alignItems: 'center' }}>
                        <Typography variant='body2' sx={{ width: 28 }}><b>#{i + 1}</b></Typography>
                        <Typography variant='body2' noWrap sx={{ flex: 1, minWidth: 0 }} title={s.name}>{s.name}</Typography>
                        <Typography variant='caption' noWrap sx={{ width: 400, flexShrink: 0, color: 'text.secondary' }}>
                            exported {s.bundle.meta?.exportedAt ? new Date(s.bundle.meta.exportedAt).toLocaleString() : '—'} · Kwirth {s.bundle.meta?.kwirthVersion ?? '—'} · {s.bundle.meta?.includesCredentials ? 'with credentials' : 'no credentials'}
                        </Typography>
                        <IconButton size='small' aria-label={`Move ${s.name} up`} disabled={off || i === 0} onClick={() => move(i, -1)}><ArrowUpward fontSize='small' /></IconButton>
                        <IconButton size='small' aria-label={`Move ${s.name} down`} disabled={off || i === sources.length - 1} onClick={() => move(i, 1)}><ArrowDownward fontSize='small' /></IconButton>
                        <IconButton size='small' color='error' aria-label={`Remove ${s.name}`} disabled={off} onClick={() => remove(i)}><Delete fontSize='small' /></IconButton>
                    </Stack>
                )}
                { sources.length === 0 && <Typography variant='body2' sx={{ color: 'text.secondary', pt: 1 }}>No sources yet.</Typography> }
            </Box>

            {/* 2. What there is to do */}
            <Alert severity={status.severity} sx={{ py: 0 }} data-testid='portability-status'>{status.text}</Alert>

            {/* 3. The differences, and only them */}
            <Stack direction='row' sx={{ alignItems: 'center' }}>
                <Typography variant='subtitle2' sx={{ flex: 1 }}>Differences</Typography>
                <Tooltip title={reveal ? 'Hide secrets' : 'Show secrets'}>
                    <span><IconButton size='small' onClick={() => setReveal(!reveal)} aria-label={reveal ? 'Hide secrets' : 'Show secrets'} disabled={off}>
                        { reveal ? <VisibilityOff fontSize='small' /> : <Visibility fontSize='small' /> }
                    </IconButton></span>
                </Tooltip>
            </Stack>
            <Box sx={{ height: 166, overflowY: 'auto', border: 1, borderColor: 'divider', borderRadius: 1, p: 1 }}>
                { analysis.differences.map(differenceRow) }
                { analysis.differences.length === 0 && <Typography variant='body2' sx={{ color: 'text.secondary' }}>None.</Typography> }
            </Box>

            <Stack direction='row' spacing={2} sx={{ alignItems: 'center' }}>
                <Button variant='contained' size='small' onClick={download} disabled={off || sources.length === 0 || pending > 0}>Download merged file</Button>
                <Typography variant='body2' noWrap title={analysis.warnings.join('\n')} color='warning.main' sx={{ minWidth: 0 }} data-testid='portability-warnings'>
                    {analysis.warnings.join('; ')}
                </Typography>
            </Stack>
        </Stack>
    )
}

export { SettingsPortability }
