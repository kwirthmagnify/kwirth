import React from 'react'
import { Box, IconButton, Stack, Tooltip, Typography } from '@mui/material'
import { Add, Block, CallSplit, Delete, FilterAlt, Send } from '@mui/icons-material'
import { IAvailableSender, ICompositeNode, ICompositeRegexRule } from './types'
import {
    addTeeTarget, addRegexRule, createNode, deleteNodeAtPath,
    getAllNodePaths, getParentPath, getTreeEntries, isRulePath
} from './treeUtils'
import NodeCard, { RuleCard } from './NodeCard'

interface IPipelineCanvasProps {
    flow: ICompositeNode
    selectedPath: string
    availableSenders: IAvailableSender[]
    onFlowChange: (flow: ICompositeNode) => void
    onSelectPath: (path: string) => void
}

// ─── Add child button group ───────────────────────────────────────────────────

const AddChildButtons: React.FC<{
    nodeType: string
    onAdd: (type: 'tee' | 'regex' | 'ref' | 'drop-rule') => void
}> = ({ nodeType, onAdd }) => {
    if (nodeType === 'ref') return null
    return (
        <Stack direction='row' spacing={0.5}>
            {nodeType === 'tee' && (<>
                <Tooltip title='Add tee target'>
                    <IconButton size='small' onClick={() => onAdd('tee')}><CallSplit fontSize='small' /></IconButton>
                </Tooltip>
                <Tooltip title='Add regex target'>
                    <IconButton size='small' onClick={() => onAdd('regex')}><FilterAlt fontSize='small' /></IconButton>
                </Tooltip>
                <Tooltip title='Add ref target'>
                    <IconButton size='small' color='success' onClick={() => onAdd('ref')}><Send fontSize='small' /></IconButton>
                </Tooltip>
            </>)}
            {nodeType === 'regex' && (<>
                <Tooltip title='Add send rule'>
                    <IconButton size='small' color='success' onClick={() => onAdd('ref')}><Add fontSize='small' /></IconButton>
                </Tooltip>
                <Tooltip title='Add drop rule'>
                    <IconButton size='small' color='error' onClick={() => onAdd('drop-rule')}><Block fontSize='small' /></IconButton>
                </Tooltip>
            </>)}
        </Stack>
    )
}

// ─── Recursive tree node ──────────────────────────────────────────────────────

interface ITreeNodeProps {
    node: ICompositeNode
    path: string
    selectedPath: string
    isRoot: boolean
    availableSenders: IAvailableSender[]
    onFlowChange: (flow: ICompositeNode) => void
    onSelectPath: (path: string) => void
    flow: ICompositeNode
}

