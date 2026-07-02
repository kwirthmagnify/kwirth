import React, { useState } from 'react'
import { FilterList } from '@mui/icons-material'
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Typography } from '@mui/material'
import { ISetupProps } from '@kwirthmagnify/kwirth-common-front'
import { CensorConfig, ICensorConfig } from './CensorConfig'

const CensorIcon = <FilterList />

const CensorSetup: React.FC<ISetupProps> = (props: ISetupProps) => {
    const initial: ICensorConfig = props.setupConfig?.channelConfig ?? new CensorConfig()
    const [maxLlmInputLines, setMaxLlmInputLines] = useState(initial.maxLlmInputLines ?? 100)
    const [maxLlmOutputLines, setMaxLlmOutputLines] = useState(initial.maxLlmOutputLines ?? 100)

    const posInt = (val: string, fallback: number) => { const n = parseInt(val); return isNaN(n) || n < 1 ? fallback : n }

    const handleStart = () => {
        const config: ICensorConfig = { maxLines: initial.maxLines ?? 1000, maxLlmInputLines, maxLlmOutputLines }
        props.onChannelSetupClosed(props.channel, { channelId: 'censor', channelConfig: config, channelInstanceConfig: {} }, true, false)
    }

    const handleCancel = () => {
        props.onChannelSetupClosed(props.channel, { channelId: 'censor', channelConfig: initial, channelInstanceConfig: {} }, false, false)
    }

    return (
        <Dialog open={true} PaperProps={{ sx: { width: 360, height: 220 } }}>
            <DialogTitle>Censor</DialogTitle>
            <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
                <Typography variant='body2' color='text.secondary'>
                    Configure visible line limits.
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                    <TextField size='small' label='LLM input lines' type='number' inputProps={{ min: 1 }} sx={{ flex: 1 }}
                        value={maxLlmInputLines}
                        onChange={e => setMaxLlmInputLines(posInt(e.target.value, 100))} />
                    <TextField size='small' label='LLM output lines' type='number' inputProps={{ min: 1 }} sx={{ flex: 1 }}
                        value={maxLlmOutputLines}
                        onChange={e => setMaxLlmOutputLines(posInt(e.target.value, 100))} />
                </Box>
            </DialogContent>
            <DialogActions>
                <Button onClick={handleCancel} color='inherit'>Cancel</Button>
                <Button onClick={handleStart} variant='contained'>Start</Button>
            </DialogActions>
        </Dialog>
    )
}

export { CensorSetup, CensorIcon }
