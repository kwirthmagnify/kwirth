import React, { useState } from 'react'
import {
    Box, Chip, Divider, FormControl, IconButton, InputLabel,
    MenuItem, Select, Stack, Tooltip, Typography
} from '@mui/material'
import { Add } from '@mui/icons-material'
import {
    IAvailableSender, ICompositeNode, ICompositeRefNode,
    ICompositeFanoutNode, ICompositeFilterNode
} from './types'
import { addFanoutTarget } from './treeUtils'

interface INodeEditorProps {
    node: ICompositeNode
    path: string
    flow: ICompositeNode
    availableSenders: IAvailableSender[]
    onFlowChange: (flow: ICompositeNode) => void
}

// ─── Ref editor ───────────────────────────────────────────────────────────────

const RefEditor: React.FC<{
    node: ICompositeRefNode
    path: string
    flow: ICompositeNode
    availableSenders: IAvailableSender[]
    onFlowChange: (flow: ICompositeNode) => void
}> = ({ node, path, flow, availableSenders, onFlowChange }) => {
    const outputSenders = availableSenders.filter(s => s.senderType !== 'filter')
    const sender = outputSenders.find(s => s.id === node.senderId)
    const configNames = sender?.configNames ?? []

    const update = (patch: Partial<ICompositeRefNode>) => {
        const updated: ICompositeRefNode = { ...node, ...patch }
        if (patch.senderId && patch.senderId !== node.senderId) updated.configName = ''
        const newFlow = path
            ? (() => { const c = JSON.parse(JSON.stringify(flow)) as ICompositeNode; _set(c, path, updated); return c })()
            : updated
        onFlowChange(newFlow)
    }

    return (
        <Stack spacing={2} sx={{ mt: 1 }}>
            <FormControl size='small' fullWidth>
                <InputLabel>Sender</InputLabel>
                <Select label='Sender' value={node.senderId} onChange={e => update({ senderId: e.target.value })}>
                    {outputSenders.map(s => (
                        <MenuItem key={s.id} value={s.id}>{s.displayName ?? s.id}</MenuItem>
                    ))}
                </Select>
            </FormControl>
            <FormControl size='small' fullWidth disabled={!node.senderId || configNames.length === 0}>
                <InputLabel>Config</InputLabel>
                <Select label='Config' value={node.configName} onChange={e => update({ configName: e.target.value })}>
                    {configNames.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                </Select>
            </FormControl>
            {node.senderId && configNames.length === 0 && (
                <Typography variant='caption' color='warning.main'>
                    No configs registered for "{node.senderId}". Add one via Manage Senders first.
                </Typography>
            )}
        </Stack>
    )
}

// ─── Fanout editor ────────────────────────────────────────────────────────────

type FanoutChildKind = 'sender' | 'fanout' | 'filter'

const FanoutEditor: React.FC<{
    node: ICompositeFanoutNode
    path: string
    flow: ICompositeNode
    availableSenders: IAvailableSender[]
    onFlowChange: (flow: ICompositeNode) => void
}> = ({ node, path, flow, availableSenders, onFlowChange }) => {
    const outputSenders  = availableSenders.filter(s => s.senderType !== 'filter')
    const filterSenders  = availableSenders.filter(s => s.senderType === 'filter')
    const [childKind, setChildKind] = useState<FanoutChildKind>('sender')
    const [pickedSender, setPickedSender] = useState(outputSenders[0]?.id ?? '')
    const [pickedFilter, setPickedFilter] = useState(filterSenders[0]?.id ?? '')
    const [pickedConfig, setPickedConfig] = useState('')

    const senderConfigs = availableSenders.find(s => s.id === pickedSender)?.configNames ?? []
    const filterConfigs = availableSenders.find(s => s.id === pickedFilter)?.configNames ?? []
    const configsForKind = childKind === 'sender' ? senderConfigs : childKind === 'filter' ? filterConfigs : []

    const addDisabled =
        (childKind === 'sender' && (!pickedSender || (senderConfigs.length > 0 && !pickedConfig))) ||
        (childKind === 'filter' && filterSenders.length > 0 && filterConfigs.length > 0 && !pickedConfig)

    const handleAdd = () => {
        let newNode: ICompositeNode
        if (childKind === 'sender')      newNode = { type: 'ref',    senderId: pickedSender, configName: pickedConfig }
        else if (childKind === 'fanout') newNode = { type: 'fanout', targets: [] }
        else                             newNode = { type: 'filter', senderId: pickedFilter, configName: pickedConfig }
        onFlowChange(addFanoutTarget(flow, path, newNode))
        setPickedConfig('')
    }

    const selectSx = { height: 32, fontSize: '0.8rem', '& .MuiSelect-select': { py: 0, px: 1 } }

    return (
        <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography variant='caption' color='text.secondary'>
                Fans the message to all targets in parallel. Click a child node to configure it.
            </Typography>
            <Typography variant='body2'>{node.targets.length} target(s)</Typography>
            <Stack direction='row' spacing={0.5} alignItems='center' flexWrap='wrap' useFlexGap>
                <Select size='small' value={childKind}
                    onChange={e => { setChildKind(e.target.value as FanoutChildKind); setPickedConfig('') }}
                    sx={{ ...selectSx, minWidth: 110 }}>
                    <MenuItem value='sender' sx={{ fontSize: '0.8rem' }}>Sender</MenuItem>
                    <MenuItem value='fanout' sx={{ fontSize: '0.8rem' }}>Fanout</MenuItem>
                    <MenuItem value='filter' sx={{ fontSize: '0.8rem' }}>Filter</MenuItem>
                </Select>
                {childKind === 'sender' && (
                    <Select size='small' value={pickedSender}
                        onChange={e => { setPickedSender(e.target.value); setPickedConfig('') }}
                        displayEmpty sx={{ ...selectSx, flex: 1, minWidth: 100 }}>
                        {outputSenders.map(s => <MenuItem key={s.id} value={s.id} sx={{ fontSize: '0.8rem' }}>{s.displayName ?? s.id}</MenuItem>)}
                    </Select>
                )}
                {childKind === 'filter' && filterSenders.length > 0 && (
                    <Select size='small' value={pickedFilter}
                        onChange={e => { setPickedFilter(e.target.value); setPickedConfig('') }}
                        displayEmpty sx={{ ...selectSx, flex: 1, minWidth: 100 }}>
                        {filterSenders.map(s => <MenuItem key={s.id} value={s.id} sx={{ fontSize: '0.8rem' }}>{s.displayName ?? s.id}</MenuItem>)}
                    </Select>
                )}
                {configsForKind.length > 0 && (
                    <Select size='small' value={pickedConfig} onChange={e => setPickedConfig(e.target.value)} displayEmpty sx={{ ...selectSx, flex: 1, minWidth: 100 }}>
                        <MenuItem value='' sx={{ fontSize: '0.8rem' }}><em>— config —</em></MenuItem>
                        {configsForKind.map(c => <MenuItem key={c} value={c} sx={{ fontSize: '0.8rem' }}>{c}</MenuItem>)}
                    </Select>
                )}
                <Tooltip title='Add target'>
                    <span>
                        <IconButton size='small' color='success' disabled={addDisabled} onClick={handleAdd}>
                            <Add fontSize='small' />
                        </IconButton>
                    </span>
                </Tooltip>
            </Stack>
        </Stack>
    )
}

// ─── Filter editor ────────────────────────────────────────────────────────────

const FilterEditor: React.FC<{
    node: ICompositeFilterNode
    path: string
    flow: ICompositeNode
    availableSenders: IAvailableSender[]
    onFlowChange: (flow: ICompositeNode) => void
}> = ({ node, path, flow, availableSenders, onFlowChange }) => {
    const registration = (window as any).__kwirth_senders__?.[node.senderId]
    const nodeLabel     = registration?.nodeLabel ?? node.senderId
    const nodeDesc      = registration?.nodeDescription ?? ''
    const filterConfigs = availableSenders.find(s => s.id === node.senderId)?.configNames ?? []

    const update = (configName: string) => {
        const updated: ICompositeFilterNode = { ...node, configName }
        const newFlow = path
            ? (() => { const c = JSON.parse(JSON.stringify(flow)) as ICompositeNode; _set(c, path, updated); return c })()
            : updated
        onFlowChange(newFlow)
    }

    return (
        <Stack spacing={2} sx={{ mt: 1 }}>
            {nodeDesc && <Typography variant='caption' color='text.secondary'>{nodeDesc}</Typography>}
            <FormControl size='small' fullWidth>
                <InputLabel>{nodeLabel} config</InputLabel>
                <Select label={`${nodeLabel} config`} value={node.configName} onChange={e => update(e.target.value)}>
                    <MenuItem value=''><em>— none —</em></MenuItem>
                    {filterConfigs.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                </Select>
            </FormControl>
            {filterConfigs.length === 0 && (
                <Typography variant='caption' color='warning.main'>
                    No configs found. Add one via Manage Senders first.
                </Typography>
            )}
            {node.next && (
                <Typography variant='caption' color='text.secondary'>
                    Next: <strong>{node.next.type === 'ref' ? node.next.senderId : node.next.type}</strong>
                    {' '}(click in canvas to configure)
                </Typography>
            )}
        </Stack>
    )
}

// ─── NodeEditor dispatcher ────────────────────────────────────────────────────

const NodeEditor: React.FC<INodeEditorProps> = ({ node, path, flow, availableSenders, onFlowChange }) => {
    const filterLabel = node.type === 'filter'
        ? ((window as any).__kwirth_senders__?.[node.senderId]?.nodeLabel ?? node.senderId)
        : undefined
    const TYPE_LABEL: Record<string, string> = { fanout: 'Fanout', ref: 'Sender ref', filter: filterLabel ?? 'Filter' }

    return (
        <Box sx={{ height: '100%', overflow: 'auto', p: 2 }}>
            <Stack direction='row' alignItems='center' spacing={1} sx={{ mb: 1 }}>
                <Chip label={node.type === 'filter' ? node.senderId : node.type} size='small' />
                <Typography variant='subtitle2'>{TYPE_LABEL[node.type] ?? node.type}</Typography>
            </Stack>
            <Divider />
            {node.type === 'ref'    && <RefEditor    node={node} path={path} flow={flow} availableSenders={availableSenders} onFlowChange={onFlowChange} />}
            {node.type === 'fanout' && <FanoutEditor  node={node} path={path} flow={flow} availableSenders={availableSenders} onFlowChange={onFlowChange} />}
            {node.type === 'filter' && <FilterEditor  node={node} path={path} flow={flow} availableSenders={availableSenders} onFlowChange={onFlowChange} />}
        </Box>
    )
}

export default NodeEditor

// ─── Internal path setter ─────────────────────────────────────────────────────

function _set(node: unknown, path: string, value: unknown): void {
    const parts = path.split('.')
    const [key, ...rest] = parts
    if (rest.length === 0) {
        const idx = Number(key)
        if (!isNaN(idx)) (node as unknown[])[idx] = value
        else (node as Record<string, unknown>)[key] = value
        return
    }
    const idx = Number(key)
    const next = !isNaN(idx) ? (node as unknown[])[idx] : (node as Record<string, unknown>)[key]
    _set(next, rest.join('.'), value)
}
