import React, { useState, useEffect, useContext } from 'react'
import { Alert, Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent, FormControlLabel, Stack, Typography } from '@mui/material'
import { Download } from '@kwirthmagnify/kwirth-common-front/icons'
import { DialogTitleHelp, docsUrl } from '@kwirthmagnify/kwirth-common-front'
import { IConfigBundle, IExportableEntry, EBundleEntryStatus, CORE_SETTINGS_KEY, CORE_SHARED_AI_KEY, bundleEntryKey } from '@kwirthmagnify/kwirth-common'
import { SessionContext, SessionContextType } from '../../model/SessionContext'
import { addGetAuthorization } from '../../tools/AuthorizationManagement'
import { ISelectableItem, groupOf, coreItems, SelectionList } from './PortabilityShared'

/*
    Kwirth export: taking a whole installation's configuration to another Kwirth.

    Each extension decides what of its own is configuration; Kwirth only gathers it and writes the file.
    See `plans/config-portability/PRD.md`.
*/

interface ISettingsExportProps {
    onClose: () => void
    clusterName?: string
    clusterUrl: string
    accessString: string
}

const SettingsExport: React.FC<ISettingsExportProps> = (props: ISettingsExportProps) => {
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [result, setResult] = useState<string|undefined>(undefined)
    const [extensions, setExtensions] = useState<IExportableEntry[]>([])
    const [selected, setSelected] = useState<Set<string>>(new Set())
    const [withCredentials, setWithCredentials] = useState(false)
    const { backendUrl } = useContext(SessionContext) as SessionContextType

    const exportableKeys = (list: IExportableEntry[]): string[] =>
        list.filter(e => e.status === EBundleEntryStatus.AVAILABLE).map(e => bundleEntryKey(e.type, e.id))

    useEffect(() => {
        const load = async () => {
            try {
                const response = await fetch(`${props.clusterUrl}/core/config-bundle/exportable`, addGetAuthorization(props.accessString))
                if (!response.ok) {
                    setError(response.status === 403 ? 'You need the admin scope to export the configuration.' : `Could not read what can be exported (${response.status}).`)
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
        label: `${e.displayName} (${e.version ?? '—'})`,
        detail: e.status === EBundleEntryStatus.AVAILABLE
            ? ''
            : e.status === EBundleEntryStatus.NOT_SUPPORTED
                ? 'this extension cannot export its configuration yet'
                : 'not running here, so there is nothing to ask'
    }))

    const exportItems = (): ISelectableItem[] => [...coreItems, ...extensionItems()]

    const notExportable = (item: ISelectableItem): boolean => {
        const e = extensions.find(x => bundleEntryKey(x.type, x.id) === item.key)
        return e !== undefined && e.status !== EBundleEntryStatus.AVAILABLE
    }

    const toggle = (key: string, on: boolean) => setSelected(prev => {
        const next = new Set(prev)
        if (on) next.add(key)
        else next.delete(key)
        return next
    })

    const doExport = async () => {
        setError(''); setResult(undefined)
        // The bundle is built by the BACK END — it is what can ask each extension for its own.
        const chosen = [
            ...(selected.has(CORE_SETTINGS_KEY) ? [CORE_SETTINGS_KEY] : []),
            ...(selected.has(CORE_SHARED_AI_KEY) ? [CORE_SHARED_AI_KEY] : []),
            ...exportableKeys(extensions).filter(k => selected.has(k))
        ]
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

    return (
        <Dialog open={true} fullWidth maxWidth='md' disableRestoreFocus={true}>
            <DialogTitleHelp section='guide/admin/02-initial-config?id=kwirth-portability' docsUrl={docsUrl(backendUrl, 'core', 'kwirth')}>Kwirth export</DialogTitleHelp>
            <DialogContent sx={{ height: 460, overflowY: 'auto' }}>
                <Typography variant='body2' sx={{ mb: 2 }}>
                    What travels to another Kwirth from cluster <b>{props.clusterName}</b>. Each extension decides what of its own is
                    configuration; Kwirth only gathers it and writes the file.
                </Typography>

                { loading && <Stack direction='row' spacing={1} alignItems='center'><CircularProgress size={16} /><Typography variant='body2'>Reading what can be exported…</Typography></Stack> }

                { !loading && <>
                    <SelectionList items={exportItems()} selected={selected} onToggle={toggle} disabled={notExportable} />
                    {/*
                        Unticked by default, and it is not caution for its own sake: a bundle with
                        credentials ends up in somebody's downloads folder. With it off the secret fields
                        travel EMPTY rather than omitted, so the destination can tell which ones it has to
                        fill in.
                    */}
                    <FormControlLabel sx={{ mt: 1 }} control={<Checkbox checked={withCredentials} onChange={e => setWithCredentials(e.target.checked)} />}
                        label={<Typography variant='body2'>Include credentials (tokens, passwords and API keys)</Typography>} />
                </> }

                { result && <Alert severity='info' sx={{ mt: 2 }} onClose={() => setResult(undefined)}>{result}</Alert> }
                { error !== '' && <Alert severity='error' sx={{ mt: 2 }}>{error}</Alert> }
            </DialogContent>
            <DialogActions sx={{ justifyContent: 'space-between' }}>
                <Button variant='outlined' startIcon={<Download />} disabled={loading || error !== ''} onClick={doExport}>Export</Button>
                <Button variant='outlined' onClick={props.onClose}>Close</Button>
            </DialogActions>
        </Dialog>
    )
}

export { SettingsExport }
