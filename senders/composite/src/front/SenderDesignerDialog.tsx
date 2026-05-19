import React, { useCallback, useEffect, useState } from 'react'
import {
    Box, Button, CircularProgress, Dialog, DialogActions, DialogContent,
    DialogTitle, Divider, IconButton, List, ListItem, ListItemButton,
    ListItemText, Stack, TextField, Tooltip, Typography
} from '@mui/material'
import { Add, CallSplit, Delete, FilterAlt, Send } from '@mui/icons-material'
import { IAvailableSender, ICompositeNode, IPipelineConfig } from './types'
import { createNode, isRulePath, nodeAtPath, ruleAtPath } from './treeUtils'
import PipelineCanvas from './PipelineCanvas'
import NodeEditor, { RuleEditor } from './NodeEditor'

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

const ROOT_TYPES: Array<{ type: 'tee' | 'regex' | 'ref'; icon: React.ReactElement; label: string; desc: string }> = [
    { type: 'regex', icon: <FilterAlt />, label: 'Regex',  desc: 'Route messages based on regex rules' },
    { type: 'tee',   icon: <CallSplit />, label: 'Tee',    desc: 'Fan-out to multiple senders in parallel' },
    { type: 'ref',   icon: <Send />,     label: 'Ref',     desc: 'Delegate directly to a registered sender' },
]

const SenderDesignerDialog: React.FC<ISenderDesignerDialogProps> = ({ onClose, backendUrl, accessString }) => {
    const [pipelines, setPipelines] = useState<Record<string, IPipelineConfig>>({})
    const [selectedName, setSelectedName] = useState<string | undefined>()
    const [originalSavedName, setOriginalSavedName] = useState<string | undefined>()
    const [editingName, setEditingName] = useState('')
    const [flow, setFlow] = useState<ICompositeNode | undefined>()
    const [selectedPath, setSelectedPath] = useState<string>('')
    const [availableSenders, setAvailableSenders] = useState<IAvailableSender[]>([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [dirty, setDirty] = useState(false)
    const [newName, setNewName] = useState('')
    const [error, setError] = useState<string | undefined>()

    useEffect(() => {
        Promise.all([loadPipelines(), loadSenders()]).finally(() => setLoading(false))
    }, [])

    const loadPipelines = async () => {
        const res = await fetch(`${backendUrl}/senders/composite/configs`, authGet(accessString))
        if (!res.ok) return
        const data = await res.json() as IPipelineConfig[]
        const map: Record<string, IPipelineConfig> = {}
        for (const p of data) map[p.name] = p
        setPipelines(map)
    }

    const loadSenders = async () => {
        const res = await fetch(`${backendUrl}/senders`, authGet(accessString))
        if (!res.ok) return
        const data = await res.json() as IAvailableSender[]
        setAvailableSenders(data)
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
        setFlow(pipelines[name]?.flow)
        setSelectedPath('')
        setDirty(false)
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
        setFlow(undefined)
        setSelectedPath('')
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
        if (!res.ok) { setError(`Failed to delete pipeline "${name}"`); return }
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
            const pipeline: IPipelineConfig = { name: selectedName, flow }
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
            try { return nodeAtPath(newFlow, prev) ? prev : '' } catch { return '' }
        })
    }, [])

    const setRootNode = (type: 'tee' | 'regex' | 'ref') => {
        handleFlowChange(createNode(type))
    }

    const selectedNode = flow && selectedPath !== undefined && !isRulePath(selectedPath) ? nodeAtPath(flow, selectedPath) : undefined
    const selectedRule = flow && isRulePath(selectedPath) ? ruleAtPath(flow, selectedPath) : undefined
    const showEditor = !!selectedNode || !!selectedRule

    return (
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
                                                secondary={dirty && selectedName === name ? 'unsaved' : undefined}
                                                secondaryTypographyProps={{ color: 'warning.main' }}
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
                                    <TextField
                                        size='small' label='Pipeline name' fullWidth
                                        value={editingName}
                                        onChange={e => setEditingName(e.target.value)}
                                        onBlur={applyRename}
                                        onKeyDown={e => { if (e.key === 'Enter') { e.currentTarget.blur() } if (e.key === 'Escape') { setEditingName(selectedName); e.currentTarget.blur() } }}
                                    />
                                </Box>
                            )}
                            <Box sx={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
                                {!selectedName && (
                                    <Box sx={{ m: 'auto', textAlign: 'center', color: 'text.secondary' }}>
                                        <Typography variant='body2'>Select or create a pipeline to start designing.</Typography>
                                    </Box>
                                )}
                                {selectedName && !flow && (
                                    <Box sx={{ m: 'auto', textAlign: 'center' }}>
                                        <Typography variant='body2' sx={{ mb: 2 }}>Empty pipeline — choose a root node type:</Typography>
                                        <Stack direction='row' spacing={2} justifyContent='center'>
                                            {ROOT_TYPES.map(rt => (
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
                                        </Stack>
                                    </Box>
                                )}
                                {selectedName && flow && (
                                    <PipelineCanvas
                                        flow={flow}
                                        selectedPath={selectedPath}
                                        availableSenders={availableSenders}
                                        onFlowChange={handleFlowChange}
                                        onSelectPath={setSelectedPath}
                                    />
                                )}
                            </Box>
                        </Box>

                        {/* ── Right: node / rule editor ── */}
                        {showEditor && flow && (
                            <Box sx={{ width: 300, borderLeft: '1px solid', borderColor: 'divider', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                                <Box sx={{ p: 1.5, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <Typography variant='subtitle2'>{selectedRule ? 'Configure rule' : 'Configure node'}</Typography>
                                    <IconButton size='small' onClick={() => setSelectedPath('')}>✕</IconButton>
                                </Box>
                                {selectedNode && (
                                    <NodeEditor
                                        node={selectedNode}
                                        path={selectedPath}
                                        flow={flow}
                                        availableSenders={availableSenders}
                                        onFlowChange={handleFlowChange}
                                    />
                                )}
                                {selectedRule && (
                                    <RuleEditor
                                        rule={selectedRule}
                                        path={selectedPath}
                                        flow={flow}
                                        onFlowChange={handleFlowChange}
                                    />
                                )}
                            </Box>
                        )}
                    </>
                )}
            </DialogContent>

            <Divider />
            <DialogActions sx={{ justifyContent: 'space-between', px: 2 }}>
                <Box>
                    {error && <Typography variant='caption' color='error'>{error}</Typography>}
                </Box>
                <Stack direction='row' spacing={1}>
                    <Button
                        variant='contained'
                        disabled={!dirty || !flow || saving}
                        onClick={savePipeline}
                        startIcon={saving ? <CircularProgress size={14} /> : undefined}
                    >
                        {saving ? 'Saving…' : 'Save'}
                    </Button>
                    <Button onClick={onClose}>Close</Button>
                </Stack>
            </DialogActions>
        </Dialog>
    )
}

export { SenderDesignerDialog }
export default SenderDesignerDialog
