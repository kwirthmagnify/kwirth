import React, { useState } from 'react'
import {
    Box, Chip, Divider, FormControl, IconButton, InputLabel,
    MenuItem, Select, Stack, Tooltip, Typography
} from '@mui/material'
import { Add } from '@mui/icons-material'
import {
    IAvailableSender, ICompositeNode, ICompositeRefNode,
    ICompositeTeeNode, ICompositeTimedNode, ICompositeRegexNode
} from './types'
import { addTeeTarget } from './treeUtils'

interface INodeEditorProps {
    node: ICompositeNode
    path: string
    flow: ICompositeNode
    availableSenders: IAvailableSender[]
    onFlowChange: (flow: ICompositeNode) => void
}

const FILTER_TYPES = new Set(['timed', 'regex', 'composite', 'tee'])

// ─── Ref editor ───────────────────────────────────────────────────────────────

const RefEditor: React.FC<{
    node: ICompositeRefNode
    path: string
    flow: ICompositeNode
    availableSenders: IAvailableSender[]
    onFlowChange: (flow: ICompositeNode) => void
}> = ({ node, path, flow, availableSenders, onFlowChange }) => {
    const senders = availableSenders.filter(s => !FILTER_TYPES.has(s.id))
    const sender = senders.find(s => s.id === node.senderId)
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
                    {senders.map(s => (
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

// ─── Tee editor ───────────────────────────────────────────────────────────────

const TeeEditor: React.FC<{
    node: ICompositeTeeNode
    path: string
    flow: ICompositeNode
    availableSenders: IAvailableSender[]
    onFlowChange: (flow: ICompositeNode) => void
}> = ({ node, path, flow, availableSenders, onFlowChange }) => {
    const senders = availableSenders.filter(s => !FILTER_TYPES.has(s.id))
    const [pickedSender, setPickedSender] = useState(senders[0]?.id ?? '')

    return (
        <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography variant='caption' color='text.secondary'>
                Fans the message to all targets in parallel. Click a child node to configure it.
            </Typography>
            <Typography variant='body2'>{node.targets.length} target(s)</Typography>
            <Stack direction='row' spacing={1} alignItems='center'>
                <Select size='small' value={pickedSender} onChange={e => setPickedSender(e.target.value)}
                    displayEmpty sx={{ flex: 1, height: 32, fontSize: '0.8rem' }}>
                    {senders.map(s => (
                        <MenuItem key={s.id} value={s.id} sx={{ fontSize: '0.8rem' }}>{s.displayName ?? s.id}</MenuItem>
                    ))}
                </Select>
                <Tooltip title='Add sender'>
                    <span>
                        <IconButton size='small' color='success' disabled={!pickedSender}
                            onClick={() => onFlowChange(addTeeTarget(flow, path, { type: 'ref', senderId: pickedSender, configName: '' }))}>
                            <Add fontSize='small' />
                        </IconButton>
                    </span>
                </Tooltip>
            </Stack>
        </Stack>
    )
}

// ─── Timed editor ─────────────────────────────────────────────────────────────

const TimedEditor: React.FC<{
    node: ICompositeTimedNode
    path: string
    flow: ICompositeNode
    availableSenders: IAvailableSender[]
    onFlowChange: (flow: ICompositeNode) => void
}> = ({ node, path, flow, availableSenders, onFlowChange }) => {
    const timedConfigs = availableSenders.find(s => s.id === 'timed')?.configNames ?? []

    const update = (configName: string) => {
        const updated: ICompositeTimedNode = { ...node, configName }
        const newFlow = path
            ? (() => { const c = JSON.parse(JSON.stringify(flow)) as ICompositeNode; _set(c, path, updated); return c })()
            : updated
        onFlowChange(newFlow)
    }

    return (
        <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography variant='caption' color='text.secondary'>
                Filters by time of day / day of week. Matching messages are forwarded to the next node; others are dropped.
            </Typography>
            <FormControl size='small' fullWidth>
                <InputLabel>Timed config</InputLabel>
                <Select label='Timed config' value={node.configName}
                    onChange={e => update(e.target.value)}>
                    <MenuItem value=''><em>— none —</em></MenuItem>
                    {timedConfigs.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                </Select>
            </FormControl>
            {timedConfigs.length === 0 && (
                <Typography variant='caption' color='warning.main'>
                    No timed configs found. Add one via Manage Senders first.
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

// ─── Regex editor ─────────────────────────────────────────────────────────────

const RegexEditor: React.FC<{
    node: ICompositeRegexNode
    path: string
    flow: ICompositeNode
    availableSenders: IAvailableSender[]
    onFlowChange: (flow: ICompositeNode) => void
}> = ({ node, path, flow, availableSenders, onFlowChange }) => {
    const regexConfigs = availableSenders.find(s => s.id === 'regex')?.configNames ?? []

    const update = (configName: string) => {
        const updated: ICompositeRegexNode = { ...node, configName }
        const newFlow = path
            ? (() => { const c = JSON.parse(JSON.stringify(flow)) as ICompositeNode; _set(c, path, updated); return c })()
            : updated
        onFlowChange(newFlow)
    }

    return (
        <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography variant='caption' color='text.secondary'>
                Filters by regex pattern / field. Messages with a "send" action are forwarded to the next node; "drop" actions discard the message.
            </Typography>
            <FormControl size='small' fullWidth>
                <InputLabel>Regex config</InputLabel>
                <Select label='Regex config' value={node.configName}
                    onChange={e => update(e.target.value)}>
                    <MenuItem value=''><em>— none —</em></MenuItem>
                    {regexConfigs.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                </Select>
            </FormControl>
            {regexConfigs.length === 0 && (
                <Typography variant='caption' color='warning.main'>
                    No regex configs found. Add one via Manage Senders first.
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
    const TYPE_LABEL: Record<string, string> = { tee: 'Tee', ref: 'Sender ref', timed: 'Timed filter', regex: 'Regex filter' }

    return (
        <Box sx={{ height: '100%', overflow: 'auto', p: 2 }}>
            <Stack direction='row' alignItems='center' spacing={1} sx={{ mb: 1 }}>
                <Chip label={node.type} size='small' />
                <Typography variant='subtitle2'>{TYPE_LABEL[node.type] ?? node.type}</Typography>
            </Stack>
            <Divider />
            {node.type === 'ref'   && <RefEditor   node={node} path={path} flow={flow} availableSenders={availableSenders} onFlowChange={onFlowChange} />}
            {node.type === 'tee'   && <TeeEditor   node={node} path={path} flow={flow} availableSenders={availableSenders} onFlowChange={onFlowChange} />}
            {node.type === 'timed' && <TimedEditor node={node} path={path} flow={flow} availableSenders={availableSenders} onFlowChange={onFlowChange} />}
            {node.type === 'regex' && <RegexEditor node={node} path={path} flow={flow} availableSenders={availableSenders} onFlowChange={onFlowChange} />}
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
