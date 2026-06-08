import React from 'react'
import { Box, Chip, Tooltip, Typography, useTheme } from '@mui/material'
import { AccessTime, AccountTree, FilterAlt, Send } from '@mui/icons-material'
import { ICompositeNode } from './types'

interface INodeCardProps {
    node: ICompositeNode
    selected: boolean
    description?: string
    onClick: () => void
    tabIndex?: number
    onKeyDown?: (e: React.KeyboardEvent) => void
}

const TYPE_META_LIGHT: Record<string, { label: string; color: string; icon: React.ReactElement }> = {
    fanout: { label: 'fanout', color: '#e3f2fd', icon: <AccountTree fontSize='small' /> },
    timed:  { label: 'timed',  color: '#fff8e1', icon: <AccessTime fontSize='small' /> },
    regex:  { label: 'regex',  color: '#fce4ec', icon: <FilterAlt fontSize='small' /> },
    ref:    { label: 'ref',    color: '#e8f5e9', icon: <Send fontSize='small' /> },
}

const TYPE_META_DARK: Record<string, { label: string; color: string; icon: React.ReactElement }> = {
    fanout: { label: 'fanout', color: '#1565c0', icon: <AccountTree fontSize='small' /> },
    timed:  { label: 'timed',  color: '#e65100', icon: <AccessTime fontSize='small' /> },
    regex:  { label: 'regex',  color: '#880e4f', icon: <FilterAlt fontSize='small' /> },
    ref:    { label: 'ref',    color: '#1b5e20', icon: <Send fontSize='small' /> },
}

const NodeCard: React.FC<INodeCardProps> = ({ node, selected, description, onClick, tabIndex, onKeyDown }) => {
    const theme = useTheme()
    const TYPE_META = theme.palette.mode === 'dark' ? TYPE_META_DARK : TYPE_META_LIGHT
    const meta = TYPE_META[node.type] ?? TYPE_META['ref']

    const chipLabel = node.type === 'ref'
        ? (node.senderId || 'ref')
        : meta.label

    let summary = ''
    if (node.type === 'fanout') {
        summary = `${node.targets.length} target(s)`
    } else if (node.type === 'timed' || node.type === 'regex') {
        summary = node.configName || '(no config)'
    } else if (node.type === 'ref') {
        summary = node.configName || (node.senderId ? '(no config)' : '(not configured)')
    }

    return (
        <Tooltip title={description ?? ''} placement='top' disableHoverListener={!description} arrow>
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
                    label={chipLabel}
                    size='small'
                    sx={{ height: 18, fontSize: 10, bgcolor: selected ? 'rgba(255,255,255,0.2)' : theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.08)', color: 'inherit' }}
                />
                <Typography variant='body2' component='span' sx={{ ml: 1, fontWeight: 500 }}>
                    {summary}
                </Typography>
            </Box>
        </Box>
        </Tooltip>
    )
}

export default NodeCard
