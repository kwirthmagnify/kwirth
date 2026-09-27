import React, { useState, useEffect, useContext } from 'react'
import { Alert, Box, Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent, FormControlLabel, Stack, Typography } from '@mui/material'
import { Download, Upload } from '@kwirthmagnify/kwirth-common-front/icons'
import { DialogTitleHelp, docsUrl } from '@kwirthmagnify/kwirth-common-front'
import { EExtensionType, IConfigBundle, IExportableEntry, IImportPreviewEntry, IImportReport, EBundleEntryStatus,
    CONFIG_BUNDLE_KIND, CORE_SETTINGS_KEY, CORE_SHARED_AI_KEY, bundleEntryKey } from '@kwirthmagnify/kwirth-common'
import { SessionContext, SessionContextType } from '../../model/SessionContext'
import { addGetAuthorization, addPostAuthorization } from '../../tools/AuthorizationManagement'

/*
    Kwirth portability: taking a whole installation's configuration to another Kwirth.

    It used to hang off the settings dialog, sharing its Export/Import buttons with a second format of its
    own ('kwirth-settings') that carried only the core's settings. That one is gone — the bundle does the
    same and reaches further — and what was left of it lives here, on its own, because it is not a setting:
    it is an operation over the whole installation, extensions included.

    THIS FILE DOES NOT UNDERSTAND WHAT IT CARRIES, and neither does the core. Each extension decides what
    of its own is configuration; here entries are listed and ticked, and the content travels opaque. See
    `plans/config-portability/PRD.md`.
*/

// An item of the list. The key carries the type up front so a plugin and a provider with the same id do
// not collide in the same Set.
interface ISelectableItem {
    key: string
    label: string
    detail: string
    /** The block it is grouped into. The core's own goes together; extensions, by type. */
    group: string
}

const GROUP_GENERAL = 'Kwirth'

// Block name per extension type. In the plural, which is how they are named in the rest of the UI.
const groupOf = (type: EExtensionType): string => {
    switch (type) {
        case EExtensionType.PLUGIN: return 'Plugins'
        case EExtensionType.PROVIDER: return 'Providers'
        case EExtensionType.SENDER: return 'Senders'
        case EExtensionType.WEBHOOK: return 'Webhooks'
        case EExtensionType.IDP: return 'Identity providers'
        case EExtensionType.AITOOLSET: return 'AI toolsets'
        case EExtensionType.THEME: return 'Themes'
        case EExtensionType.HOMEPAGE: return 'Homepages'
        case EExtensionType.LOGIN: return 'Logins'
        case EExtensionType.DOCS: return 'Documentation'
        case EExtensionType.PACK: return 'Packs'
        default: return 'Extensions'
    }
}

interface ISettingsPortabilityProps {
    onClose: () => void
    clusterName?: string
    clusterUrl: string
    accessString: string
}

