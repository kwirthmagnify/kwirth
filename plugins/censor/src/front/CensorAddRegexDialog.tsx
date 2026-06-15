import React, { useState } from 'react'
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, InputLabel, MenuItem, Select, Stack, TextField } from '@mui/material'
import { ICensorData, ERegexOrigin } from './CensorData'
import { ECensorCommand } from './CensorConfig'

interface ICensorAddRegexDialogProps {
    data: ICensorData
    sendCommand: (command: ECensorCommand, payload?: unknown) => void
    onClose: () => void
    initialRunnerKey?: string
    initialPattern?: string
    initialExplanation?: string
    lockRunner?: boolean
    onAdded?: (pattern: string, runnerKey: string, origin: ERegexOrigin, explanation: string) => void
}

const CensorAddRegexDialog: React.FC<ICensorAddRegexDialogProps> = ({ data, sendCommand, onClose, initialRunnerKey, initialPattern, initialExplanation, lockRunner, onAdded }) => {
    const activeConfigs = data.configs.filter(c => c.active)
    const defaultRunnerKey = initialRunnerKey ?? (activeConfigs.length === 1 ? `${activeConfigs[0].name}:${activeConfigs[0].version}` : '')
    const [runnerKey, setRunnerKey] = useState(defaultRunnerKey)
    const [pattern, setPattern] = useState(initialPattern ?? '')
    const [patternError, setPatternError] = useState(() => {
        if (!initialPattern) return ''
        try { new RegExp(initialPattern); return '' } catch (e) { return String(e) }
    })
    const [explanation, setExplanation] = useState(initialExplanation ?? '')

    const onPatternChange = (val: string) => {
        setPattern(val)
        if (!val) { setPatternError(''); return }
        try { new RegExp(val); setPatternError('') }
        catch (e) { setPatternError(String(e)) }
    }

    const handleOk = () => {
        const origin = lockRunner ? ERegexOrigin.HYBRID : ERegexOrigin.MANUAL
        sendCommand(ECensorCommand.REGEXADD, { runnerKey, pattern, explanation, origin })
        onAdded?.(pattern, runnerKey, origin, explanation)
        onClose()
    }

    return (
        <Dialog open={true} PaperProps={{ sx: { width: 560, maxWidth: '95vw' } }}>
            <DialogTitle>Add regex</DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{ pt: 1 }}>
                    <FormControl size='small' fullWidth disabled={lockRunner}>
                        <InputLabel>Config</InputLabel>
                        <Select label='Config' value={runnerKey} onChange={e => setRunnerKey(e.target.value)}>
                            {activeConfigs.map(c => {
                                const key = `${c.name}:${c.version}`
                                return <MenuItem key={key} value={key}>{c.name} v{c.version}</MenuItem>
                            })}
                        </Select>
                    </FormControl>
                    <TextField
                        label='Regex pattern' size='small' fullWidth
                        value={pattern}
                        onChange={e => onPatternChange(e.target.value)}
                        error={!!patternError}
                        helperText={patternError || ' '}
                        inputProps={{ style: { fontFamily: 'monospace' } }}
                    />
                    <TextField
                        label='Description' size='small' fullWidth multiline rows={3}
                        value={explanation}
                        onChange={e => setExplanation(e.target.value)}
                    />
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={handleOk} variant='contained' disabled={!runnerKey || !pattern || !!patternError}>OK</Button>
                <Button onClick={onClose} color='inherit'>Cancel</Button>
            </DialogActions>
        </Dialog>
    )
}

export { CensorAddRegexDialog }
