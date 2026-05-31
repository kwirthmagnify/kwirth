import React, { useContext, useEffect, useRef, useState } from 'react'
import { Backdrop, Box, Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, List, ListItemButton, Stack, Tab, Tabs, TextField, Tooltip, Typography} from '@mui/material'
import { SessionContext, SessionContextType } from '../model/SessionContext'
import { Delete, Edit } from '@mui/icons-material'
import { AccessKey } from '@kwirthmagnify/kwirth-common'

interface IContextSelectorProps {
    isDesktop: boolean
    onContextSelectorLocal: (name:string, accessKey:AccessKey) => void,
    onContextSelectorRemote: (name:string, url:string, accessString:string) => void
}

interface IContext {
    cluster: string
    name: string
    user: string
    namespace: string
    server: string
    status?: boolean
}

interface IClusterDialogData {
    name: string
    url: string
    accessString: string
}

const ContextSelector: React.FC<IContextSelectorProps> = (props:IContextSelectorProps) => {
    const {backendUrl} = useContext(SessionContext) as SessionContextType
    const [selectedTab, setSelectedTab] = useState(0)
    const [localContexts, setLocalContexts] = useState<IContext[]>([])
    const [remoteClusters, setRemoteClusters] = useState<{name:string, url:string, accessString:string}[]>([])
    const [showActive, setShowActive] = useState(true)
    const [waiting, setWaiting] = useState(false)
    const [loading, setLoading] = useState(true)
    const [filterLocal, setFilterLocal] = useState('')
    const [filterRemote, setFilterRemote] = useState('')
    const [clusterDialogOpen, setClusterDialogOpen] = useState(false)
    const [clusterDialogData, setClusterDialogData] = useState<IClusterDialogData>({ name: '', url: '', accessString: '' })
    const [clusterDialogEditIndex, setClusterDialogEditIndex] = useState<number | null>(null)
    const intId = useRef<any>()

    useEffect(() => {
        const fetchData = async () => {
            try {
                let resp = await fetch(backendUrl + '/core/desktop/kubeconfig')
                let contexts = await resp.json() as IContext[]

                setLocalContexts(contexts)
                update(contexts)

                if (props.isDesktop) intId.current = setInterval(update, 5000, contexts)

                let rc: {name:string, url:string, accessString:string}[] | null = null
                if (props.isDesktop) rc = await (window as any).kwirth.storeGet('remoteClusters')
                else { const raw = localStorage.getItem('remoteClusters'); if (raw) rc = JSON.parse(raw) }
                if (rc) setRemoteClusters(rc)
            }
            catch (err) {
                console.error("Error loading contexts:", err)
            }
            finally {
                setLoading(false)
            }
        }

        fetchData()

        return () => {
            if (intId.current) {
                clearInterval(intId.current)
                intId.current = null
            }
        };
    }, [])

    const updateContextsStatus = async (contexts: IContext[], onUpdate: (updatedCtx: IContext) => void) => {
        try {
            const urls = contexts.map(c => c.server)
            const resp = await fetch(backendUrl + '/core/desktop/kube-available', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ urls })
            })
            const results: Record<string, boolean> = resp.ok ? await resp.json() : {}
            contexts.forEach(context => onUpdate({ ...context, status: results[context.server] ?? false }))
        }
        catch {
            contexts.forEach(context => onUpdate({ ...context, status: false }))
        }
    }

    const update = (contexts:IContext[]) =>  {
        updateContextsStatus(contexts, (updatedCtx: IContext) => {
            setLocalContexts(prevContexts => {
                return prevContexts.map(c => {
                    if (c.name === updatedCtx.name && c.status !== updatedCtx.status)
                        return { ...c, status: updatedCtx.status }
                    else
                        return c
                })
            })
        })
    }

    const saveRemoteClusters = async (clusters: {name:string, url:string, accessString:string}[]) => {
        if (props.isDesktop) await (window as any).kwirth.storeSet('remoteClusters', clusters)
        else localStorage.setItem('remoteClusters', JSON.stringify(clusters))
    }

    const openAddClusterDialog = () => {
        setClusterDialogData({ name: '', url: '', accessString: '' })
        setClusterDialogEditIndex(null)
        setClusterDialogOpen(true)
    }

    const openEditClusterDialog = (index: number) => {
        const c = remoteClusters[index]
        setClusterDialogData({ name: c.name, url: c.url, accessString: c.accessString })
        setClusterDialogEditIndex(index)
        setClusterDialogOpen(true)
    }

    const saveClusterDialog = async () => {
        const { name, url, accessString } = clusterDialogData
        let newRemotes
        if (clusterDialogEditIndex === null)
            newRemotes = [...remoteClusters, { name, url, accessString }]
        else
            newRemotes = remoteClusters.map((c, i) => i === clusterDialogEditIndex ? { name, url, accessString } : c)
        await saveRemoteClusters(newRemotes)
        setRemoteClusters(newRemotes)
        setClusterDialogOpen(false)
    }

    const deleteRemoteCluster = (name:string) => {
        let newRemotes = remoteClusters.filter(c => c.name!==name)
        saveRemoteClusters(newRemotes)
        setRemoteClusters(newRemotes)
    }

    const selectLocal = async (name:string) => {
        setWaiting(true)
        try {
            let payload = JSON.stringify({ context:name })
            let resp = await fetch(backendUrl+'/core/desktop/kubeconfig', { method:'POST', body:payload, headers: {'Content-Type':'application/json'} } )
            if (resp.status === 200) {
                let jresp = await resp.json()
                let sc = 0
                do {
                    await new Promise ( (resolve) => { setTimeout(resolve, 1000)})
                    let resp2 = await fetch(backendUrl+'/config/info')
                    sc = resp2.status
                } while (sc!==200)
                props.onContextSelectorLocal(name, jresp.accessKey as AccessKey)
                return
            }
            else {
                console.log('ERROR obtaining config info')
            }
        }
        catch (err) {
            console.log(err)
        }
        setWaiting(false)
    }

    return (<>
        <Dialog open={true} disableRestoreFocus={true}>
            <DialogTitle>Select cluster</DialogTitle>
            <DialogContent sx={{height:350, width:550}}>
                <Tabs value={selectedTab} onChange={(_event, index) => setSelectedTab(index)} centered>
                    <Tab key='local' value={0} label='Local (Kubeconfig)'/>
                    <Tab key='remote' value={1} label='remote (Kwirth)'/>
                </Tabs>

                { selectedTab === 0 &&
                    <Stack direction={'column'} sx={{height:300}}>
                        <Stack direction={'row'} sx={{width:'100%'}}>
                            <TextField label={'Filter'} value={filterLocal} onChange={(e) => setFilterLocal(e.target.value)} sx={{width:'100%', ml:2, mr:2}} variant={'standard'}></TextField>
                            <FormControlLabel control={<Checkbox />} checked={showActive} onChange={() => setShowActive(!showActive)} label={'Show only active'}/>
                        </Stack>
                        <Stack direction={'column'} sx={{height:300, overflowY:'auto' }}>
                            { loading
                                ? <Typography sx={{ m: 2, color: 'text.secondary' }}>Loading...</Typography>
                                : (() => {
                                    const filtered = localContexts.filter(c => c.cluster.includes(filterLocal)).filter(c => !showActive || c.status)
                                    return filtered.length === 0
                                        ? <Typography sx={{ m: 2, color: 'text.secondary' }}>No active contexts found.</Typography>
                                        : <List>{ filtered.map(c =>
                                            <ListItemButton key={c.cluster} onClick={() => selectLocal(c.cluster)}>
                                                <Tooltip title={c.cluster}>
                                                    <Typography>{c.cluster.substring(0,50)+(c.cluster.length>60?'...':'')}</Typography>
                                                </Tooltip>
                                                <Typography flexGrow={1}></Typography>
                                                <Box sx={{width:12, height:12, borderRadius:'50%', bgcolor:c.status!==undefined? (c.status?'success.main':'error.main'):'gray', mr:1}}></Box>
                                            </ListItemButton>
                                        )}</List>
                                })()
                            }
                        </Stack>
                    </Stack>
                }
                { selectedTab === 1 &&
                    <>
                    <Stack direction={'column'} sx={{height:250, overflowY:'auto'}}>
                        <TextField label={'Filter'} value={filterRemote} onChange={(e) => setFilterRemote(e.target.value)} sx={{ml:2, mr:2}} variant={'standard'}></TextField>
                        <List>
                        {
                            remoteClusters.filter(c => c.name.includes(filterRemote)).map((c, i) =>
                                <Stack key={c.name} direction={'row'} sx={{width:'100%'}}>
                                    <ListItemButton onClick={() => { setWaiting(true); props.onContextSelectorRemote(c.name, c.url, c.accessString) }}>
                                        <Typography>{c.name}</Typography>
                                    </ListItemButton>
                                    <IconButton onClick={() => openEditClusterDialog(i)}>
                                        <Edit />
                                    </IconButton>
                                    <IconButton onClick={() => deleteRemoteCluster(c.name)}>
                                        <Delete />
                                    </IconButton>
                                </Stack>
                            )
                        }
                        </List>
                    </Stack>
                    <Button onClick={openAddClusterDialog} sx={{ml:1, mt:1}}>Add cluster</Button>
                    </>
                }

            </DialogContent>
        </Dialog>

        <Dialog open={clusterDialogOpen} disableRestoreFocus>
            <DialogTitle>{clusterDialogEditIndex === null ? 'Add cluster' : 'Edit cluster'}</DialogTitle>
            <DialogContent sx={{width: 420, height: 210}}>
                <Stack direction='column' spacing={2} sx={{mt: 1}}>
                    <TextField label='Name' value={clusterDialogData.name} onChange={e => setClusterDialogData(d => ({...d, name: e.target.value}))} fullWidth size='small'/>
                    <TextField label='Kwirth URL' value={clusterDialogData.url} onChange={e => setClusterDialogData(d => ({...d, url: e.target.value}))} fullWidth size='small'/>
                    <TextField label='Access string' value={clusterDialogData.accessString} onChange={e => setClusterDialogData(d => ({...d, accessString: e.target.value}))} fullWidth size='small'/>
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={saveClusterDialog} disabled={!clusterDialogData.name || !clusterDialogData.url}>Save</Button>
                <Button onClick={() => setClusterDialogOpen(false)}>Cancel</Button>
            </DialogActions>
        </Dialog>

        {waiting && <Backdrop
            sx={(theme) => ({ color: '#fff', zIndex: theme.zIndex.drawer + 10000 })}
            open={true}
            >
            <CircularProgress color="inherit" />
        </Backdrop>}
    </>)
}

export { ContextSelector }
