import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
    Box, Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent,
    DialogTitle, Divider, FormControlLabel, IconButton, List, ListItem, ListItemButton,
    ListItemText, Stack, Switch, TextField, Tooltip, Typography
} from '@mui/material'
import { AccountTree, Add, Delete, FileDownload, FileUpload, FilterAlt, Send } from '@mui/icons-material'
import { IAvailableSender, ICompositeNode, IPipelineConfig } from './types'
import { createNode, nodeAtPath } from './treeUtils'
import PipelineCanvas from './PipelineCanvas'
import NodeEditor from './NodeEditor'

// ─── Auth helpers ─────────────────────────────────────────────────────────────

function authGet(accessString: string): RequestInit {
    return { headers: { Authorization: accessString ? `Bearer ${accessString}` : '', 'X-Kwirth-App': 'true' } }
}

function authDelete(accessString: string): RequestInit {
    return { method: 'DELETE', headers: { Authorization: accessString ? `Bearer ${accessString}` : '', 'X-Kwirth-App': 'true' } }
}

function authPost(accessString: string, body: string): RequestInit {
    return {
        method: 'POST', body,
        headers: { Authorization: accessString ? `Bearer ${accessString}` : '', 'X-Kwirth-App': 'true', 'Content-Type': 'application/json' },
    }
}

// ─── Component ────────────────────────────────────────────────────────────────

interface ISenderDesignerDialogProps {
    onClose: () => void
    backendUrl: string
    accessString: string
}

const STATIC_ROOT_TYPES: Array<{ type: 'fanout' | 'ref'; icon: React.ReactElement; label: string; desc: string }> = [
    { type: 'fanout', icon: <AccountTree />, label: 'Fanout',     desc: 'Fan-out to multiple senders in parallel' },
    { type: 'ref',    icon: <Send />,        label: 'Sender ref', desc: 'Delegate directly to a registered sender' },
]