const TreeNode: React.FC<ITreeNodeProps> = ({
    node, path, selectedPath, isRoot, flow, availableSenders, onFlowChange, onSelectPath
}) => {
    const entries = getTreeEntries(node, path)
    const allPaths = getAllNodePaths(flow, '')

    const handleKeyDown = (e: React.KeyboardEvent) => {
        e.stopPropagation()
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectPath(path) }
        if (e.key === 'Delete' || e.key === 'Backspace') {
            if (!isRoot) {
                e.preventDefault()
                const parentPath = getParentPath(path)
                onFlowChange(deleteNodeAtPath(flow, isRulePath(parentPath) ? parentPath : path))
            }
        }
        if (e.key === 'ArrowLeft') { e.preventDefault(); onSelectPath(getParentPath(path)) }
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault()
            const idx = allPaths.indexOf(path)
            const next = e.key === 'ArrowUp' ? allPaths[idx - 1] : allPaths[idx + 1]
            if (next !== undefined) onSelectPath(next)
        }
        if (e.key === 'ArrowRight') {
            const firstChild = entries.find(e => e.kind === 'node')
            if (firstChild?.kind === 'node') { e.preventDefault(); onSelectPath(firstChild.path) }
        }
        if (e.key === 't') { e.preventDefault(); onFlowChange(addTeeTarget(flow, path, createNode('tee'))) }
        if (e.key === 'r') { e.preventDefault(); onFlowChange(addTeeTarget(flow, path, createNode('regex'))) }
        if (e.key === 'f') { e.preventDefault(); onFlowChange(addTeeTarget(flow, path, createNode('ref'))) }
    }

    const handleAdd = (type: 'tee' | 'regex' | 'ref' | 'drop-rule') => {
        if (node.type === 'tee') {
            onFlowChange(addTeeTarget(flow, path, createNode(type as 'tee' | 'regex' | 'ref')))
        } else if (node.type === 'regex') {
            if (type === 'drop-rule') {
                const rule: ICompositeRegexRule = { regex: '.*', flags: 'i', field: 'subject', action: 'drop' }
                onFlowChange(addRegexRule(flow, path, rule))
            } else {
                const rule: ICompositeRegexRule = { regex: '.*', flags: 'i', field: 'subject', action: 'send', target: createNode('ref') }
                onFlowChange(addRegexRule(flow, path, rule))
            }
        }
    }

    const makeRuleKeyHandler = (rulePath: string, rule: ICompositeRegexRule) => (e: React.KeyboardEvent) => {
        e.stopPropagation()
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectPath(rulePath) }
        if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); onFlowChange(deleteNodeAtPath(flow, rulePath)) }
        if (e.key === 'ArrowLeft') { e.preventDefault(); onSelectPath(getParentPath(rulePath)) }
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault()
            const idx = allPaths.indexOf(rulePath)
            const next = e.key === 'ArrowUp' ? allPaths[idx - 1] : allPaths[idx + 1]
            if (next !== undefined) onSelectPath(next)
        }
        if (e.key === 'ArrowRight' && rule.action === 'send' && rule.target) {
            e.preventDefault(); onSelectPath(`${rulePath}.target`)
        }
    }

    return (
        <Box>
            {/* Node row */}
            <Stack direction='row' alignItems='center' spacing={1} sx={{ mb: 0.5 }}>
                <NodeCard
                    node={node}
                    selected={selectedPath === path}
                    onClick={() => onSelectPath(path)}
                    onKeyDown={handleKeyDown}
                />
                <AddChildButtons nodeType={node.type} onAdd={handleAdd} />
                {!isRoot && (
                    <Tooltip title={isRulePath(getParentPath(path)) ? 'Delete rule' : 'Delete node'}>
                        <IconButton size='small' color='error' onClick={() => {
                            const parentPath = getParentPath(path)
                            onFlowChange(deleteNodeAtPath(flow, isRulePath(parentPath) ? parentPath : path))
                        }}>
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
                            {entry.kind === 'drop' && (
                                <Stack direction='row' alignItems='center' spacing={0.5} sx={{ ml: 0.5 }}>
                                    <Block fontSize='small' color='disabled' />
                                    <Typography variant='caption' color='text.disabled'>{entry.label}</Typography>
                                </Stack>
                            )}
                            {entry.kind === 'rule' && (
                                <Box>
                                    <Stack direction='row' alignItems='center' spacing={1} sx={{ mb: 0.5 }}>
                                        <RuleCard
                                            rule={entry.rule}
                                            selected={selectedPath === entry.path}
                                            onClick={() => onSelectPath(entry.path)}
                                            onKeyDown={makeRuleKeyHandler(entry.path, entry.rule)}
                                        />
                                        <Tooltip title='Delete rule'>
                                            <IconButton size='small' color='error' onClick={() => onFlowChange(deleteNodeAtPath(flow, entry.path))}>
                                                <Delete fontSize='small' />
                                            </IconButton>
                                        </Tooltip>
                                    </Stack>
                                    {entry.rule.action === 'send' && entry.rule.target && (
                                        <Box sx={{ ml: 3, pl: 2, borderLeft: '2px solid', borderColor: 'divider', mb: 0.5 }}>
                                            <TreeNode
                                                node={entry.rule.target}
                                                path={`${entry.path}.target`}
                                                selectedPath={selectedPath}
                                                isRoot={false}
                                                flow={flow}
                                                availableSenders={availableSenders}
                                                onFlowChange={onFlowChange}
                                                onSelectPath={onSelectPath}
                                            />
                                        </Box>
                                    )}
                                </Box>
                            )}
                            {entry.kind === 'node' && (
                                <Box>
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
                                        onFlowChange={onFlowChange}
                                        onSelectPath={onSelectPath}
                                    />
                                </Box>
                            )}
                        </Box>
                    ))}
                </Box>
            )}
        </Box>
    )
}

// ─── Canvas ───────────────────────────────────────────────────────────────────

const PipelineCanvas: React.FC<IPipelineCanvasProps> = ({
    flow, selectedPath, availableSenders, onFlowChange, onSelectPath
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
                onFlowChange={onFlowChange}
                onSelectPath={onSelectPath}
            />
        </Box>
    )
}

export default PipelineCanvas
