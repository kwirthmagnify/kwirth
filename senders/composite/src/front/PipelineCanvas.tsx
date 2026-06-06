import React, { useState } from 'react'
import { Box, IconButton, MenuItem, Select, Stack, Tooltip, Typography } from '@mui/material'
import { Add, Delete } from '@mui/icons-material'
import { IAvailableSender, ICompositeNode } from './types'
import { addTeeTarget, createNode, deleteNodeAtPath, getAllNodePaths, getParentPath, getTreeEntries, setNextNode } from './treeUtils'
import NodeCard from './NodeCard'

interface IPipelineCanvasProps {
    flow: ICompositeNode
    selectedPath: string | undefined
    availableSenders: IAvailableSender[]
    configDescriptions: Map<string, string>
    readonly?: boolean
    onFlowChange: (flow: ICompositeNode) => void
    onSelectPath: (path: string) => void
}

// ─── Ref senders (exclude filter/routing types) ───────────────────────────────

const FILTER_TYPES = new Set(['timed', 'regex', 'composite', 'tee'])

function refSenders(available: IAvailableSender[]): IAvailableSender[] {
    return available.filter(s => !FILTER_TYPES.has(s.id))
}

// ─── Add child button group ───────────────────────────────────────────────────

type ChildKind = 'sender' | 'tee' | 'timed' | 'regex'

const AddChildButtons: React.FC<{
    node: ICompositeNode
    availableSenders: IAvailableSender[]
    onAdd: (newNode: ICompositeNode) => void
}> = ({ node, availableSenders, onAdd }) => {
    const senders = refSenders(availableSenders)
    const [pickedSender, setPickedSender] = useState(senders[0]?.id ?? '')
    const [childKind, setChildKind] = useState<ChildKind>('sender')
    const [pickedConfig, setPickedConfig] = useState('')

    // tee: add a target; timed/regex: set next — both use the same picker
    const canAdd = node.type === 'tee' || ((node.type === 'timed' || node.type === 'regex') && !node.next)
    if (!canAdd) return null

    const timedConfigs = availableSenders.find(s => s.id === 'timed')?.configNames ?? []
    const regexConfigs = availableSenders.find(s => s.id === 'regex')?.configNames ?? []
    const senderConfigs = availableSenders.find(s => s.id === pickedSender)?.configNames ?? []
    const configsForKind = childKind === 'timed' ? timedConfigs : childKind === 'regex' ? regexConfigs : childKind === 'sender' ? senderConfigs : []

    const handleCreate = () => {
        if (childKind === 'sender') {
            onAdd({ type: 'ref', senderId: pickedSender, configName: pickedConfig })
        } else if (childKind === 'tee') {
            onAdd(createNode('tee'))
        } else if (childKind === 'timed') {
            onAdd({ type: 'timed', configName: pickedConfig })
        } else {
            onAdd({ type: 'regex', configName: pickedConfig })
        }
    }

    const addDisabled =
        (childKind === 'sender' && (!pickedSender || (senderConfigs.length > 0 && !pickedConfig))) ||
        (childKind === 'timed' && timedConfigs.length > 0 && !pickedConfig) ||
        (childKind === 'regex' && regexConfigs.length > 0 && !pickedConfig)

    const selectSx = { height: 28, fontSize: '0.75rem', minWidth: 110, '& .MuiSelect-select': { py: 0, px: 1 } }
    const tooltipTitle = node.type === 'tee' ? 'Add target' : 'Set next'

    return (
        <Stack direction='row' spacing={0.5} alignItems='center'>
            <Select size='small' value={childKind}
                onChange={e => { setChildKind(e.target.value as ChildKind); setPickedConfig('') }}
                sx={{ ...selectSx, minWidth: 100 }}
            >
                <MenuItem value='sender' sx={{ fontSize: '0.75rem' }}>Sender</MenuItem>
                <MenuItem value='tee' sx={{ fontSize: '0.75rem' }}>Tee</MenuItem>
                <MenuItem value='timed' sx={{ fontSize: '0.75rem' }}>Timed filter</MenuItem>
                <MenuItem value='regex' sx={{ fontSize: '0.75rem' }}>Regex filter</MenuItem>
            </Select>
            {childKind === 'sender' && (
                <Select size='small' value={pickedSender}
                    onChange={e => { setPickedSender(e.target.value); setPickedConfig('') }}
                    displayEmpty sx={selectSx}>
                    {senders.map(s => (
                        <MenuItem key={s.id} value={s.id} sx={{ fontSize: '0.75rem' }}>{s.displayName ?? s.id}</MenuItem>
                    ))}
                </Select>
            )}
            {configsForKind.length > 0 && (
                <Select size='small' value={pickedConfig} onChange={e => setPickedConfig(e.target.value)} displayEmpty sx={selectSx}>
                    <MenuItem value='' sx={{ fontSize: '0.75rem' }}><em>— config —</em></MenuItem>
                    {configsForKind.map(c => (
                        <MenuItem key={c} value={c} sx={{ fontSize: '0.75rem' }}>{c}</MenuItem>
                    ))}
                </Select>
            )}
            <Tooltip title={tooltipTitle}>
                <span>
                    <IconButton size='small' color='success' disabled={addDisabled} onClick={handleCreate}>
                        <Add fontSize='small' />
                    </IconButton>
                </span>
            </Tooltip>
        </Stack>
    )
}

