import React, { useState, useContext } from 'react'
import { Alert, Button, CircularProgress, Dialog, DialogActions, DialogContent, Stack, Typography } from '@mui/material'
import { Upload } from '@kwirthmagnify/kwirth-common-front/icons'
import { DialogTitleHelp, docsUrl } from '@kwirthmagnify/kwirth-common-front'
import { IConfigBundle, IImportPreviewEntry, IImportReport, EBundleEntryStatus,
    CONFIG_BUNDLE_KIND, CORE_SETTINGS_KEY, CORE_SHARED_AI_KEY, bundleEntryKey } from '@kwirthmagnify/kwirth-common'
import { SessionContext, SessionContextType } from '../../model/SessionContext'
import { addPostAuthorization } from '../../tools/AuthorizationManagement'
import { ISelectableItem, groupOf, coreItems, SelectionList } from './PortabilityShared'

/*
    Kwirth import: applying a configuration bundle from another Kwirth to this one.

    The file is read and previewed (nothing applied) until the user presses Import. See
    `plans/config-portability/PRD.md`.
*/

interface ISettingsImportProps {
    onClose: () => void
    clusterName?: string
    clusterUrl: string
    accessString: string
}

/*
    Which entries of the file can be applied here. A different version is applied anyway —it warns, it
    transforms nothing— and so is a PARTIAL one: what the core keeps about the extension has somewhere to
    go even while the extension itself is not running, and skipping the entry would lose that too.
*/
const sePuedeAplicar = (status: EBundleEntryStatus): boolean =>
    status === EBundleEntryStatus.AVAILABLE ||
    status === EBundleEntryStatus.VERSION_DIFFERS ||
    status === EBundleEntryStatus.PARTIAL

const SettingsImport: React.FC<ISettingsImportProps> = (props: ISettingsImportProps) => {
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [result, setResult] = useState<string|undefined>(undefined)
    const [importBundle, setImportBundle] = useState<IConfigBundle|undefined>(undefined)
    const [importPreview, setImportPreview] = useState<IImportPreviewEntry[]>([])
    const [selected, setSelected] = useState<Set<string>>(new Set())
    const fileRef = React.useRef<HTMLInputElement>(null)
    const { backendUrl } = useContext(SessionContext) as SessionContextType

    // Reading the file imports NOTHING yet: it opens the list so you can choose what goes in.
    const openImport = async (file: File) => {
        setError(''); setResult(undefined); setLoading(true)
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
            // What can be applied is pre-ticked; what cannot, cannot even be ticked.
            setSelected(new Set([
                ...(bundle.core.settings !== undefined ? [CORE_SETTINGS_KEY] : []),
                ...(bundle.core.sharedAi !== undefined ? [CORE_SHARED_AI_KEY] : []),
                ...preview.filter(p => sePuedeAplicar(p.status)).map(p => bundleEntryKey(p.type, p.id))
            ]))
        }
        catch {
            setError('That file could not be read as JSON.')
        }
        finally {
            setLoading(false)
        }
    }

    const detalle = (p: IImportPreviewEntry): string => {
        switch (p.status) {
            case EBundleEntryStatus.NOT_INSTALLED: return 'not installed here — Kwirth installs nothing on import'
            case EBundleEntryStatus.VERSION_DIFFERS: return `the version here is ${p.installedVersion ?? 'another one'}: it will be applied anyway`
            case EBundleEntryStatus.NOT_INSTANTIATED: return 'not running here, so there is nobody to hand it to'
            /*
                The file carries configuration of the extension's own and it is not running here to
                receive it. What the core keeps about it IS applied, so the entry is applied — and the
                rest is said now, because the final report cannot show what nobody was asked for.
            */
            case EBundleEntryStatus.PARTIAL: return 'not started in this Kwirth: only its installation configuration will be applied'
            case EBundleEntryStatus.NOT_SUPPORTED: return 'this extension cannot receive configuration yet'
            default: return ''
        }
    }

    const importItems = (): ISelectableItem[] => [
        ...(importBundle?.core.settings !== undefined ? [coreItems[0]] : []),
        ...(importBundle?.core.sharedAi !== undefined ? [coreItems[1]] : []),
        ...importPreview.map(p => ({
            key: bundleEntryKey(p.type, p.id),
            group: groupOf(p.type),
            label: `${p.displayName} (${p.version ?? '—'})`,
            detail: detalle(p),
            warn: p.status === EBundleEntryStatus.PARTIAL
        }))
    ]

    const notApplicable = (item: ISelectableItem): boolean => {
        const p = importPreview.find(e => bundleEntryKey(e.type, e.id) === item.key)
        return p !== undefined && !sePuedeAplicar(p.status)
    }

    const toggle = (key: string, on: boolean) => setSelected(prev => {
        const next = new Set(prev)
        if (on) next.add(key)
        else next.delete(key)
        return next
    })

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
            <DialogTitleHelp section='guide/admin/02-initial-config?id=kwirth-portability' docsUrl={docsUrl(backendUrl, 'core', 'kwirth')}>Kwirth import</DialogTitleHelp>
            <DialogContent sx={{ height: 460, overflowY: 'auto' }}>
                <Typography variant='body2' sx={{ mb: 2 }}>
                    { importBundle
                        ? <>What this file brings, and what would happen to it here. <b>Nothing is applied until you press Import.</b></>
                        : <>Choose a configuration bundle file to import into cluster <b>{props.clusterName}</b>.</> }
                </Typography>

                { loading && <Stack direction='row' spacing={1} alignItems='center'><CircularProgress size={16} /><Typography variant='body2'>Reading the configuration file…</Typography></Stack> }

                { !loading && !importBundle && <>
                    <input ref={fileRef} type='file' accept='.json,application/json' style={{ display: 'none' }}
                        onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) openImport(f) }} />
                    <Button size='small' startIcon={<Upload />} onClick={() => fileRef.current?.click()}>Choose a file…</Button>
                </> }

                { !loading && importBundle && <SelectionList items={importItems()} selected={selected} onToggle={toggle} disabled={notApplicable} /> }

                { result && <Alert severity='info' sx={{ mt: 2 }} onClose={() => setResult(undefined)}>{result}</Alert> }
                { error !== '' && <Alert severity='error' sx={{ mt: 2 }}>{error}</Alert> }
            </DialogContent>
            <DialogActions sx={{ justifyContent: 'space-between', px: 2 }}>
                { importBundle && <Button variant='outlined' size='small' startIcon={<Upload />} disabled={selected.size === 0} onClick={doImport}>Import</Button> }
                { !importBundle && <span /> }
                <Button variant='outlined' size='small' onClick={props.onClose}>Close</Button>
            </DialogActions>
        </Dialog>
    )
}

export { SettingsImport }
