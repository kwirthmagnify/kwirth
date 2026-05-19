import React from 'react'
import {
    Box, Button, Chip, Divider, FormControl, InputLabel,
    MenuItem, Select, Stack, TextField, Typography
} from '@mui/material'
import { Add, Block, CallSplit, FilterAlt, Send } from '@mui/icons-material'
import {
    IAvailableSender, ICompositeNode, ICompositeRefNode,
    ICompositeRegexNode, ICompositeTeeNode, ICompositeRegexRule
} from './types'
import {
    addRegexRule, addTeeTarget, createNode,
    setRegexDefault, updateRegexRule,
    getRegexNodePathFromRulePath, getRuleIndex
} from './treeUtils'

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
    const sender = availableSenders.find(s => s.id === node.senderId)
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
                    {availableSenders.map(s => (
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

// ─── Regex editor ─────────────────────────────────────────────────────────────

const RegexEditor: React.FC<{
    node: ICompositeRegexNode
    path: string
    flow: ICompositeNode
    onFlowChange: (flow: ICompositeNode) => void
}> = ({ node, path, flow, onFlowChange }) => {

    const addSendRule = () => {
        const rule: ICompositeRegexRule = { regex: '.*', flags: 'i', field: 'subject', action: 'send', target: createNode('ref') }
        onFlowChange(addRegexRule(flow, path, rule))
    }

    const addDropRule = () => {
        const rule: ICompositeRegexRule = { regex: '.*', flags: 'i', field: 'subject', action: 'drop' }
        onFlowChange(addRegexRule(flow, path, rule))
    }

    const setDefault = (action: 'send' | 'drop') => {
        const target = action === 'send' ? createNode('ref') : undefined
        onFlowChange(setRegexDefault(flow, path, action, target))
    }

    return (
        <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography variant='caption' color='text.secondary'>
                Select a rule in the tree to edit it. Rules are evaluated in order — first match wins.
            </Typography>
            <Typography variant='body2'>{node.rules.length} rule(s)</Typography>
            <Stack direction='row' spacing={1}>
                <Button size='small' startIcon={<Add />} variant='outlined' onClick={addSendRule}>
                    Add send rule
                </Button>
                <Button size='small' startIcon={<Block />} variant='outlined' color='error' onClick={addDropRule}>
                    Add drop rule
                </Button>
            </Stack>
            <Divider />
            <Stack direction='row' spacing={1} alignItems='center'>
                <Typography variant='body2' sx={{ flex: 1 }}>Default action:</Typography>
                <FormControl size='small' sx={{ width: 120 }}>
                    <Select value={node.defaultAction ?? 'drop'} onChange={e => setDefault(e.target.value as 'send' | 'drop')}>
                        <MenuItem value='drop'>drop</MenuItem>
                        <MenuItem value='send'>send</MenuItem>
                    </Select>
                </FormControl>
            </Stack>
            {node.defaultAction === 'send' && (
                <Typography variant='caption' color='text.secondary'>
                    Default target: click the "default →" child node in the tree to configure it.
                </Typography>
            )}
        </Stack>
    )
}

// ─── Rule editor ──────────────────────────────────────────────────────────────

const FIELDS = ['subject', 'body', 'level', 'to'] as const

export const RuleEditor: React.FC<{
    rule: ICompositeRegexRule
    path: string
    flow: ICompositeNode
    onFlowChange: (flow: ICompositeNode) => void
}> = ({ rule, path, flow, onFlowChange }) => {
    const regexNodePath = getRegexNodePathFromRulePath(path)
    const ruleIndex = getRuleIndex(path)

    const update = (patch: Partial<ICompositeRegexRule>) => {
        const updated = { ...rule, ...patch }
        if (patch.action === 'drop') delete updated.target
        if (patch.action === 'send' && !updated.target) updated.target = createNode('ref')
        onFlowChange(updateRegexRule(flow, regexNodePath, ruleIndex, updated))
    }

    return (
        <Stack spacing={2} sx={{ mt: 1 }}>
            <Stack direction='row' spacing={1}>
                <TextField
                    size='small' label='Regex' fullWidth
                    value={rule.regex}
                    onChange={e => update({ regex: e.target.value })}
                />
                <TextField
                    size='small' label='Flags' sx={{ width: 80 }}
                    value={rule.flags ?? 'i'}
                    onChange={e => update({ flags: e.target.value })}
                />
            </Stack>
            <FormControl size='small' fullWidth>
                <InputLabel>Field</InputLabel>
                <Select label='Field' value={rule.field ?? 'subject'} onChange={e => update({ field: e.target.value as typeof FIELDS[number] })}>
                    {FIELDS.map(f => <MenuItem key={f} value={f}>{f}</MenuItem>)}
                </Select>
            </FormControl>
            <FormControl size='small' fullWidth>
                <InputLabel>Action</InputLabel>
                <Select label='Action' value={rule.action} onChange={e => update({ action: e.target.value as 'send' | 'drop' })}>
                    <MenuItem value='send'>send</MenuItem>
                    <MenuItem value='drop'>drop</MenuItem>
                </Select>
            </FormControl>
            {rule.action === 'send' && (
                <Typography variant='caption' color='text.secondary'>
                    Click the target node in the tree to configure the sender.
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
    onFlowChange: (flow: ICompositeNode) => void
}> = ({ node, path, flow, onFlowChange }) => {

    const add = (type: 'tee' | 'regex' | 'ref') => {
        onFlowChange(addTeeTarget(flow, path, createNode(type)))
    }

    return (
        <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography variant='caption' color='text.secondary'>
                Tee fans the message to all targets in parallel. Click a child node in the tree to configure it.
            </Typography>
            <Typography variant='body2'>{node.targets.length} target(s)</Typography>
            <Stack direction='row' spacing={1} flexWrap='wrap' useFlexGap>
                <Button size='small' startIcon={<CallSplit />} variant='outlined' onClick={() => add('tee')}>
                    + tee
                </Button>
                <Button size='small' startIcon={<FilterAlt />} variant='outlined' onClick={() => add('regex')}>
                    + regex
                </Button>
                <Button size='small' startIcon={<Send />} variant='outlined' color='success' onClick={() => add('ref')}>
                    + ref
                </Button>
            </Stack>
        </Stack>
    )
}

// ─── NodeEditor dispatcher ────────────────────────────────────────────────────

const NodeEditor: React.FC<INodeEditorProps> = ({ node, path, flow, availableSenders, onFlowChange }) => {
    const TYPE_LABEL: Record<string, string> = { tee: 'Tee', regex: 'Regex', ref: 'Ref' }

    return (
        <Box sx={{ height: '100%', overflow: 'auto', p: 2 }}>
            <Stack direction='row' alignItems='center' spacing={1} sx={{ mb: 1 }}>
                <Chip label={node.type} size='small' />
                <Typography variant='subtitle2'>{TYPE_LABEL[node.type]} node</Typography>
            </Stack>
            <Divider />
            {node.type === 'ref' && (
                <RefEditor node={node} path={path} flow={flow} availableSenders={availableSenders} onFlowChange={onFlowChange} />
            )}
            {node.type === 'regex' && (
                <RegexEditor node={node} path={path} flow={flow} onFlowChange={onFlowChange} />
            )}
            {node.type === 'tee' && (
                <TeeEditor node={node} path={path} flow={flow} onFlowChange={onFlowChange} />
            )}
        </Box>
    )
}

export default NodeEditor

// ─── Internal path setter (used in RefEditor) ─────────────────────────────────

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