// ─── Recursive tree node ──────────────────────────────────────────────────────

interface ITreeNodeProps {
    node: ICompositeNode
    path: string
    selectedPath: string | undefined
    isRoot: boolean
    availableSenders: IAvailableSender[]
    configDescriptions: Map<string, string>
    readonly?: boolean
    onFlowChange: (flow: ICompositeNode) => void
    onSelectPath: (path: string) => void
    flow: ICompositeNode
}

const TreeNode: React.FC<ITreeNodeProps> = ({
    node, path, selectedPath, isRoot, flow, availableSenders, configDescriptions, readonly, onFlowChange, onSelectPath
}) => {
    const entries = getTreeEntries(node, path)
    const allPaths = getAllNodePaths(flow, '')

    const handleKeyDown = (e: React.KeyboardEvent) => {
        e.stopPropagation()
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectPath(path) }
        if (e.key === 'Delete' || e.key === 'Backspace') {
            if (!isRoot) { e.preventDefault(); onFlowChange(deleteNodeAtPath(flow, path)) }
        }
        if (e.key === 'ArrowLeft') { e.preventDefault(); onSelectPath(getParentPath(path)) }
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault()
            const idx = allPaths.indexOf(path)
            const next = e.key === 'ArrowUp' ? allPaths[idx - 1] : allPaths[idx + 1]
            if (next !== undefined) onSelectPath(next)
        }
        if (e.key === 'ArrowRight') {
            const firstChild = entries[0]
            if (firstChild) { e.preventDefault(); onSelectPath(firstChild.path) }
        }
    }

    const handleAdd = (newNode: ICompositeNode) => {
        if (node.type === 'tee') {
            onFlowChange(addTeeTarget(flow, path, newNode))
        } else if (node.type === 'timed' || node.type === 'regex') {
            onFlowChange(setNextNode(flow, path, newNode))
        }
    }

    const nodeDescription = (() => {
        if (node.type === 'ref') return configDescriptions.get(`${node.senderId}/${node.configName}`)
        if (node.type === 'timed') return configDescriptions.get(`timed/${node.configName}`)
        if (node.type === 'regex') return configDescriptions.get(`regex/${node.configName}`)
        return undefined
    })()

    return (
        <Box>
            {/* Node row */}
            <Stack direction='row' alignItems='center' spacing={1} sx={{ mb: 0.5 }}>
                <NodeCard
                    node={node}
                    selected={selectedPath === path}
                    description={nodeDescription}
                    onClick={() => onSelectPath(path)}
                    onKeyDown={handleKeyDown}
                />
                {!readonly && <AddChildButtons node={node} availableSenders={availableSenders} onAdd={handleAdd} />}
                {!readonly && !isRoot && (
                    <Tooltip title='Delete node'>
                        <IconButton size='small' color='error' onClick={() => onFlowChange(deleteNodeAtPath(flow, path))}>
                            <Delete fontSize='small' />
                        </IconButton>
                    </Tooltip>
                )}
            </Stack>

            {/* Children with left-border indentation */}
            {entries.length > 0 && (
                <Box sx={{ ml: 3, pl: 2, borderLeft: '2px solid', borderColor: 'divider', mb: 0.5 }}>
                    {entries.map((entry, i) => (
                        <Box key={i} sx={{ my: 0.5 }}>
                            {entry.label && (
                                <Typography variant='caption' color='text.secondary' sx={{ ml: 0.5, fontStyle: 'italic' }}>
                                    {entry.label}
                                </Typography>
                            )}
                            <TreeNode
                                node={entry.node}
                                path={entry.path}
                                selectedPath={selectedPath}
                                isRoot={false}
                                flow={flow}
                                availableSenders={availableSenders}
                                configDescriptions={configDescriptions}
                                readonly={readonly}
                                onFlowChange={onFlowChange}
                                onSelectPath={onSelectPath}
                            />
                        </Box>
                    ))}
                </Box>
            )}
        </Box>
    )
}

// ─── Canvas ───────────────────────────────────────────────────────────────────

const PipelineCanvas: React.FC<IPipelineCanvasProps> = ({
    flow, selectedPath, availableSenders, configDescriptions, readonly, onFlowChange, onSelectPath
}) => {
    return (
        <Box sx={{ p: 2, overflow: 'auto', height: '100%' }}>
            <TreeNode
                node={flow}
                path=''
                selectedPath={selectedPath}
                isRoot={true}
                flow={flow}
                availableSenders={availableSenders}
                configDescriptions={configDescriptions}
                readonly={readonly}
                onFlowChange={onFlowChange}
                onSelectPath={onSelectPath}
            />
        </Box>
    )
}

export default PipelineCanvas
