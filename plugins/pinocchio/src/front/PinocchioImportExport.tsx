import React, { useRef, useState } from 'react'
import { Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from '@mui/material'
import { IConfigTrigger, IPinocchioConfig } from './PinocchioConfig'
import { useKeyboard } from '@kwirthmagnify/kwirth-common-front'

interface IProps {
    config: IPinocchioConfig
    onClose: (config?: IPinocchioConfig) => void
}

interface IExportFile {
    version: '1'
    triggers: IConfigTrigger[]
}

interface ICheckSectionProps {
    label: string
    items: string[]
    selected: Set<string>
    onChange: (next: Set<string>) => void
    existsLabel?: (key: string) => boolean
}

const CheckSection: React.FC<ICheckSectionProps> = ({ label, items, selected, onChange, existsLabel }) => {
    const allChecked = items.length > 0 && items.every(k => selected.has(k))
    const someChecked = items.some(k => selected.has(k))
    const toggleAll = () => onChange(allChecked ? new Set() : new Set(items))
    const toggleOne = (key: string) => { const next = new Set(selected); if (next.has(key)) next.delete(key); else next.add(key); onChange(next) }

    return (
        <Box sx={{ mb: 1 }}>
            <Stack direction='row' alignItems='center'>
                <Checkbox size='small' checked={allChecked} indeterminate={someChecked && !allChecked} onChange={toggleAll} disabled={items.length === 0} />
                <Typography variant='subtitle2' sx={{ fontWeight: 'bold' }}>{label}</Typography>
            </Stack>
            <Box sx={{ pl: 3 }}>
                {items.length === 0
                    ? <Typography variant='body2' color='text.secondary' sx={{ ml: 1 }}>— none —</Typography>
                    : items.map(key => (
                        <Stack key={key} direction='row' alignItems='center'>
                            <Checkbox size='small' checked={selected.has(key)} onChange={() => toggleOne(key)} />
                            <Typography variant='body2'>{key}</Typography>
                            {existsLabel?.(key) && <Typography variant='caption' color='warning.main' sx={{ ml: 1 }}>(overwrites existing)</Typography>}
                        </Stack>
                    ))
                }
            </Box>
        </Box>
    )
}

const PinocchioImportExport: React.FC<IProps> = (props) => {
    useKeyboard(() => props.onClose())
    const fileInputRef = useRef<HTMLInputElement>(null)

    const [exportTriggers, setExportTriggers] = useState<Set<string>>(new Set(props.config.triggers.map(t => t.id)))
    const [importFile, setImportFile] = useState<IExportFile | null>(null)
    const [importTriggers, setImportTriggers] = useState<Set<string>>(new Set())
    const [importError, setImportError] = useState('')
    const [mode, setMode] = useState<'export'|'import'>('export')

    const handleDownload = async () => {
        const data: IExportFile = { version: '1', triggers: props.config.triggers.filter(t => exportTriggers.has(t.id)) }
        const json = JSON.stringify(data, null, 2)
        const filename = `pinocchio-triggers-${new Date().toISOString().slice(0, 10)}.json`
        const tauri = (window as any).__TAURI__
        if (tauri?.dialog?.save && tauri?.fs?.writeTextFile) {
            const path = await tauri.dialog.save({ defaultPath: filename, filters: [{ name: 'JSON', extensions: ['json'] }] })
            if (path) await tauri.fs.writeTextFile(path, json)
            return
        }
        const blob = new Blob([json], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
        URL.revokeObjectURL(url)
    }

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]; if (!file) return
        const reader = new FileReader()
        reader.onload = (ev) => {
            try {
                const parsed = JSON.parse(ev.target?.result as string) as IExportFile
                if (parsed.version !== '1') throw new Error('Unsupported version')
                setImportFile(parsed)
                setImportTriggers(new Set((parsed.triggers ?? []).map(t => t.id)))
                setImportError('')
            } catch { setImportError('Invalid or unsupported file'); setImportFile(null) }
        }
        reader.readAsText(file); e.target.value = ''
    }

    const handleImport = () => {
        if (!importFile) return
        const result = [...props.config.triggers]
        for (const t of importFile.triggers.filter(t => importTriggers.has(t.id))) {
            const idx = result.findIndex(x => x.id === t.id)
            if (idx >= 0) result[idx] = t; else result.push(t)
        }
        props.onClose({ ...props.config, triggers: result })
    }

    return (
        <Dialog open={true} PaperProps={{ sx: { width: '50vw', maxWidth: '560px' } }}>
            <DialogTitle>Triggers — Import / Export</DialogTitle>
            <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1, pt: 1 }}>
                <Stack direction='row' spacing={1} sx={{ mb: 1 }}>
                    <Button size='small' variant={mode === 'export' ? 'contained' : 'outlined'} onClick={() => setMode('export')}>Export</Button>
                    <Button size='small' variant={mode === 'import' ? 'contained' : 'outlined'} onClick={() => setMode('import')}>Import</Button>
                </Stack>

                {mode === 'export' && <>
                    <CheckSection label='Triggers' items={props.config.triggers.map(t => t.id)} selected={exportTriggers} onChange={setExportTriggers} />
                    <Button variant='contained' size='small' onClick={handleDownload} disabled={exportTriggers.size === 0} sx={{ alignSelf: 'flex-start', mt: 1 }}>Download JSON</Button>
                </>}

                {mode === 'import' && <>
                    <Stack direction='row' alignItems='center' spacing={2}>
                        <input ref={fileInputRef} type='file' accept='.json' style={{ display: 'none' }} onChange={handleFileChange} />
                        <Button variant='outlined' size='small' onClick={() => fileInputRef.current?.click()}>Upload JSON…</Button>
                        {importError && <Typography color='error' variant='body2'>{importError}</Typography>}
                    </Stack>
                    {importFile && <>
                        <CheckSection label='Triggers' items={importFile.triggers.map(t => t.id)} selected={importTriggers} onChange={setImportTriggers} existsLabel={key => props.config.triggers.some(t => t.id === key)} />
                        <Button variant='contained' size='small' onClick={handleImport} disabled={importTriggers.size === 0} sx={{ alignSelf: 'flex-start', mt: 1 }}>Import selected</Button>
                    </>}
                </>}
            </DialogContent>
            <DialogActions>
                <Button onClick={() => props.onClose()}>Close</Button>
            </DialogActions>
        </Dialog>
    )
}

export { PinocchioImportExport }
