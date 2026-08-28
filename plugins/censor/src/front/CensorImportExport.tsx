import React, { useRef, useState } from 'react'
import { Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, List, ListItem, Tab, Tabs, TextField, Typography } from '@mui/material'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import { ICensorInstanceConfig } from './CensorConfig'

interface ICensorImportExportProps {
    configs: ICensorInstanceConfig[]
    onClose: (imported?: ICensorInstanceConfig[]) => void
}

// Tab IDs decoupled from render position (never use positional indices)
enum EImportExportTab {
    Export = 'export',
    Import = 'import'
}

const CensorImportExport: React.FC<ICensorImportExportProps> = ({ configs, onClose }) => {
    const [tab, setTab] = useState<EImportExportTab>(EImportExportTab.Export)

    const [selectedExport, setSelectedExport] = useState<Set<number>>(new Set(configs.map((_, i) => i)))

    const [importText, setImportText] = useState('')
    const [importError, setImportError] = useState('')
    const [parsedConfigs, setParsedConfigs] = useState<ICensorInstanceConfig[]>([])
    const [selectedImport, setSelectedImport] = useState<Set<number>>(new Set())
    const fileInputRef = useRef<HTMLInputElement>(null)

    const toggleExport = (i: number) => {
        setSelectedExport(prev => {
            const next = new Set(prev)
            if (next.has(i)) next.delete(i); else next.add(i)
            return next
        })
    }

    const handleExport = () => {
        const toExport = configs.filter((_, i) => selectedExport.has(i))
        const json = JSON.stringify(toExport, null, 2)
        const blob = new Blob([json], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'censor-configs.json'
        a.click()
        URL.revokeObjectURL(url)
    }

    const handleImportTextChange = (text: string) => {
        setImportText(text)
        setImportError('')
        setParsedConfigs([])
        setSelectedImport(new Set())
        if (!text.trim()) return
        try {
            const parsed = JSON.parse(text)
            if (!Array.isArray(parsed)) { setImportError('Expected a JSON array of configs'); return }
            setParsedConfigs(parsed)
            setSelectedImport(new Set(parsed.map((_: unknown, i: number) => i)))
        } catch (err) {
            setImportError(String(err))
        }
    }

    const toggleImport = (i: number) => {
        setSelectedImport(prev => {
            const next = new Set(prev)
            if (next.has(i)) next.delete(i); else next.add(i)
            return next
        })
    }

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        const reader = new FileReader()
        reader.onload = ev => handleImportTextChange(ev.target?.result as string ?? '')
        reader.readAsText(file)
        e.target.value = ''
    }

    const handleImport = () => {
        onClose(parsedConfigs.filter((_, i) => selectedImport.has(i)))
    }

    return (
        <Dialog open PaperProps={{ sx: { width: 500, height: 500 } }}>
            <DialogTitle>Import / Export configs</DialogTitle>
            <DialogContent sx={{ display: 'flex', flexDirection: 'column', p: 0, overflow: 'hidden' }}>
                <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ borderBottom: 1, borderColor: 'divider', px: 2, minHeight: 36, '& .MuiTab-root': { minHeight: 36, py: 0.5 } }}>
                    <Tab value={EImportExportTab.Export} label='Export' />
                    <Tab value={EImportExportTab.Import} label='Import' />
                </Tabs>

                {tab === EImportExportTab.Export && (
                    <Box sx={{ flex: 1, overflowY: 'auto', px: 2, pt: 1 }}>
                        {configs.length === 0
                            ? <Typography variant='caption' color='text.secondary'>No configs to export.</Typography>
                            : <List dense disablePadding>
                                {configs.map((cfg, i) => (
                                    <ListItem key={i} disableGutters>
                                        <FormControlLabel
                                            control={<Checkbox size='small' checked={selectedExport.has(i)} onChange={() => toggleExport(i)} />}
                                            label={
                                                <Typography variant='body2'>
                                                    {cfg.name}&nbsp;
                                                    <Typography component='span' variant='caption' color='text.secondary'>v{cfg.version}</Typography>
                                                </Typography>
                                            } />
                                    </ListItem>
                                ))}
                            </List>
                        }
                    </Box>
                )}

                {tab === EImportExportTab.Import && (
                    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', px: 2, pt: 1, gap: 1, overflow: 'hidden' }}>
                        <input ref={fileInputRef} type='file' accept='.json,application/json' style={{ display: 'none' }} onChange={handleFileUpload} />
                        <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                            <TextField multiline rows={6} fullWidth size='small'
                                placeholder='Paste exported JSON here...'
                                value={importText} onChange={e => handleImportTextChange(e.target.value)}
                                error={!!importError} helperText={importError || ' '}
                                inputProps={{ style: { fontFamily: 'monospace', fontSize: 12 } }} />
                            <Button variant='outlined' size='small' startIcon={<UploadFileIcon />}
                                onClick={() => fileInputRef.current?.click()}
                                sx={{ mt: 0.5, whiteSpace: 'nowrap', flexShrink: 0 }}>
                                Upload file
                            </Button>
                        </Box>
                        {parsedConfigs.length > 0 && (
                            <Box sx={{ flex: 1, overflowY: 'auto' }}>
                                <Typography variant='caption' color='text.secondary'>Select configs to import:</Typography>
                                <List dense disablePadding>
                                    {parsedConfigs.map((cfg, i) => (
                                        <ListItem key={i} disableGutters>
                                            <FormControlLabel
                                                control={<Checkbox size='small' checked={selectedImport.has(i)} onChange={() => toggleImport(i)} />}
                                                label={
                                                    <Typography variant='body2'>
                                                        {cfg.name}&nbsp;
                                                        <Typography component='span' variant='caption' color='text.secondary'>v{cfg.version}</Typography>
                                                    </Typography>
                                                } />
                                        </ListItem>
                                    ))}
                                </List>
                            </Box>
                        )}
                    </Box>
                )}
            </DialogContent>
            <DialogActions>
                {tab === EImportExportTab.Export && <Button variant='contained' onClick={handleExport} disabled={selectedExport.size === 0}>Export</Button>}
                {tab === EImportExportTab.Import && <Button variant='contained' onClick={handleImport} disabled={selectedImport.size === 0}>Import</Button>}
                <Button variant='outlined' onClick={() => onClose(undefined)} color='inherit'>Cancel</Button>
            </DialogActions>
        </Dialog>
    )
}

export { CensorImportExport }