const SenderDesignerDialog: React.FC<ISenderDesignerDialogProps> = ({ onClose, backendUrl, accessString }) => {
    const [pipelines, setPipelines] = useState<Record<string, IPipelineConfig>>({})
    const [selectedName, setSelectedName] = useState<string | undefined>()
    const [originalSavedName, setOriginalSavedName] = useState<string | undefined>()
    const [editingName, setEditingName] = useState('')
    const [flow, setFlow] = useState<ICompositeNode | undefined>()
    const [selectedPath, setSelectedPath] = useState<string | undefined>(undefined)
    const [availableSenders, setAvailableSenders] = useState<IAvailableSender[]>([])
    const [configDescriptions, setConfigDescriptions] = useState<Map<string, string>>(new Map())
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [dirty, setDirty] = useState(false)
    const [editMode, setEditMode] = useState(false)
    const [newName, setNewName] = useState('')
    const [description, setDescription] = useState('')
    const [error, setError] = useState<string | undefined>()
    const [exportDialogOpen, setExportDialogOpen] = useState(false)
    const [exportSelected, setExportSelected] = useState<Set<string>>(new Set())
    const importFileRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        Promise.all([loadPipelines(), loadSenders()]).finally(() => setLoading(false))
    }, [])

    const loadPipelines = async () => {
        const res = await fetch(`${backendUrl}/senders/composite/configs`, authGet(accessString))
        if (!res.ok) return
        const raw = await res.json()
        const data = (Array.isArray(raw) ? raw : (raw.configs ?? [])) as IPipelineConfig[]
        const map: Record<string, IPipelineConfig> = {}
        for (const p of data) map[p.name] = p
        setPipelines(map)
    }

    const loadSenders = async () => {
        const res = await fetch(`${backendUrl}/senders`, authGet(accessString))
        if (!res.ok) return
        const data = await res.json() as IAvailableSender[]
        setAvailableSenders(data)
        const map = new Map<string, string>()
        await Promise.all(data.map(async sender => {
            try {
                const r = await fetch(`${backendUrl}/senders/${sender.id}/configs`, authGet(accessString))
                if (!r.ok) return
                const configs = await r.json() as Array<{ name: string; description?: string }>
                for (const cfg of configs) {
                    if (cfg.description) map.set(`${sender.id}/${cfg.name}`, cfg.description)
                }
            } catch {}
        }))
        setConfigDescriptions(map)
    }

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); if (dirty) savePipeline() }
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [dirty, flow, selectedName])

    const selectPipeline = (name: string) => {
        setSelectedName(name)
        setOriginalSavedName(name)
        setEditingName(name)
        setDescription(pipelines[name]?.description ?? '')
        setFlow(pipelines[name]?.flow)
        setSelectedPath(undefined)
        setDirty(false)
        setEditMode(false)
        setError(undefined)
    }

    const createPipeline = () => {
        const name = newName.trim()
        if (!name) return
        if (pipelines[name]) { setError(`Pipeline "${name}" already exists`); return }
        const newPipeline: IPipelineConfig = { name, flow: undefined as unknown as ICompositeNode }
        setPipelines(prev => ({ ...prev, [name]: newPipeline }))
        setSelectedName(name)
        setOriginalSavedName(undefined)
        setEditingName(name)
        setDescription('')
        setFlow(undefined)
        setSelectedPath(undefined)
        setDirty(true)
        setNewName('')
        setError(undefined)
    }

    const applyRename = () => {
        const trimmed = editingName.trim()
        if (!trimmed || !selectedName || trimmed === selectedName) { setEditingName(selectedName ?? ''); return }
        if (pipelines[trimmed]) { setError(`Pipeline "${trimmed}" already exists`); setEditingName(selectedName); return }
        setError(undefined)
        setPipelines(prev => {
            const next = { ...prev }
            const pipeline = next[selectedName]
            delete next[selectedName]
            next[trimmed] = { ...pipeline, name: trimmed }
            return next
        })
        setSelectedName(trimmed)
        setEditingName(trimmed)
        setDirty(true)
    }

    const deletePipeline = async (name: string) => {
        const res = await fetch(`${backendUrl}/senders/composite/configs/${encodeURIComponent(name)}`, authDelete(accessString))
        if (!res.ok && res.status !== 404) { setError(`Failed to delete pipeline "${name}"`); return }
        setPipelines(prev => { const n = { ...prev }; delete n[name]; return n })
        if (selectedName === name) { setSelectedName(undefined); setFlow(undefined); setDirty(false) }
    }

    const savePipeline = async () => {
        if (!selectedName || !flow) return
        setSaving(true)
        setError(undefined)
        try {
            if (originalSavedName && originalSavedName !== selectedName) {
                await fetch(`${backendUrl}/senders/composite/configs/${encodeURIComponent(originalSavedName)}`, authDelete(accessString))
            }
            const pipeline: IPipelineConfig = { name: selectedName, ...(description.trim() && { description: description.trim() }), flow }
            const res = await fetch(`${backendUrl}/senders/composite/configs`, authPost(accessString, JSON.stringify(pipeline)))
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            setPipelines(prev => ({ ...prev, [selectedName]: pipeline }))
            setOriginalSavedName(selectedName)
            setDirty(false)
        } catch (err) {
            setError(`Save failed: ${err}`)
        } finally {
            setSaving(false)
        }
    }

    const handleFlowChange = useCallback((newFlow: ICompositeNode) => {
        setFlow(newFlow)
        setDirty(true)
        setSelectedPath(prev => {
            if (prev === undefined) return undefined
            try { return nodeAtPath(newFlow, prev) ? prev : undefined } catch { return undefined }
        })
    }, [])

    const filterSenders = availableSenders.filter(s => s.senderType === 'filter')

    const setRootNode = (type: 'fanout' | 'ref' | 'filter', senderId = '') => {
        handleFlowChange(createNode(type, senderId))
    }

    const triggerDownload = (data: unknown, filename: string) => {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
        URL.revokeObjectURL(url)
    }

    const handleExport = () => {
        const selected = Object.values(pipelines).filter(p => exportSelected.has(p.name))
        triggerDownload(selected, 'kwirth-pipelines.json')
        setExportDialogOpen(false)
    }

    const handleImport = async (file: File) => {
        try {
            const raw = JSON.parse(await file.text())
            const arr: IPipelineConfig[] = Array.isArray(raw) ? raw : (raw.pipelines ?? [])
            for (const pipeline of arr) {
                await fetch(`${backendUrl}/senders/composite/configs`, authPost(accessString, JSON.stringify(pipeline)))
            }
            await loadPipelines()
        } catch (err) {
            setError(`Import failed: ${err}`)
        } finally {
            if (importFileRef.current) importFileRef.current.value = ''
        }
    }

    const selectedNode = flow && selectedPath !== undefined ? nodeAtPath(flow, selectedPath) : undefined
    const showEditor = selectedPath !== undefined && !!selectedNode

    return (<>
        <Dialog
            open={true}
            maxWidth={false}
            onKeyDown={e => { if (e.key === 'Escape' && !showEditor) onClose() }}
            sx={{ '& .MuiDialog-paper': { width: '92vw', height: '88vh', maxWidth: '92vw', display: 'flex', flexDirection: 'column' } }}
        >
            <DialogTitle sx={{ pb: 1 }}>Sender Pipeline Designer</DialogTitle>
            <Divider />

            <DialogContent sx={{ flex: 1, p: 0, overflow: 'hidden', display: 'flex' }}>
                {loading ? (
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
                        <CircularProgress />
                    </Box>
                ) : (
                    <>
                        {/* ── Left panel: pipeline list ── */}
                        <Box sx={{ width: 240, borderRight: '1px solid', borderColor: 'divider', display: 'flex', flexDirection: 'column' }}>
                            <Box sx={{ p: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
                                <Typography variant='subtitle2' sx={{ mb: 1 }}>Pipelines</Typography>
                                <Stack direction='row' spacing={0.5}>
                                    <TextField
                                        size='small' fullWidth placeholder='New pipeline name'
                                        value={newName}
                                        onChange={e => setNewName(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter') createPipeline() }}
                                    />
                                    <Tooltip title='Create pipeline'>
                                        <span>
                                            <IconButton size='small' color='primary' disabled={!newName.trim()} onClick={createPipeline}>
                                                <Add fontSize='small' />
                                            </IconButton>
                                        </span>
                                    </Tooltip>
                                </Stack>
                            </Box>
                            <List dense sx={{ flex: 1, overflow: 'auto' }}>
                                {Object.keys(pipelines).length === 0 && (
                                    <ListItem>
                                        <ListItemText primary={<Typography variant='caption' color='text.secondary'>No pipelines yet.</Typography>} />
                                    </ListItem>
                                )}
                                {Object.keys(pipelines).map(name => (
                                    <ListItem
                                        key={name}
                                        disablePadding
                                        secondaryAction={
                                            <Tooltip title='Delete pipeline'>
                                                <IconButton size='small' edge='end' color='error' onClick={() => deletePipeline(name)}>
                                                    <Delete fontSize='small' />
                                                </IconButton>
                                            </Tooltip>
                                        }
                                    >
                                        <ListItemButton
                                            selected={selectedName === name}
                                            onClick={() => selectPipeline(name)}
                                        >
                                            <ListItemText
                                                primary={selectedName === name ? editingName || name : name}
                                                secondary={
                                                    dirty && selectedName === name
                                                        ? 'unsaved'
                                                        : (pipelines[name]?.description || undefined)
                                                }
                                                secondaryTypographyProps={{
                                                    sx: {
                                                        color: dirty && selectedName === name ? 'warning.main' : 'text.disabled',
                                                        lineHeight: 1.2,
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis',
                                                        whiteSpace: 'nowrap',
                                                        fontSize: 11,
                                                    }
                                                }}
                                            />
                                        </ListItemButton>
                                    </ListItem>
                                ))}
                            </List>
                        </Box>

                        {/* ── Center: canvas ── */}
                        <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                            {selectedName && (
                                <Box sx={{ px: 2, py: 1, borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0 }}>
                                    <Stack direction='row' spacing={1} alignItems='center'>
                                        <Box sx={{ width: '25%', flexShrink: 0 }}>
                                            <TextField
                                                size='small' label='Name' fullWidth
                                                disabled={!editMode}
                                                value={editingName}
                                                onChange={e => setEditingName(e.target.value)}
                                                onBlur={applyRename}
                                                onKeyDown={e => { if (e.key === 'Enter') { e.currentTarget.blur() } if (e.key === 'Escape') { setEditingName(selectedName); e.currentTarget.blur() } }}
                                            />
                                        </Box>
                                        <TextField
                                            size='small' label='Description' sx={{ flex: 1 }}
                                            disabled={!editMode}
                                            value={description}
                                            onChange={e => { setDescription(e.target.value); setDirty(true) }}
                                            placeholder={editMode ? 'Optional description' : ''}
                                        />
                                        {error && <Typography variant='caption' color='error' sx={{ whiteSpace: 'nowrap' }}>{error}</Typography>}
                                        <FormControlLabel
                                            control={<Switch size='small' checked={editMode} onChange={e => setEditMode(e.target.checked)} />}
                                            label={<Typography variant='caption'>{editMode ? 'Edit' : 'View'}</Typography>}
                                            sx={{ whiteSpace: 'nowrap', m: 0 }}
                                        />
                                        <Button
                                            variant='contained' size='small'
                                            disabled={!editMode || !dirty || !flow || saving}
                                            onClick={savePipeline}
                                            startIcon={saving ? <CircularProgress size={14} /> : undefined}
                                            sx={{ whiteSpace: 'nowrap' }}
                                        >
                                            {saving ? 'Saving…' : 'Save'}
                                        </Button>
                                    </Stack>
                                </Box>
                            )}
                            <Box sx={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
                                {!selectedName && (
                                    <Box sx={{ m: 'auto', textAlign: 'center', color: 'text.secondary' }}>
                                        <Typography variant='body2'>Select or create a pipeline to start designing.</Typography>
                                    </Box>
                                )}
                                {selectedName && !flow && editMode && (
                                    <Box sx={{ m: 'auto', textAlign: 'center' }}>
                                        <Typography variant='body2' sx={{ mb: 2 }}>Empty pipeline — choose a root node type:</Typography>
                                        <Stack direction='row' spacing={2} justifyContent='center' flexWrap='wrap' useFlexGap>
                                            {STATIC_ROOT_TYPES.map(rt => (
                                                <Button
                                                    key={rt.type}
                                                    variant='outlined'
                                                    startIcon={rt.icon}
                                                    onClick={() => setRootNode(rt.type)}
                                                    sx={{ flexDirection: 'column', minHeight: 80, width: 130, gap: 0.5, whiteSpace: 'normal' }}
                                                >
                                                    <span>{rt.label}</span>
                                                    <Typography variant='caption' color='text.secondary' sx={{ textTransform: 'none', textAlign: 'center', fontSize: 10 }}>
                                                        {rt.desc}
                                                    </Typography>
                                                </Button>
                                            ))}
                                            {filterSenders.map(fs => (
                                                <Button
                                                    key={fs.id}
                                                    variant='outlined'
                                                    startIcon={<FilterAlt />}
                                                    onClick={() => setRootNode('filter', fs.id)}
                                                    sx={{ flexDirection: 'column', minHeight: 80, width: 130, gap: 0.5, whiteSpace: 'normal' }}
                                                >
                                                    <span>{fs.displayName ?? fs.id}</span>
                                                    <Typography variant='caption' color='text.secondary' sx={{ textTransform: 'none', textAlign: 'center', fontSize: 10 }}>
                                                        Filter sender
                                                    </Typography>
                                                </Button>
                                            ))}
                                        </Stack>
                                    </Box>
                                )}
                                {selectedName && !flow && !editMode && (
                                    <Box sx={{ m: 'auto', color: 'text.disabled' }}>
                                        <Typography variant='body2'>Empty pipeline — switch to Edit mode to start designing.</Typography>
                                    </Box>
                                )}
                                {selectedName && flow && (
                                    <PipelineCanvas
                                        flow={flow}
                                        selectedPath={selectedPath}
                                        availableSenders={availableSenders}
                                        configDescriptions={configDescriptions}
                                        readonly={!editMode}
                                        onFlowChange={handleFlowChange}
                                        onClearFlow={() => { setFlow(undefined); setSelectedPath(undefined); setDirty(true) }}
                                        onSelectPath={setSelectedPath}
                                    />
                                )}
                            </Box>
                        </Box>

                        {/* ── Right: node editor ── */}
                        {showEditor && flow && selectedNode && editMode && (
                            <Box sx={{ width: 300, borderLeft: '1px solid', borderColor: 'divider', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                                <Box sx={{ p: 1.5, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <Typography variant='subtitle2'>Configure node</Typography>
                                    <IconButton size='small' onClick={() => setSelectedPath(undefined)}>✕</IconButton>
                                </Box>
                                <NodeEditor
                                    node={selectedNode}
                                    path={selectedPath!}
                                    flow={flow}
                                    availableSenders={availableSenders}
                                    onFlowChange={handleFlowChange}
                                />
                            </Box>
                        )}
                    </>
                )}
            </DialogContent>

            <Divider />
            <DialogActions sx={{ justifyContent: 'space-between', px: 2 }}>
                <Stack direction='row' spacing={1}>
                    <input ref={importFileRef} type='file' accept='.json' style={{ display: 'none' }}
                        onChange={e => { const f = e.target.files?.[0]; if (f) handleImport(f) }} />
                    <Tooltip title='Export pipelines to JSON'>
                        <span>
                            <Button size='small' startIcon={<FileDownload />} disabled={Object.keys(pipelines).length === 0}
                                onClick={() => { setExportSelected(new Set(Object.keys(pipelines))); setExportDialogOpen(true) }}>
                                Export
                            </Button>
                        </span>
                    </Tooltip>
                    <Tooltip title='Import pipelines from JSON'>
                        <Button size='small' startIcon={<FileUpload />} onClick={() => importFileRef.current?.click()}>Import</Button>
                    </Tooltip>
                </Stack>
                <Button onClick={onClose}>Close</Button>
            </DialogActions>
        </Dialog>

        {exportDialogOpen && (
            <Dialog open maxWidth='xs' fullWidth>
                <DialogTitle>Export pipelines</DialogTitle>
                <DialogContent>
                    <Stack spacing={0.5} sx={{ pt: 0.5 }}>
                        <FormControlLabel
                            control={<Checkbox size='small'
                                checked={exportSelected.size === Object.keys(pipelines).length && Object.keys(pipelines).length > 0}
                                indeterminate={exportSelected.size > 0 && exportSelected.size < Object.keys(pipelines).length}
                                onChange={e => setExportSelected(e.target.checked ? new Set(Object.keys(pipelines)) : new Set())} />}
                            label={<Typography variant='body2' fontWeight='bold'>Select all</Typography>}
                        />
                        <Divider />
                        {Object.keys(pipelines).map(name => (
                            <FormControlLabel key={name}
                                control={<Checkbox size='small' checked={exportSelected.has(name)}
                                    onChange={e => setExportSelected(prev => { const n = new Set(prev); e.target.checked ? n.add(name) : n.delete(name); return n })} />}
                                label={<Typography variant='body2'>{name}</Typography>}
                            />
                        ))}
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setExportDialogOpen(false)}>Cancel</Button>
                    <Button variant='contained' disabled={exportSelected.size === 0} onClick={handleExport}>
                        Export ({exportSelected.size})
                    </Button>
                </DialogActions>
            </Dialog>
        )}
    </>)
}

export { SenderDesignerDialog }
export default SenderDesignerDialog
