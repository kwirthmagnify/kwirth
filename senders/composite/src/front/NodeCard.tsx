import React from 'react'
import { Box, Chip, Typography } from '@mui/material'
import { Block, CallSplit, FilterAlt, Send } from '@mui/icons-material'
import { ICompositeNode, ICompositeRegexRule } from './types'

interface INodeCardProps {
    node: ICompositeNode
    selected: boolean
    onClick: () => void
    tabIndex?: number
    onKeyDown?: (e: React.KeyboardEvent) => void
}

const TYPE_META: Record<string, { label: string; color: string; icon: React.ReactElement }> = {
    tee:   { label: 'tee',   color: '#e3f2fd', icon: <CallSplit fontSize='small' /> },
    regex: { label: 'regex', color: '#fff8e1', icon: <FilterAlt fontSize='small' /> },
    ref:   { label: 'ref',   color: '#e8f5e9', icon: <Send fontSize='small' /> },
}

function nodeSummary(node: ICompositeNode): string {
    if (node.type === 'tee')   return `${node.targets.length} target(s)`
    if (node.type === 'regex') return `${node.rules.length} rule(s) · default: ${node.defaultAction ?? 'drop'}`
    if (node.type === 'ref') {
        if (!node.senderId && !node.configName) return '(not configured)'
        return `${node.senderId || '?'} / ${node.configName || '?'}`
    }
    return ''
}

const NodeCard: React.FC<INodeCardProps> = ({ node, selected, onClick, tabIndex, onKeyDown }) => {
    const meta = TYPE_META[node.type]

    return (
        <Box
            tabIndex={tabIndex ?? 0}
            onClick={onClick}
            onKeyDown={onKeyDown}
            sx={{
                display: 'inline-flex', alignItems: 'center', gap: 1,
                px: 1.5, py: 0.75,
                bgcolor: selected ? 'primary.main' : meta.color,
                color: selected ? 'primary.contrastText' : 'text.primary',
                border: '1px solid',
                borderColor: selected ? 'primary.dark' : 'divider',
                borderRadius: 1.5,
                cursor: 'pointer',
                minWidth: 200,
                outline: 'none',
                '&:focus-visible': { boxShadow: '0 0 0 2px', boxShadowColor: 'primary.main' },
                '&:hover': { opacity: 0.9 },
            }}
        >
            <Box sx={{ color: selected ? 'primary.contrastText' : 'text.secondary', display: 'flex' }}>
                {meta.icon}
            </Box>
            <Box>
                <Chip
                    label={meta.label}
                    size='small'
                    sx={{ height: 18, fontSize: 10, bgcolor: selected ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.08)', color: 'inherit' }}
                />
                <Typography variant='body2' component='span' sx={{ ml: 1, fontWeight: 500 }}>
                    {nodeSummary(node)}
                </Typography>
            </Box>
        </Box>
    )
}

export default NodeCard

// ─── RuleCard ─────────────────────────────────────────────────────────────────

interface IRuleCardProps {
    rule: ICompositeRegexRule
    selected: boolean
    onClick: () => void
    onKeyDown?: (e: React.KeyboardEvent) => void
}

function ruleSummary(rule: ICompositeRegexRule): string {
    return `/${rule.regex}/${rule.flags ?? 'i'} · ${rule.field ?? 'subject'} → ${rule.action}`
}

export const RuleCard: React.FC<IRuleCardProps> = ({ rule, selected, onClick, onKeyDown }) => {
    const bg = rule.action === 'drop' ? '#ffebee' : '#f3e5f5'
    return (
        <Box
            tabIndex={0}
            onClick={onClick}
            onKeyDown={onKeyDown}
            sx={{
                display: 'inline-flex', alignItems: 'center', gap: 1,
                px: 1.5, py: 0.75,
                bgcolor: selected ? 'primary.main' : bg,
                color: selected ? 'primary.contrastText' : 'text.primary',
                border: '1px solid',
                borderColor: selected ? 'primary.dark' : 'divider',
                borderRadius: 1.5,
                cursor: 'pointer',
                minWidth: 200,
                outline: 'none',
                '&:focus-visible': { boxShadow: '0 0 0 2px', boxShadowColor: 'primary.main' },
                '&:hover': { opacity: 0.9 },
            }}
        >
            <Box sx={{ color: selected ? 'primary.contrastText' : 'text.secondary', display: 'flex' }}>
                {rule.action === 'drop' ? <Block fontSize='small' /> : <FilterAlt fontSize='small' />}
            </Box>
            <Box>
                <Chip
                    label='rule'
                    size='small'
                    sx={{ height: 18, fontSize: 10, bgcolor: selected ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.08)', color: 'inherit' }}
                />
                <Typography variant='body2' component='span' sx={{ ml: 1, fontWeight: 500 }}>
                    {ruleSummary(rule)}
                </Typography>
            </Box>
        </Box>
    )
}
