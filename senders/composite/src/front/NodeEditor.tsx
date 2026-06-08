import React, { useState } from 'react'
import {
    Box, Chip, Divider, FormControl, IconButton, InputLabel,
    MenuItem, Select, Stack, Tooltip, Typography
} from '@mui/material'
import { Add } from '@mui/icons-material'
import {
    IAvailableSender, ICompositeNode, ICompositeRefNode,
    ICompositeFanoutNode, ICompositeTimedNode, ICompositeRegexNode
} from './types'
import { addFanoutTarget } from './treeUtils'

interface INodeEditorProps {
    node: ICompositeNode
    path: string
    flow: ICompositeNode
    availableSenders: IAvailableSender[]
    onFlowChange: (flow: ICompositeNode) => void
}

const FILTER_TYPES = new Set(['timed', 'regex', 'composite', 'fanout'])

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

// ─── Fanout editor ────────────────────────────────────────────────────────────

type FanoutChildKind = 'sender' | 'fanout' | 'timed' | 'regex'

const FanoutEditor: React.FC<{
    node: ICompositeFanoutNode
    path: string
    flow: ICompositeNode
    availableSenders: IAvailableSender[]
    onFlowChange: (flow: ICompositeNode) => void
}> = ({ node, path, flow, availableSenders, onFlowChange }) => {
    const senders = availableSenders.filter(s => !FILTER_TYPES.has(s.id))
    const [childKind, setChildKind] = useState<FanoutChildKind>('sender')
    const [pickedSender, setPickedSender] = useState(senders[0]?.id ?? '')
    const [pickedConfig, setPickedConfig] = useState('')

    const timedConfigs = availableSenders.find(s => s.id === 'timed')?.configNames ?? []
    const regexConfigs = availableSenders.find(s => s.id === 'regex')?.configNames ?? []
    const senderConfigs = availableSenders.find(s => s.id === pickedSender)?.configNames ?? []

    const addDisabled =
        (childKind === 'sender' && (!pickedSender || (senderConfigs.length > 0 && !pickedConfig))) ||
        (childKind === 'timed' && timedConfigs.length > 0 && !pickedConfig) ||
        (childKind === 'regex' && regexConfigs.length > 0 && !pickedConfig)

    const handleAdd = () => {
        let newNode: ICompositeNode
        if (childKind === 'sender')      newNode = { type: 'ref', senderId: pickedSender, configName: pickedConfig }
        else if (childKind === 'fanout') newNode = { type: 'fanout', targets: [] }
        else if (childKind === 'timed')  newNode = { type: 'timed', configName: pickedConfig }
        else                             newNode = { type: 'regex', configName: pickedConfig }
        onFlowChange(addFanoutTarget(flow, path, newNode))
        setPickedConfig('')
    }

    const selectSx = { height: 32, fontSize: '0.8rem', '& .MuiSelect-select': { py: 0, px: 1 } }
    const configsForKind = childKind === 'timed' ? timedConfigs : childKind === 'regex' ? regexConfigs : childKind === 'sender' ? senderConfigs : []

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
                    <MenuItem value='timed'  sx={{ fontSize: '0.8rem' }}>Timed filter</MenuItem>
                    <MenuItem value='regex'  sx={{ fontSize: '0.8rem' }}>Regex filter</MenuItem>
                </Select>
                {childKind === 'sender' && (
                    <Select size='small' value={pickedSender}
                        onChange={e => { setPickedSender(e.target.value); setPickedConfig('') }}
                        displayEmpty sx={{ ...selectSx, flex: 1, minWidth: 100 }}>
                        {senders.map(s => <MenuItem key={s.id} value={s.id} sx={{ fontSize: '0.8rem' }}>{s.displayName ?? s.id}</MenuItem>)}
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
    const TYPE_LABEL: Record<string, string> = { fanout: 'Fanout', ref: 'Sender ref', timed: 'Timed filter', regex: 'Regex filter' }

    return (
        <Box sx={{ height: '100%', overflow: 'auto', p: 2 }}>
            <Stack direction='row' alignItems='center' spacing={1} sx={{ mb: 1 }}>
                <Chip label={node.type} size='small' />
                <Typography variant='subtitle2'>{TYPE_LABEL[node.type] ?? node.type}</Typography>
            </Stack>
            <Divider />
            {node.type === 'ref'    && <RefEditor    node={node} path={path} flow={flow} availableSenders={availableSenders} onFlowChange={onFlowChange} />}
            {node.type === 'fanout' && <FanoutEditor node={node} path={path} flow={flow} availableSenders={availableSenders} onFlowChange={onFlowChange} />}
            {node.type === 'timed'  && <TimedEditor  node={node} path={path} flow={flow} availableSenders={availableSenders} onFlowChange={onFlowChange} />}
            {node.type === 'regex'  && <RegexEditor  node={node} path={path} flow={flow} availableSenders={availableSenders} onFlowChange={onFlowChange} />}
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
