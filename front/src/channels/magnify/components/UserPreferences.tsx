import React, { useRef, useState } from 'react'
import { Accordion, AccordionActions, AccordionDetails, AccordionSummary, Box, Button, Checkbox, FormControlLabel, MenuItem, Select, SelectChangeEvent, Stack, TextareaAutosize, TextField, Typography } from '@mui/material'
import { ExpandMore } from '@kwirthmagnify/kwirth-common-front/icons'
import { allKinds, IKind, MagnifyUserPreferences } from './MagnifyUserPreferences'
import { IFileObject } from '@jfvilas/react-file-manager'
import { IChannelObject } from '../../IChannel'
import { About } from '../../../components/About'
import { useKeyboard } from '../../../tools/useKeyboard'
import { EExtensionType } from '@kwirthmagnify/kwirth-common'

interface IUserPreferencesProps {
    channelObject: IChannelObject
    preferences: MagnifyUserPreferences
    files: IFileObject[]
    onDataReload?: () => void
}

export interface ICustomAction {
    type: 'kwirth'|'kube'
    name: string
    onReady: 'nothing'|'shell'|'http'|'https'
    url?: string
    forward?: boolean
    podYaml: string
}

const UserPreferences: React.FC<IUserPreferencesProps> = (props:IUserPreferencesProps) => {
    const [palette, setPalette] = useState(props.preferences.palette || 'light')
    const [logLines, setLogLines] = useState(props.preferences.logLines)
    const [tracing, setTracing ] = useState(props.preferences.tracing)
    const [sourceList, setSourceList] = useState<IKind[]>(props.preferences.dataConfig?.source)
    const [syncList, setSyncList] = useState<IKind[]>(props.preferences.dataConfig?.sync)
    const [dataHelm, setDataHelm] = useState<boolean>(props.preferences.dataHelm)
    const [dataManagedFields, setDataManagedFields] = useState<boolean>(props.preferences.dataManagedFields)
    const [customActions, setCustomActions] = useState<ICustomAction[]>(props.preferences.customActions || [])
    
    const [displayChanged, setDisplayChanged] = useState(false)
    const [dataChanged, setDataChanged] = useState(false)
    const [debugChanged, setDebugChanged] = useState(false)
    const [externalChanged, setExternalChanged] = useState(false)
    const filterRef = useRef<HTMLInputElement>(null)

    const [showAbout, setShowAbout] = useState(false)
    const podExplanation = `Paste here a complete YAML of a pod that will be launched when a user selects this action in Magnify 'Overview' top menu ('Kwirth Works' action)`

    useKeyboard()
    
    const save = () => {
        if (!props.channelObject.writeChannelUserPreferences) return
        props.preferences.palette = palette
        props.preferences.dataHelm = dataHelm
        props.preferences.dataManagedFields = dataManagedFields
        props.preferences.dataConfig.source = sourceList
        props.preferences.dataConfig.sync = syncList
        props.preferences.logLines = logLines
        props.preferences.tracing = tracing
        props.preferences.customActions = customActions
        props.channelObject.writeChannelUserPreferences(props.channelObject.channelId, props.preferences)
        setDisplayChanged(false)
        setDataChanged(false)
        setDebugChanged(false)
        setExternalChanged(false)
    }
    
    const reload = () => {
        if (props.onDataReload) props.onDataReload()
    }

    const showFiles = () => {
        console.log(props.files.filter(f => f.name.includes(filterRef.current!.value) || f.path.includes(filterRef.current!.value)))
    }

    const changeKind = (type:string, kind:IKind) => {
        let list=sourceList
        if (type==='sync') list=syncList

        if (list.some(k => k.name===kind.name))
            list=list.filter(k => k.name!==kind.name)
        else
            list.push(kind)
        if (type==='source') setSourceList([...list])
        if (type==='sync') setSyncList([...list])
        setDataChanged(true)
    }

    const onChangePalette = (event: SelectChangeEvent) => {
        setPalette(event.target.value)
        props.channelObject.setPalette?.(event.target.value)
        setDisplayChanged(true)
    }

    const removeCustomAction = (index:number) => {
        customActions.splice(index,1)
        setCustomActions([...customActions])
    }

    return <Box width='100%' height='100%' display='flex' flexDirection='column' p={2} sx={{ bgcolor: 'background.default', borderBottomRightRadius: '8px', overflowY: 'auto' }}>
        <Accordion defaultExpanded>
            <AccordionSummary expandIcon={<ExpandMore />}>
                <Typography component='span'><b>Display</b></Typography>
            </AccordionSummary>
            <AccordionDetails>
                <Stack direction='column' spacing={0.5}>
                    <Stack direction='row' alignItems='center'>
                        <Typography variant='body2' sx={{ flexGrow: 1 }}>Palette mode</Typography>
                        <Select value={palette} onChange={onChangePalette} variant='standard' sx={{ width: 100 }}>
                            <MenuItem value='light'>Light</MenuItem>
                            <MenuItem value='dark'>Dark</MenuItem>
                        </Select>
                    </Stack>
                    <Stack direction='row' alignItems='center'>
                        <Typography variant='body2' sx={{ flexGrow: 1 }}>About Kwirth</Typography>
                        <Button size='small' onClick={() => setShowAbout(true)}>About</Button>
                    </Stack>
                </Stack>
            </AccordionDetails>
            <AccordionActions>
                <Button size='small' onClick={save} disabled={!displayChanged}>Save</Button>
            </AccordionActions>
        </Accordion>

        <Accordion>
            <AccordionSummary expandIcon={<ExpandMore />}>
                <Typography component='span'><b>Custom actions</b></Typography>
            </AccordionSummary>
            <AccordionDetails>
                {customActions.map((ca, index) => (
                    <Stack key={'action' + index} direction='column' spacing={1} sx={{ mb: 2 }}>
                        <Stack direction='row' spacing={1} alignItems='center'>
                            <Select value={ca.type} onChange={(e) => { ca.type = e.target.value; setCustomActions([...customActions]) }} variant='standard' sx={{ width: 100 }}>
                                <MenuItem value='kwirth' disabled>Kwirth</MenuItem>
                                <MenuItem value='kube'>Kube</MenuItem>
                            </Select>
                            <TextField value={ca.name} onChange={(e) => { ca.name = e.target.value; setCustomActions([...customActions]) }} variant='standard' placeholder='Name' sx={{ minWidth: '15%' }} />
                            <Select value={ca.onReady} onChange={(e) => { ca.onReady = e.target.value; setCustomActions([...customActions]) }} variant='standard' sx={{ minWidth: '10%' }}>
                                <MenuItem value='nothing'>Nothing</MenuItem>
                                <MenuItem value='shell'>Shell</MenuItem>
                                <MenuItem value='http' disabled>HTTP</MenuItem>
                                <MenuItem value='https' disabled>HTTPS</MenuItem>
                            </Select>
                            <FormControlLabel control={<Checkbox size='small' onChange={(e) => { ca.forward = e.target.checked; setCustomActions([...customActions]) }} checked={ca.forward} disabled={'nothing shell'.includes(ca.onReady)} />} label='Forward' />
                            <TextField value={ca.url} onChange={(e) => { ca.url = e.target.value; setCustomActions([...customActions]) }} disabled={'nothing shell'.includes(ca.onReady) || ca.forward} fullWidth variant='standard' placeholder='URL' />
                            <Box sx={{ flexGrow: 1 }} />
                            <Button size='small' onClick={() => removeCustomAction(index)}>Remove</Button>
                        </Stack>
                        <TextareaAutosize key={'yaml' + index} value={ca.podYaml} onChange={(e) => { ca.podYaml = e.target.value; setCustomActions([...customActions]) }} style={{ height: 100, fontFamily: 'monospace', fontSize: 12, padding: 8, boxSizing: 'border-box', width: '100%' }} placeholder={podExplanation} />
                    </Stack>
                ))}
                <Stack direction='row' justifyContent='flex-end'>
                    <Button size='small' onClick={() => setCustomActions([...customActions, { type: 'kube', name: '', podYaml: '', onReady: 'nothing' }])}>Add</Button>
                </Stack>
            </AccordionDetails>
            <AccordionActions>
                <Button size='small' onClick={save}>Save</Button>
            </AccordionActions>
        </Accordion>

        <Accordion>
            <AccordionSummary expandIcon={<ExpandMore />}>
                <Typography component='span'><b>External content</b></Typography>
            </AccordionSummary>
            <AccordionDetails>
                <TextField value={logLines} onChange={(e) => { setLogLines(+e.target.value); setExternalChanged(true) }} variant='standard' label='Max messages' type='number' fullWidth />
            </AccordionDetails>
            <AccordionActions>
                <Button size='small' onClick={save} disabled={!externalChanged}>Save</Button>
            </AccordionActions>
        </Accordion>

        <Accordion>
            <AccordionSummary expandIcon={<ExpandMore />}>
                <Typography component='span'><b>Data management</b></Typography>
            </AccordionSummary>
            <AccordionDetails>
                <Stack direction='row' spacing={2}>
                    <Stack direction='column' flex={1}>
                        <Typography variant='body2' fontWeight='bold'>Storage</Typography>
                        <FormControlLabel control={<Checkbox size='small' onChange={(e) => { setDataHelm(e.target.checked); setDataChanged(true) }} checked={dataHelm} />} label={<Typography variant='body2'>Keep Helm data</Typography>} />
                        <FormControlLabel control={<Checkbox size='small' onChange={(e) => { setDataManagedFields(e.target.checked); setDataChanged(true) }} checked={dataManagedFields} />} label={<Typography variant='body2'>Keep managed fields</Typography>} />
                    </Stack>
                    <Stack direction='column' flex={1}>
                        <Typography variant='body2' fontWeight='bold'>Source</Typography>
                        {allKinds.map(kind => (
                            <FormControlLabel key={kind.name} control={<Checkbox size='small' onChange={() => changeKind('source', kind)} checked={sourceList.some(s => s.name === kind.name)} />} label={<Typography variant='body2'>{kind.name}</Typography>} />
                        ))}
                    </Stack>
                    <Stack direction='column' flex={1}>
                        <Typography variant='body2' fontWeight='bold'>Sync</Typography>
                        {allKinds.map(kind => (
                            <FormControlLabel key={kind.name} control={<Checkbox size='small' onChange={() => changeKind('sync', kind)} checked={syncList.some(s => s.name === kind.name)} />} label={<Typography variant='body2'>{kind.name}</Typography>} />
                        ))}
                    </Stack>
                </Stack>
            </AccordionDetails>
            <AccordionActions>
                <Button size='small' onClick={save} disabled={!dataChanged}>Save</Button>
            </AccordionActions>
        </Accordion>

        <Accordion>
            <AccordionSummary expandIcon={<ExpandMore />}>
                <Typography component='span'><b>Debug</b></Typography>
            </AccordionSummary>
            <AccordionDetails>
                <Stack direction='column' spacing={0.5}>
                    <Stack direction='row' alignItems='center' spacing={1}>
                        <Typography variant='body2' sx={{ flexGrow: 1 }}>Files collection ({props.files.length} objects, {(JSON.stringify(props.files).length / 1024 / 1024).toFixed(2)} MB)</Typography>
                        <TextField inputRef={filterRef} label='Filter' variant='standard' size='small' />
                        <Button size='small' onClick={reload}>Reload</Button>
                        <Button size='small' onClick={showFiles}>Show</Button>
                    </Stack>
                    <Stack direction='row' alignItems='center'>
                        <Typography variant='body2' sx={{ flexGrow: 1 }}>Metrics names</Typography>
                        <Button size='small' onClick={() => console.log(props.channelObject.metricsList?.keys())}>Show</Button>
                    </Stack>
                    <Stack direction='row' alignItems='center'>
                        <Typography variant='body2' sx={{ flexGrow: 1 }}>Channel object</Typography>
                        <Button size='small' onClick={() => console.log(props.channelObject)}>Show</Button>
                    </Stack>
                    <Stack direction='row' alignItems='center'>
                        <Typography variant='body2' sx={{ flexGrow: 1 }}>Message tracing (log received messages to console)</Typography>
                        <Checkbox size='small' checked={tracing} onChange={() => { setTracing(!tracing); setDebugChanged(true) }} />
                    </Stack>
                </Stack>
            </AccordionDetails>
            <AccordionActions>
                <Button size='small' onClick={save} disabled={!debugChanged}>Save</Button>
            </AccordionActions>
        </Accordion>

        <Accordion>
            <AccordionSummary expandIcon={<ExpandMore />}>
                <Typography component='span'><b>Extensions</b></Typography>
            </AccordionSummary>
            <AccordionDetails>
                <Stack direction='row' spacing={1} flexWrap='wrap' useFlexGap>
                    {([
                        { type: EExtensionType.PLUGIN,   label: 'Plugins',   desc: 'Install, update and remove channel plugins that extend Kwirth with new visualization and analysis capabilities.' },
                        { type: EExtensionType.PROVIDER, label: 'Providers', desc: 'Configure data source providers that feed events and metrics into your channels from external systems.' },
                        { type: EExtensionType.SENDER,   label: 'Senders',   desc: 'Manage notification senders to forward alerts and reports to Slack, Teams, email and other destinations.' },
                        { type: EExtensionType.THEME,    label: 'Themes',    desc: 'Install and activate visual themes to customize the look and feel of Kwirth.' },
                        { type: EExtensionType.HOMEPAGE, label: 'Homepages', desc: 'Install and manage homepage extensions that provide custom cluster overview dashboards.' },
                    ]).map(({ type, label, desc }) => (
                        <Box key={type} sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.5, flex: 1, minWidth: 120, display: 'flex', flexDirection: 'column', gap: 1 }}>
                            <Typography variant='body2' fontWeight='bold'>{label}</Typography>
                            <Typography variant='caption' color='text.secondary' sx={{ flexGrow: 1 }}>{desc}</Typography>
                            <Button size='small' onClick={() => props.channelObject.openManager?.(type)}>Manage</Button>
                        </Box>
                    ))}
                </Stack>
            </AccordionDetails>
        </Accordion>

        { showAbout && <About onClose={() => setShowAbout(false)}/>}
    </Box>
}

export { UserPreferences }