import React, { useRef, useState } from 'react'
import { Box, Button, Checkbox, Divider, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Tab, Tabs, Typography } from '@mui/material'
import { IConfigLlm, IConfigProvider, IConfigTrigger, IPinocchioConfig } from './PinocchioConfig'
import { useKeyboard } from '@kwirthmagnify/kwirth-common-front'

interface IProps {
    providers: IConfigProvider[]
    config: IPinocchioConfig
    onClose: (providers?: IConfigProvider[], config?: IPinocchioConfig) => void
}

interface IExportFile {
    version: '1'
    providers?: IConfigProvider[]
    llms?: IConfigLlm[]
    triggers?: IConfigTrigger[]
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

    const toggleOne = (key: string) => {
        const next = new Set(selected)
        if (next.has(key)) next.delete(key)
        else next.add(key)
        onChange(next)
    }

    return (
        <Box sx={{ mb: 1 }}>
            <Stack direction="row" alignItems="center">
                <Checkbox size="small" checked={allChecked} indeterminate={someChecked && !allChecked} onChange={toggleAll} disabled={items.length === 0} />
                <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>{label}</Typography>
            </Stack>
            <Box sx={{ pl: 3 }}>
                {items.length === 0
                    ? <Typography variant="body2" color="text.secondary" sx={{ ml: 1 }}>— none —</Typography>
                    : items.map(key => (
                        <Stack key={key} direction="row" alignItems="center">
                            <Checkbox size="small" checked={selected.has(key)} onChange={() => toggleOne(key)} />
                            <Typography variant="body2">{key}</Typography>
                            {existsLabel?.(key) && <Typography variant="caption" color="warning.main" sx={{ ml: 1 }}>(overwrites existing)</Typography>}
                        </Stack>
                    ))
                }
            </Box>
        </Box>
    )
}

const PinocchioImportExport: React.FC<IProps> = (props) => {
    useKeyboard(() => props.onClose())

    const [tab, setTab] = useState(0)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const [exportProviders, setExportProviders] = useState<Set<string>>(new Set(props.providers.map(p => p.name)))
    const [exportLlms, setExportLlms] = useState<Set<string>>(new Set(props.config.llms.map(l => l.id)))
    const [exportTriggers, setExportTriggers] = useState<Set<string>>(new Set(props.config.triggers.map(t => t.id)))

    const [importFile, setImportFile] = useState<IExportFile | null>(null)
    const [importProviders, setImportProviders] = useState<Set<string>>(new Set())
    const [importLlms, setImportLlms] = useState<Set<string>>(new Set())
    const [importTriggers, setImportTriggers] = useState<Set<string>>(new Set())
    const [importError, setImportError] = useState('')

    const handleDownload = () => {
        const data: IExportFile = {
            version: '1',
            providers: props.providers.filter(p => exportProviders.has(p.name)),
            llms: props.config.llms.filter(l => exportLlms.has(l.id)),
            triggers: props.config.triggers.filter(t => exportTriggers.has(t.id))
        }
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `pinocchio-config-${new Date().toISOString().slice(0, 10)}.json`
        a.click()
        URL.revokeObjectURL(url)
    }

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        const reader = new FileReader()
        reader.onload = (ev) => {
            try {
                const parsed = JSON.parse(ev.target?.result as string) as IExportFile
                if (parsed.version !== '1') throw new Error('Unsupported version')
                setImportFile(parsed)
                setImportProviders(new Set((parsed.providers ?? []).map(p => p.name)))
                setImportLlms(new Set((parsed.llms ?? []).map(l => l.id)))
                setImportTriggers(new Set((parsed.triggers ?? []).map(t => t.id)))
                setImportError('')
            }
            catch {
                setImportError('Invalid or unsupported file')
                setImportFile(null)
            }
        }
        reader.readAsText(file)
        e.target.value = ''
    }

    const handleImport = () => {
        if (!importFile) return

        const mergeById = <T extends { id?: string; name?: string }>(current: T[], incoming: T[], key: keyof T) => {
            const result = [...current]
            for (const item of incoming) {
                const idx = result.findIndex(x => x[key] === item[key])
                if (idx >= 0) result[idx] = item
                else result.push(item)
            }
            return result
        }

        const newProviders = mergeById(props.providers, (importFile.providers ?? []).filter(p => importProviders.has(p.name)), 'name')
        const newLlms = mergeById(props.config.llms, (importFile.llms ?? []).filter(l => importLlms.has(l.id)), 'id')
        const newTriggers = mergeById(props.config.triggers, (importFile.triggers ?? []).filter(t => importTriggers.has(t.id)), 'id')

        props.onClose(newProviders, { ...props.config, llms: newLlms, triggers: newTriggers })
    }

    const totalExport = exportProviders.size + exportLlms.size + exportTriggers.size
    const totalImport = importProviders.size + importLlms.size + importTriggers.size

    return (
        <Dialog open={true} PaperProps={{ sx: { width: '60vw', maxWidth: '680px', height: '58vh' } }}>
            <DialogTitle>Import / Export</DialogTitle>
            <DialogContent sx={{ display: 'flex', flexDirection: 'column', p: 0 }}>
                <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}>
                    <Tab label="Export" />
                    <Tab label="Import" />
                </Tabs>

                <Box sx={{ flex: 1, overflowY: 'auto', p: 2 }}>
                    {tab === 0 && <>
                        <CheckSection label="Providers" items={props.providers.map(p => p.name)} selected={exportProviders} onChange={setExportProviders} />
                        <Divider sx={{ my: 1 }} />
                        <CheckSection label="LLMs" items={props.config.llms.map(l => l.id)} selected={exportLlms} onChange={setExportLlms} />
                        <Divider sx={{ my: 1 }} />
                        <CheckSection label="Triggers" items={props.config.triggers.map(t => t.id)} selected={exportTriggers} onChange={setExportTriggers} />
                        <Box sx={{ mt: 2 }}>
                            <Button variant="contained" size="small" onClick={handleDownload} disabled={totalExport === 0}>Download JSON</Button>
                        </Box>
                    </>}

                    {tab === 1 && <>
                        <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 2 }}>
                            <input ref={fileInputRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleFileChange} />
                            <Button variant="outlined" size="small" onClick={() => fileInputRef.current?.click()}>Upload JSON file…</Button>
                            {importError && <Typography color="error" variant="body2">{importError}</Typography>}
                        </Stack>

                        {importFile && <>
                            <CheckSection label="Providers" items={(importFile.providers ?? []).map(p => p.name)} selected={importProviders} onChange={setImportProviders} existsLabel={key => props.providers.some(p => p.name === key)} />
                            <Divider sx={{ my: 1 }} />
                            <CheckSection label="LLMs" items={(importFile.llms ?? []).map(l => l.id)} selected={importLlms} onChange={setImportLlms} existsLabel={key => props.config.llms.some(l => l.id === key)} />
                            <Divider sx={{ my: 1 }} />
                            <CheckSection label="Triggers" items={(importFile.triggers ?? []).map(t => t.id)} selected={importTriggers} onChange={setImportTriggers} existsLabel={key => props.config.triggers.some(t => t.id === key)} />
                            <Box sx={{ mt: 2 }}>
                                <Button variant="contained" size="small" onClick={handleImport} disabled={totalImport === 0}>Import selected</Button>
                            </Box>
                        </>}
                    </>}
                </Box>
            </DialogContent>

            <DialogActions>
                <Button onClick={() => props.onClose()}>Close</Button>
            </DialogActions>
        </Dialog>
    )
}

export { PinocchioImportExport }
