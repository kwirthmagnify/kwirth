import React, { useContext, useEffect, useState } from 'react'
import {
    Box, Button, Checkbox, Chip, CircularProgress, Dialog, DialogActions, DialogContent, Switch, Tab, Table, TableBody,
    TableCell, TableContainer, TableHead, TableRow, Tabs, Tooltip, Typography
} from '@mui/material'
import { DialogTitleHelp, docsUrl } from '@kwirthmagnify/kwirth-common-front'
import { IConfigFieldDef, IConfigValidationError } from '@kwirthmagnify/kwirth-common'
import { EToolEffect, IAiToolInfo, IAiToolsetInfo, IToolsetGrant, TAiToolsetConfig } from '@kwirthmagnify/kwirth-common-ai'
import { SessionContext, SessionContextType } from '../../model/SessionContext'
import { addGetAuthorization, addPutAuthorization } from '../../tools/AuthorizationManagement'
import { IInstalledPluginRef } from './ExtensionManagerDialog'
import { ConfigFields } from './ConfigFields'
import type { ISaveRefusal } from './ConfigFormDialog'

/*
    ONE AI toolset, in two tabs (plans/extension-config, S9): "what may the AI do with this toolset here?"
    is answered in a single screen.

    · GRANTS (plans/ai-tool-grants, T3): which plugins may use it, and which of its tools each one. Rows are
      plugins, columns are the toolset's tools. Per plugin, the 'All' switch (every tool, INCLUDING the ones
      a future version brings) or the checkboxes (only those). With 'All' on, the checkboxes are shown ticked
      and disabled, but the list underneath is kept. Granted tools the toolset no longer carries get a
      column of their own, marked, and are dropped on saving.
    · SETTINGS: the toolset's configSchema, drawn by ConfigFields as every other family's. Secrets arrive
      REAL and are masked with the eye. A toolset that declares no settings shows the tab DISABLED, with
      the reason, never hidden.

    ONE Save stores what changed in either tab —the grants first, then the settings— and Cancel discards
    both. A settings field the back end refuses is marked, the tab says it has errors, and the dialog
    stays open.

    Fixed content (rule): the dialog has a fixed size; the table scrolls INSIDE it, both ways, with the
    header and the plugin column pinned, and the settings scroll inside their own column.
*/

enum EAiToolsetDialogTab {
    GRANTS = 'grants',
    SETTINGS = 'settings'
}

interface IAiToolsetDialogProps {
    toolsetId: string
    title: string
    helpSection: string
    onClose: () => void
}

const PLUGIN_COL_WIDTH = 220
const ALL_COL_WIDTH = 80
const TOOL_COL_WIDTH = 140
const SETTINGS_COL_WIDTH = 520

const emptyGrant = (pluginId: string): IToolsetGrant => ({ pluginId, allTools: false, tools: [] })

