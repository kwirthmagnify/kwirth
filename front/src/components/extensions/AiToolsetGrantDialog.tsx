import React, { useContext, useEffect, useState } from 'react'
import {
    Box, Button, Checkbox, Chip, CircularProgress, Dialog, DialogActions, DialogContent, Switch, Table, TableBody,
    TableCell, TableContainer, TableHead, TableRow, Tooltip, Typography
} from '@mui/material'
import { DialogTitleHelp, docsUrl } from '@kwirthmagnify/kwirth-common-front'
import { EToolEffect, IAiToolInfo, IAiToolsetInfo, IToolsetGrant } from '@kwirthmagnify/kwirth-common-ai'
import { SessionContext, SessionContextType } from '../../model/SessionContext'
import { addGetAuthorization, addPutAuthorization } from '../../tools/AuthorizationManagement'
import { IInstalledPluginRef } from './ExtensionManagerDialog'

/*
    The grant of ONE AI toolset (plan: plans/ai-tool-grants/PLAN.md, T3): which plugins may use it, and which
    of its tools each one.

    Rows are plugins, columns are the toolset's tools. Per plugin, two ways:
    - the 'All' switch: every tool, INCLUDING the ones a future version of the toolset brings;
    - the checkboxes: only those, and a new version's tools do NOT enter by themselves.
    With 'All' on, the checkboxes are shown ticked and disabled, but the list underneath is kept: switching
    'All' off gives the previous selection back.

    Tools still granted that the toolset no longer carries (a new version dropped or renamed them) get a
    column of their own, marked, and are dropped on saving: the back end refuses tools that do not exist.

    Fixed content (rule): the dialog has a fixed size and the table scrolls INSIDE it, both ways, with the
    header and the plugin column pinned.
*/

interface IAiToolsetGrantDialogProps {
    toolsetId: string
    title: string
    helpSection: string
    onClose: () => void
}

const PLUGIN_COL_WIDTH = 220
const ALL_COL_WIDTH = 80
const TOOL_COL_WIDTH = 140

const emptyGrant = (pluginId: string): IToolsetGrant => ({ pluginId, allTools: false, tools: [] })

const AiToolsetGrantDialog: React.FC<IAiToolsetGrantDialogProps> = (props: IAiToolsetGrantDialogProps) => {
    const { accessString, backendUrl } = useContext(SessionContext) as SessionContextType

    const [tools, setTools] = useState<IAiToolInfo[]>([])
    const [plugins, setPlugins] = useState<IInstalledPluginRef[]>([])
    const [grants, setGrants] = useState<Map<string, IToolsetGrant>>(new Map())
    // Who had an entry when the dialog opened: they are always sent back, so taking everything away from a
    // plugin is STORED as such (auditing) instead of the entry just vanishing.
    const [storedPluginIds, setStoredPluginIds] = useState<Set<string>>(new Set())
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
                const catalog = await catalogRes.json() as IAiToolsetInfo[]
                const stored = ((await grantsRes.json()) as Record<string, IToolsetGrant[]>)[props.toolsetId] ?? []
                setTools(catalog.find(t => t.id === props.toolsetId)?.tools ?? [])
                setPlugins(await pluginsRes.json() as IInstalledPluginRef[])
                setGrants(new Map(stored.map(g => [g.pluginId, g])))
                setStoredPluginIds(new Set(stored.map(g => g.pluginId)))
            }
            catch (err) { setError(`Failed to load the grant: ${err}`) }
            finally { setLoading(false) }
        }
        load()
    }, [backendUrl, accessString, props.toolsetId])

    const toolNames = new Set(tools.map(t => t.name))
    // Granted tools the toolset no longer carries: shown so the admin knows, dropped on saving.
    const orphanTools = [...new Set([...grants.values()].flatMap(g => g.tools).filter(t => !toolNames.has(t)))]
    // Installed plugins, plus any granted that is not installed here (so it can be taken away).
    const installedIds = new Set(plugins.map(p => p.id))
    const rows: IInstalledPluginRef[] = [...plugins, ...[...grants.keys()].filter(id => !installedIds.has(id)).map(id => ({ id }))]

    const grantOf = (pluginId: string): IToolsetGrant => grants.get(pluginId) ?? emptyGrant(pluginId)

    const updateGrant = (pluginId: string, change: (g: IToolsetGrant) => IToolsetGrant) => {
        setGrants(prev => new Map(prev).set(pluginId, change(grantOf(pluginId))))
    }

    const toggleAll = (pluginId: string, allTools: boolean) => updateGrant(pluginId, g => ({ ...g, allTools }))

    const toggleTool = (pluginId: string, tool: string, granted: boolean) =>
        updateGrant(pluginId, g => ({ ...g, tools: granted ? [...g.tools, tool] : g.tools.filter(t => t !== tool) }))

    const save = async () => {
        setSaving(true)
        setError(undefined)
        try {
            const payload: IToolsetGrant[] = [...grants.values()]
                .map(g => ({ ...g, tools: g.tools.filter(t => toolNames.has(t)) }))
                .filter(g => g.allTools || g.tools.length > 0 || storedPluginIds.has(g.pluginId))
            const res = await fetch(`${backendUrl}/core/aitoolsets/grants/${props.toolsetId}`, addPutAuthorization(accessString, JSON.stringify({ grants: payload })))
            if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`)
            props.onClose()
        }
        catch (err) { setError(`Save failed: ${err}`) }
        finally { setSaving(false) }
    }

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

    return (
        <Dialog open={true} maxWidth={false} sx={{ '& .MuiDialog-paper': { width: '960px', height: '600px' } }}>
            <DialogTitleHelp section={props.helpSection} docsUrl={docsUrl(backendUrl, 'core', 'kwirth')}>{props.title}</DialogTitleHelp>
            <DialogContent sx={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <Typography variant='body2' color='text.secondary' sx={{ mb: 1 }}>
                    'All' grants every tool of the toolset, including the ones a future version brings. Otherwise only the ticked tools are granted.
                </Typography>
                { loading && <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}><CircularProgress /></Box> }
                { !loading && rows.length === 0 && <Typography sx={{ mt: 2 }}>There are no plugins installed.</Typography> }
                { !loading && rows.length > 0 &&
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
                { error && <Typography color='error' variant='body2' sx={{ mt: 1 }}>{error}</Typography> }
            </DialogContent>
            <DialogActions>
                <Button variant='contained' disabled={saving || loading} onClick={save}>{saving ? <CircularProgress size={14} /> : 'Save'}</Button>
                <Button onClick={props.onClose}>Cancel</Button>
            </DialogActions>
        </Dialog>
    )
}

export { AiToolsetGrantDialog }