const SettingsPortability: React.FC<ISettingsPortabilityProps> = (props: ISettingsPortabilityProps) => {
    const [mode, setMode] = useState<'export'|'import'>('export')
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [result, setResult] = useState<string|undefined>(undefined)
    /*
        What the EXTENSIONS contribute. The core does not know what is inside each one — only they know
        which of their own is configuration — so here they are listed and ticked; the content is asked for
        and handed over by the back end.
    */
    const [extensions, setExtensions] = useState<IExportableEntry[]>([])
    const [selected, setSelected] = useState<Set<string>>(new Set())
    const [withCredentials, setWithCredentials] = useState(false)
    const [importBundle, setImportBundle] = useState<IConfigBundle|undefined>(undefined)
    const [importPreview, setImportPreview] = useState<IImportPreviewEntry[]>([])
    const fileRef = React.useRef<HTMLInputElement>(null)
    const { backendUrl } = useContext(SessionContext) as SessionContextType

    const exportableKeys = (list: IExportableEntry[]): string[] =>
        list.filter(e => e.status === EBundleEntryStatus.AVAILABLE).map(e => bundleEntryKey(e.type, e.id))

    useEffect(() => {
        const load = async () => {
            try {
                const response = await fetch(`${props.clusterUrl}/core/config-bundle/exportable`, addGetAuthorization(props.accessString))
                if (!response.ok) {
                    setError(response.status === 403 ? 'You need the admin scope to export or import the configuration.' : `Could not read what can be exported (${response.status}).`)
                    return
                }
                const list = await response.json() as IExportableEntry[]
                setExtensions(list)
                // Everything that can travel starts ticked: the usual case is taking it all.
                setSelected(new Set([CORE_SETTINGS_KEY, CORE_SHARED_AI_KEY, ...exportableKeys(list)]))
            }
            catch {
                setError('Could not reach Kwirth.')
            }
            finally {
                setLoading(false)
            }
        }
        load()
    }, [props.clusterUrl, props.accessString])

    /*
        The extensions as items. ALL the installed ones are listed, whether they can export or not:
        whoever looks at this has to see their plugin and why it is not going, rather than find a short
        list with no explanation. The ones that cannot come out without a tick box, with the reason.
    */
    const extensionItems = (): ISelectableItem[] => extensions.map(e => ({
        key: bundleEntryKey(e.type, e.id),
        group: groupOf(e.type),
        label: e.displayName,
        detail: e.status === EBundleEntryStatus.AVAILABLE
            ? `${e.version ?? ''}${e.marketplace ? ` · ${e.marketplace}` : ''}`.trim() || 'configuration'
            : e.status === EBundleEntryStatus.NOT_SUPPORTED
                ? 'this extension cannot export its configuration yet'
                : 'not running here, so there is nothing to ask'
    }))

    const coreItems: ISelectableItem[] = [
        { key: CORE_SETTINGS_KEY, group: GROUP_GENERAL, label: 'Kwirth settings', detail: 'metrics interval, log levels, marketplaces and package registries' },
        { key: CORE_SHARED_AI_KEY, group: GROUP_GENERAL, label: 'AI providers and models', detail: 'the common store, which belongs to no extension' }
    ]

    const exportItems = (): ISelectableItem[] => [...coreItems, ...extensionItems()]

    const importItems = (): ISelectableItem[] => [
        ...(importBundle?.core.settings !== undefined ? [coreItems[0]] : []),
        ...(importBundle?.core.sharedAi !== undefined ? [coreItems[1]] : []),
        ...importPreview.map(p => ({
            key: bundleEntryKey(p.type, p.id),
            group: groupOf(p.type),
            label: p.displayName,
            detail: p.status === EBundleEntryStatus.AVAILABLE
                ? (p.version ?? 'configuration')
                : p.status === EBundleEntryStatus.NOT_INSTALLED
                    ? 'not installed here — Kwirth installs nothing on import'
                    : p.status === EBundleEntryStatus.VERSION_DIFFERS
                        ? `the version here is ${p.installedVersion ?? 'another one'}: it will be applied anyway`
                        : 'this extension cannot receive configuration yet'
        }))
    ]

    const notApplicable = (item: ISelectableItem): boolean => {
        const p = importPreview.find(e => bundleEntryKey(e.type, e.id) === item.key)
        return p !== undefined && p.status !== EBundleEntryStatus.AVAILABLE && p.status !== EBundleEntryStatus.VERSION_DIFFERS
    }

    const notExportable = (item: ISelectableItem): boolean => {
        const e = extensions.find(x => bundleEntryKey(x.type, x.id) === item.key)
        return e !== undefined && e.status !== EBundleEntryStatus.AVAILABLE
    }

    /*
        The tickable list, by BLOCKS: Kwirth's own in one, and the extensions grouped by type. Flat it was
        unreadable past a dozen — a sender, an IdP and a plugin are not chosen by the same criterion, and
        seeing them jumbled forces reading the whole list.

        Each block carries its own tick box, which ticks and unticks only its own. 'disabled' leaves items
        VISIBLE but not tickable: an extension that cannot export is shown with its reason, because a short
        list with no explanation is worse than a declared gap.
    */
    const selectionList = (items: ISelectableItem[], disabled?: (item: ISelectableItem) => boolean) => {
        const blocks: { name: string, items: ISelectableItem[] }[] = []
        for (const item of items) {
            const block = blocks.find(b => b.name === item.group)
            if (block) block.items.push(item)
            else blocks.push({ name: item.group, items: [item] })
        }
        const toggle = (key: string, on: boolean) => setSelected(prev => {
            const next = new Set(prev)
            if (on) next.add(key)
            else next.delete(key)
            return next
        })
        return <Stack spacing={1}>
            { blocks.map(block => {
                const tickable = block.items.filter(i => !(disabled?.(i) ?? false))
                const allOn = tickable.length > 0 && tickable.every(i => selected.has(i.key))
                return <Box key={block.name} sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1 }}>
                    <FormControlLabel
                        control={<Checkbox size='small' checked={allOn} disabled={tickable.length === 0}
                            indeterminate={!allOn && tickable.some(i => selected.has(i.key))}
                            onChange={e => tickable.forEach(i => toggle(i.key, e.target.checked))} />}
                        label={<Typography variant='body2'><b>{block.name}</b></Typography>} />
                    { block.items.map(item => {
                        const off = disabled?.(item) ?? false
                        return <Stack key={item.key} direction='row' alignItems='center' sx={{ pl: 3 }}>
                            <Checkbox size='small' checked={selected.has(item.key)} disabled={off}
                                onChange={e => toggle(item.key, e.target.checked)} />
                            <Box>
                                <Typography variant='body2' color={off ? 'text.disabled' : 'text.primary'}>{item.label}</Typography>
                                <Typography variant='caption' color='text.secondary'>{item.detail}</Typography>
                            </Box>
                        </Stack>
                    })}
                </Box>
            })}
        </Stack>
    }

    const doExport = async () => {
        setError(''); setResult(undefined)
        // The bundle is built by the BACK END — it is what can ask each extension for its own.
        const chosen = exportableKeys(extensions).filter(k => selected.has(k))
        try {
            const query = `include=${encodeURIComponent(chosen.join(','))}&credentials=${withCredentials}`
            const response = await fetch(`${props.clusterUrl}/core/config-bundle/export?${query}`, addGetAuthorization(props.accessString))
            if (!response.ok) {
                setError(`Could not build the configuration file (${response.status}).`)
                return
            }
            const bundle = await response.json() as IConfigBundle
            // What was not ticked is dropped from the core's part, which the back end always builds whole.
            if (!selected.has(CORE_SETTINGS_KEY)) delete bundle.core.settings
            if (!selected.has(CORE_SHARED_AI_KEY)) delete bundle.core.sharedAi

            const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' })
            const link = document.createElement('a')
            link.href = URL.createObjectURL(blob)
            link.download = 'kwirth-config.json'
            link.click()
            URL.revokeObjectURL(link.href)
            setResult('Configuration exported.')
        }
        catch {
            setError('Could not reach Kwirth to build the configuration file.')
        }
    }

    // Reading the file imports NOTHING yet: it opens the list so you can choose what goes in.
    const openImport = async (file: File) => {
        setError(''); setResult(undefined)
        try {
            const parsed = JSON.parse(await file.text()) as { kind?: string }
            if (parsed?.kind !== CONFIG_BUNDLE_KIND) {
                setError('That file is not a Kwirth configuration bundle.')
                return
            }
            const bundle = parsed as unknown as IConfigBundle
            /*
                The preview is computed by the BACK END: it is what knows which extensions are here and
                which of them can receive what the file brings. Doing it in the front end would mean
                guessing, and guessing wrong is how an import ends up half applied.
            */
            const response = await fetch(`${props.clusterUrl}/core/config-bundle/preview`,
                addPostAuthorization(props.accessString, JSON.stringify(bundle)))
            if (!response.ok) {
                const detail = await response.json().catch(() => ({}))
                setError(detail?.error ?? `Could not read the configuration file (${response.status}).`)
                return
            }
            const preview = await response.json() as IImportPreviewEntry[]
            setImportBundle(bundle)
            setImportPreview(preview)
            setMode('import')
            // What can be applied is pre-ticked; what cannot, cannot even be ticked.
            setSelected(new Set([
                ...(bundle.core.settings !== undefined ? [CORE_SETTINGS_KEY] : []),
                ...(bundle.core.sharedAi !== undefined ? [CORE_SHARED_AI_KEY] : []),
                ...preview.filter(p => p.status === EBundleEntryStatus.AVAILABLE || p.status === EBundleEntryStatus.VERSION_DIFFERS)
                    .map(p => bundleEntryKey(p.type, p.id))
            ]))
        }
        catch {
            setError('That file could not be read as JSON.')
        }
    }

    const doImport = async () => {
        if (!importBundle) return
        setError(''); setResult(undefined)
        try {
            const payload = JSON.stringify({ bundle: importBundle, include: [...selected] })
            const response = await fetch(`${props.clusterUrl}/core/config-bundle/import`, addPostAuthorization(props.accessString, payload))
            if (!response.ok) {
                setError(`Could not apply the configuration (${response.status}).`)
                return
            }
            /*
                An entry that cannot be applied does not stop the rest — the back end sees to that — and
                what is left unapplied is counted here instead of closing the window as if everything had
                gone well.
            */
            const report = await response.json() as IImportReport
            const failed = report.entries.filter(e => e.error || !e.result)
            setResult(failed.length === 0
                ? `Configuration applied: ${report.entries.length} extension(s) and ${report.coreApplied.length} of Kwirth's own.`
                : `${report.entries.length - failed.length} of ${report.entries.length} extension(s) applied; ` + failed.map(f => `${f.id}: ${f.error ?? f.status}`).join('; '))
        }
        catch {
            setError('Could not reach Kwirth to apply the configuration.')
        }
    }

    return (
        <Dialog open={true} fullWidth maxWidth='md' disableRestoreFocus={true}>
            <DialogTitleHelp section='guide/admin/02-initial-config?id=kwirth-portability' docsUrl={docsUrl(backendUrl, 'core', 'kwirth')}>Kwirth portability</DialogTitleHelp>
            <DialogContent sx={{ height: 460, overflowY: 'auto' }}>
                <Typography variant='body2' sx={{ mb: 2 }}>
                    { mode === 'export'
                        ? <>What travels to another Kwirth from cluster <b>{props.clusterName}</b>. Each extension decides what of its own is
                            configuration; Kwirth only gathers it and writes the file.</>
                        : <>What this file brings, and what would happen to it here. <b>Nothing is applied until you press Import.</b></> }
                </Typography>

                { loading && <Stack direction='row' spacing={1} alignItems='center'><CircularProgress size={16} /><Typography variant='body2'>Reading what can be exported…</Typography></Stack> }

                { !loading && mode === 'export' && <>
                    { selectionList(exportItems(), notExportable) }
                    {/*
                        Unticked by default, and it is not caution for its own sake: a bundle with
                        credentials ends up in somebody's downloads folder. With it off the secret fields
                        travel EMPTY rather than omitted, so the destination can tell which ones it has to
                        fill in.
                    */}
                    <FormControlLabel sx={{ mt: 1 }} control={<Checkbox checked={withCredentials} onChange={e => setWithCredentials(e.target.checked)} />}
                        label={<Typography variant='body2'>Include credentials (tokens, passwords and API keys)</Typography>} />
                </> }

                { !loading && mode === 'import' && selectionList(importItems(), notApplicable) }

                { result && <Alert severity='info' sx={{ mt: 2 }} onClose={() => setResult(undefined)}>{result}</Alert> }
                { error !== '' && <Alert severity='error' sx={{ mt: 2 }}>{error}</Alert> }
            </DialogContent>
            <DialogActions sx={{ justifyContent: 'space-between', px: 2 }}>
                <Stack direction='row' spacing={1}>
                    <input ref={fileRef} type='file' accept='.json,application/json' style={{ display: 'none' }}
                        onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) openImport(f) }} />
                    { mode === 'export'
                        ? <>
                            <Button size='small' startIcon={<Download />} disabled={loading || error !== ''} onClick={doExport}>Export</Button>
                            <Button size='small' startIcon={<Upload />} disabled={loading} onClick={() => fileRef.current?.click()}>Import a file…</Button>
                        </>
                        : <Button size='small' startIcon={<Upload />} disabled={selected.size === 0} onClick={doImport}>Import</Button> }
                </Stack>
                <Button variant='outlined' onClick={props.onClose}>Close</Button>
            </DialogActions>
        </Dialog>
    )
}

export { SettingsPortability }