const AiToolsetDialog: React.FC<IAiToolsetDialogProps> = (props: IAiToolsetDialogProps) => {
    const { accessString, backendUrl } = useContext(SessionContext) as SessionContextType

    const [tab, setTab] = useState<EAiToolsetDialogTab>(EAiToolsetDialogTab.GRANTS)
    const [tools, setTools] = useState<IAiToolInfo[]>([])
    const [plugins, setPlugins] = useState<IInstalledPluginRef[]>([])
    const [grants, setGrants] = useState<Map<string, IToolsetGrant>>(new Map())
    // Who had an entry when the dialog opened: they are always sent back, so taking everything away from a
    // plugin is STORED as such (auditing) instead of the entry just vanishing.
    const [storedPluginIds, setStoredPluginIds] = useState<Set<string>>(new Set())
    const [grantsChanged, setGrantsChanged] = useState(false)
    const [schema, setSchema] = useState<IConfigFieldDef[]>([])
    const [settings, setSettings] = useState<TAiToolsetConfig>({})
    const [settingsChanged, setSettingsChanged] = useState(false)
    const [fieldErrors, setFieldErrors] = useState<IConfigValidationError[]>([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | undefined>()

    useEffect(() => {
        const load = async () => {
            try {
                const [catalogRes, pluginsRes, grantsRes] = await Promise.all([
                    fetch(`${backendUrl}/core/aitoolsets/catalog`, addGetAuthorization(accessString)),
                    fetch(`${backendUrl}/core/plugins`, addGetAuthorization(accessString)),
                    fetch(`${backendUrl}/core/aitoolsets/grants`, addGetAuthorization(accessString))
                ])
                if (!catalogRes.ok) throw new Error(`catalog: HTTP ${catalogRes.status}`)
                if (!pluginsRes.ok) throw new Error(`plugins: HTTP ${pluginsRes.status}`)
                if (!grantsRes.ok) throw new Error(`grants: HTTP ${grantsRes.status}`)
                const info = (await catalogRes.json() as IAiToolsetInfo[]).find(t => t.id === props.toolsetId)
                const stored = ((await grantsRes.json()) as Record<string, IToolsetGrant[]>)[props.toolsetId] ?? []
                setTools(info?.tools ?? [])
                setPlugins(await pluginsRes.json() as IInstalledPluginRef[])
                setGrants(new Map(stored.map(g => [g.pluginId, g])))
                setStoredPluginIds(new Set(stored.map(g => g.pluginId)))

                const declared = info?.configSchema ?? []
                setSchema(declared)
                if (declared.length > 0) {
                    const configRes = await fetch(`${backendUrl}/core/aitoolsets/${props.toolsetId}/config`, addGetAuthorization(accessString))
                    if (!configRes.ok) throw new Error(`settings: HTTP ${configRes.status}`)
                    setSettings(await configRes.json() as TAiToolsetConfig)
                }
            }
            catch (err) { setError(`Failed to load the toolset: ${err}`) }
            finally { setLoading(false) }
        }
        load()
    }, [backendUrl, accessString, props.toolsetId])

    // ── Grants ──────────────────────────────────────────────────────────────────

    const toolNames = new Set(tools.map(t => t.name))
    // Granted tools the toolset no longer carries: shown so the admin knows, dropped on saving.
    const orphanTools = [...new Set([...grants.values()].flatMap(g => g.tools).filter(t => !toolNames.has(t)))]
    // Installed plugins, plus any granted that is not installed here (so it can be taken away).
    const installedIds = new Set(plugins.map(p => p.id))
    const rows: IInstalledPluginRef[] = [...plugins, ...[...grants.keys()].filter(id => !installedIds.has(id)).map(id => ({ id }))]

    const grantOf = (pluginId: string): IToolsetGrant => grants.get(pluginId) ?? emptyGrant(pluginId)

    const updateGrant = (pluginId: string, change: (g: IToolsetGrant) => IToolsetGrant) => {
        setGrants(prev => new Map(prev).set(pluginId, change(grantOf(pluginId))))
        setGrantsChanged(true)
    }

    const toggleAll = (pluginId: string, allTools: boolean) => updateGrant(pluginId, g => ({ ...g, allTools }))

    const toggleTool = (pluginId: string, tool: string, granted: boolean) =>
        updateGrant(pluginId, g => ({ ...g, tools: granted ? [...g.tools, tool] : g.tools.filter(t => t !== tool) }))

    const saveGrants = async (): Promise<void> => {
        const payload: IToolsetGrant[] = [...grants.values()]
            .map(g => ({ ...g, tools: g.tools.filter(t => toolNames.has(t)) }))
            .filter(g => g.allTools || g.tools.length > 0 || storedPluginIds.has(g.pluginId))
        const res = await fetch(`${backendUrl}/core/aitoolsets/grants/${props.toolsetId}`, addPutAuthorization(accessString, JSON.stringify({ grants: payload })))
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`)
        setGrantsChanged(false)
    }

    // ── Settings ────────────────────────────────────────────────────────────────

    const setSetting = (name: string, value: unknown) => {
        setSettings(prev => ({ ...prev, [name]: value }))
        setSettingsChanged(true)
        setFieldErrors(prev => prev.filter(e => e.field !== name))
    }

    // An emptied number is '' in the form: it means 'no value', and is not sent
    const settingsBody = (): TAiToolsetConfig =>
        Object.fromEntries(Object.entries(settings).filter(([name, v]) => !(v === '' && schema.find(f => f.name === name)?.type === 'number')))

    /*
        A 400 carrying `fields` is the back end refusing values that do not fit the schema: they are marked,
        the tab says so, and the dialog stays open. Returns whether it was saved.
    */
    const saveSettings = async (): Promise<boolean> => {
        const res = await fetch(`${backendUrl}/core/aitoolsets/${props.toolsetId}/config`, addPutAuthorization(accessString, JSON.stringify(settingsBody())))
        if (res.ok) {
            setSettingsChanged(false)
            return true
        }
        const refusal = await res.json().catch(() => undefined) as ISaveRefusal | undefined
        if (res.status === 400 && refusal?.fields && refusal.fields.length > 0) {
            setFieldErrors(refusal.fields)
            setTab(EAiToolsetDialogTab.SETTINGS)
            return false
        }
        throw new Error(refusal?.error ?? `HTTP ${res.status}`)
    }

    // ── Save ────────────────────────────────────────────────────────────────────

    // What changed in either tab: the grants first; the settings only if those went in
    const save = async () => {
        setSaving(true)
        setError(undefined)
        try {
            if (grantsChanged) await saveGrants()
            if (settingsChanged && !(await saveSettings())) return
            props.onClose()
        }
        catch (err) { setError(`Save failed: ${err}`) }
        finally { setSaving(false) }
    }

    // ── Drawing ─────────────────────────────────────────────────────────────────

    const toolHeader = (tool: IAiToolInfo) =>
        <TableCell key={tool.name} align='center' sx={{ width: TOOL_COL_WIDTH, minWidth: TOOL_COL_WIDTH, maxWidth: TOOL_COL_WIDTH }}>
            <Tooltip title={tool.description}>
                <Typography variant='body2' noWrap sx={{ fontWeight: 500 }}>{tool.name}</Typography>
            </Tooltip>
            <Chip size='small' variant='outlined' label={tool.effect} color={tool.effect === EToolEffect.WRITE ? 'warning' : 'default'} sx={{ mt: 0.5 }} />
        </TableCell>

    const orphanHeader = (tool: string) =>
        <TableCell key={tool} align='center' sx={{ width: TOOL_COL_WIDTH, minWidth: TOOL_COL_WIDTH, maxWidth: TOOL_COL_WIDTH }}>
            <Tooltip title='This tool is no longer in the toolset. It will be removed from the grant when saving.'>
                <Typography variant='body2' noWrap color='text.disabled' sx={{ textDecoration: 'line-through' }}>{tool}</Typography>
            </Tooltip>
            <Chip size='small' variant='outlined' label='removed' sx={{ mt: 0.5 }} />
        </TableCell>

    const pluginCellSx = { width: PLUGIN_COL_WIDTH, minWidth: PLUGIN_COL_WIDTH, maxWidth: PLUGIN_COL_WIDTH, position: 'sticky', left: 0, zIndex: 1, bgcolor: 'background.paper' } as const

    const noSettings = !loading && schema.length === 0
    // The settings tab: disabled with the reason when there are none (its tooltip has to reach a disabled tab)
    const settingsLabel = noSettings
        // describeChild: the reason DESCRIBES the tab, its name stays 'Settings'
        ? <Tooltip describeChild title='This toolset declares no settings'><span>Settings</span></Tooltip>
        : <Box component='span' sx={{ color: fieldErrors.length > 0 ? 'error.main' : undefined }}>Settings{fieldErrors.length > 0 ? ' (errors)' : ''}</Box>

    return (
        <Dialog open={true} maxWidth={false} sx={{ '& .MuiDialog-paper': { width: '960px', height: '600px' } }}>
            <DialogTitleHelp section={props.helpSection} docsUrl={docsUrl(backendUrl, 'core', 'kwirth')}>{props.title}</DialogTitleHelp>
            <DialogContent sx={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <Tabs value={tab} onChange={(_e, v) => setTab(v as EAiToolsetDialogTab)} sx={{ mb: 1, minHeight: 40 }}>
                    <Tab value={EAiToolsetDialogTab.GRANTS} label='Grants' sx={{ minHeight: 40 }} />
                    <Tab value={EAiToolsetDialogTab.SETTINGS} label={settingsLabel} disabled={noSettings}
                        sx={{ minHeight: 40, '&.Mui-disabled': { pointerEvents: 'auto' } }} />
                </Tabs>

                { loading && <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}><CircularProgress /></Box> }

                {/* GRANTS */}
                <Box sx={{ flex: 1, minHeight: 0, flexDirection: 'column', display: loading || tab !== EAiToolsetDialogTab.GRANTS ? 'none' : 'flex' }}>
                    <Typography variant='body2' color='text.secondary' sx={{ mb: 1 }}>
                        'All' grants every tool of the toolset, including the ones a future version brings. Otherwise only the ticked tools are granted.
                    </Typography>
                    { rows.length === 0 && <Typography sx={{ mt: 2 }}>There are no plugins installed.</Typography> }
                    { rows.length > 0 &&
                        <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
                            <Table stickyHeader size='small' sx={{ tableLayout: 'fixed', width: 'max-content' }}>
                                <TableHead>
                                    <TableRow>
                                        <TableCell sx={{ ...pluginCellSx, zIndex: 3 }}>Plugin</TableCell>
                                        <TableCell align='center' sx={{ width: ALL_COL_WIDTH, minWidth: ALL_COL_WIDTH, maxWidth: ALL_COL_WIDTH }}>All</TableCell>
                                        { tools.map(toolHeader) }
                                        { orphanTools.map(orphanHeader) }
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    { rows.map(p => {
                                        const g = grantOf(p.id)
                                        const notInstalled = !installedIds.has(p.id)
                                        return (
                                            <TableRow key={p.id} hover>
                                                <TableCell sx={pluginCellSx}>
                                                    <Typography variant='body2' noWrap color={notInstalled ? 'text.disabled' : undefined}>{p.displayName || p.id}</Typography>
                                                    { notInstalled && <Typography variant='caption' color='text.disabled'>not installed</Typography> }
                                                </TableCell>
                                                <TableCell align='center'>
                                                    <Switch size='small' checked={g.allTools} onChange={(_e, checked) => toggleAll(p.id, checked)} slotProps={{ input: { 'aria-label': `${p.id} all tools` } }} />
                                                </TableCell>
                                                { tools.map(t =>
                                                    <TableCell key={t.name} align='center'>
                                                        <Checkbox size='small' disabled={g.allTools} checked={g.allTools || g.tools.includes(t.name)}
                                                            onChange={(_e, checked) => toggleTool(p.id, t.name, checked)} slotProps={{ input: { 'aria-label': `${p.id} ${t.name}` } }} />
                                                    </TableCell>
                                                )}
                                                { orphanTools.map(t =>
                                                    <TableCell key={t} align='center'>
                                                        <Checkbox size='small' disabled checked={g.tools.includes(t)} />
                                                    </TableCell>
                                                )}
                                            </TableRow>
                                        )
                                    })}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    }
                </Box>

                {/* SETTINGS: a column of fixed width that scrolls inside */}
                <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', display: loading || tab !== EAiToolsetDialogTab.SETTINGS ? 'none' : 'block' }}>
                    <Box sx={{ width: SETTINGS_COL_WIDTH, maxWidth: '100%', pt: 1 }}>
                        <ConfigFields schema={schema} values={settings} onChange={setSetting} invalidFields={fieldErrors.map(e => e.field)} />
                        { fieldErrors.length > 0 && <Typography variant='caption' color='error' data-testid='config-field-errors'>{fieldErrors.map(e => e.message).join('. ')}</Typography> }
                    </Box>
                </Box>

                { error && <Typography color='error' variant='body2' sx={{ mt: 1 }}>{error}</Typography> }
            </DialogContent>
            <DialogActions>
                <Button variant='contained' disabled={saving || loading} onClick={save}>{saving ? <CircularProgress size={14} /> : 'Save'}</Button>
                <Button onClick={props.onClose}>Cancel</Button>
            </DialogActions>
        </Dialog>
    )
}

export { AiToolsetDialog }
