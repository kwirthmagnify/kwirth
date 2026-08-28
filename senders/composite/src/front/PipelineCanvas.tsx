import React, { useState } from 'react'
import { Box, IconButton, MenuItem, Select, Stack, Tooltip, Typography } from '@mui/material'
import Add from '@mui/icons-material/Add'
import Delete from '@mui/icons-material/Delete'
import { IAvailableSender, ICompositeNode } from './types'
import { addFanoutTarget, createNode, deleteNodeAtPath, getAllNodePaths, getParentPath, getTreeEntries, setNextNode } from './treeUtils'
import NodeCard from './NodeCard'

interface IPipelineCanvasProps {
    flow: ICompositeNode
    selectedPath: string | undefined
    availableSenders: IAvailableSender[]
    configDescriptions: Map<string, string>
    readonly?: boolean
    onFlowChange: (flow: ICompositeNode) => void
    onClearFlow: () => void
    onSelectPath: (path: string) => void
}

// ─── Add child button group ───────────────────────────────────────────────────

type ChildKind = 'sender' | 'fanout' | 'filter'

const AddChildButtons: React.FC<{
    node: ICompositeNode
    availableSenders: IAvailableSender[]
    onAdd: (newNode: ICompositeNode) => void
}> = ({ node, availableSenders, onAdd }) => {
    const outputSenders = availableSenders.filter(s => s.senderType !== 'filter')
    const filterSenders = availableSenders.filter(s => s.senderType === 'filter')
    const [pickedSender, setPickedSender] = useState(outputSenders[0]?.id ?? '')
    const [pickedFilter, setPickedFilter] = useState(filterSenders[0]?.id ?? '')
    const [childKind, setChildKind] = useState<ChildKind>('sender')
    const [pickedConfig, setPickedConfig] = useState('')

    const canAdd = node.type === 'fanout' || (node.type === 'filter' && !node.next)
    if (!canAdd) return null

    const senderConfigs = availableSenders.find(s => s.id === pickedSender)?.configNames ?? []
    const filterConfigs = availableSenders.find(s => s.id === pickedFilter)?.configNames ?? []
    const configsForKind = childKind === 'sender' ? senderConfigs : childKind === 'filter' ? filterConfigs : []

    const handleCreate = () => {
        if (childKind === 'sender') {
            onAdd({ type: 'ref', senderId: pickedSender, configName: pickedConfig })
        } else if (childKind === 'fanout') {
            onAdd(createNode('fanout'))
        } else {
            onAdd({ type: 'filter', senderId: pickedFilter, configName: pickedConfig })
        }
    }

    const addDisabled =
        (childKind === 'sender' && (!pickedSender || (senderConfigs.length > 0 && !pickedConfig))) ||
        (childKind === 'filter' && filterSenders.length > 0 && filterConfigs.length > 0 && !pickedConfig)

    const selectSx = { height: 28, fontSize: '0.75rem', minWidth: 110, '& .MuiSelect-select': { py: 0, px: 1 } }
    const tooltipTitle = node.type === 'fanout' ? 'Add target' : 'Set next'

    return (
        <Stack direction='row' spacing={0.5} alignItems='center'>
            <Select size='small' value={childKind}
                onChange={e => { setChildKind(e.target.value as ChildKind); setPickedConfig('') }}
                sx={{ ...selectSx, minWidth: 100 }}
            >
                <MenuItem value='sender' sx={{ fontSize: '0.75rem' }}>Sender</MenuItem>
                <MenuItem value='fanout' sx={{ fontSize: '0.75rem' }}>Fanout</MenuItem>
                {filterSenders.length > 0 && <MenuItem value='filter' sx={{ fontSize: '0.75rem' }}>Filter</MenuItem>}
            </Select>
            {childKind === 'sender' && (
                <Select size='small' value={pickedSender}
                    onChange={e => { setPickedSender(e.target.value); setPickedConfig('') }}
                    displayEmpty sx={selectSx}>
                    {outputSenders.map(s => (
                        <MenuItem key={s.id} value={s.id} sx={{ fontSize: '0.75rem' }}>{s.displayName ?? s.id}</MenuItem>
                    ))}
                </Select>
            )}
            {childKind === 'filter' && filterSenders.length > 0 && (
                <Select size='small' value={pickedFilter}
                    onChange={e => { setPickedFilter(e.target.value); setPickedConfig('') }}
                    displayEmpty sx={selectSx}>
                    {filterSenders.map(s => (
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
    onClearFlow: () => void
    onSelectPath: (path: string) => void
    flow: ICompositeNode
}

const TreeNode: React.FC<ITreeNodeProps> = ({
    node, path, selectedPath, isRoot, flow, availableSenders, configDescriptions, readonly, onFlowChange, onClearFlow, onSelectPath
}) => {
    const entries = getTreeEntries(node, path)
    const allPaths = getAllNodePaths(flow, '')

    const handleKeyDown = (e: React.KeyboardEvent) => {
        e.stopPropagation()
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectPath(path) }
        if (e.key === 'Delete' || e.key === 'Backspace') {
            e.preventDefault()
            if (isRoot) onClearFlow()
            else onFlowChange(deleteNodeAtPath(flow, path))
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
        if (node.type === 'fanout') {
            onFlowChange(addFanoutTarget(flow, path, newNode))
        } else if (node.type === 'filter') {
            onFlowChange(setNextNode(flow, path, newNode))
        }
    }

    const nodeDescription = (() => {
        if (node.type === 'ref')    return configDescriptions.get(`${node.senderId}/${node.configName}`)
        if (node.type === 'filter') return configDescriptions.get(`${node.senderId}/${node.configName}`)
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
                {!readonly && (
                    <Tooltip title={isRoot ? 'Clear pipeline' : 'Delete node'}>
                        <IconButton size='small' color='error' onClick={() => isRoot ? onClearFlow() : onFlowChange(deleteNodeAtPath(flow, path))}>
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
                                onClearFlow={onClearFlow}
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
    flow, selectedPath, availableSenders, configDescriptions, readonly, onFlowChange, onClearFlow, onSelectPath
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
                onClearFlow={onClearFlow}
                onSelectPath={onSelectPath}
            />
        </Box>
    )
}

export default PipelineCanvas
