import React, { useContext, useEffect, useRef, useState } from 'react'
import { Backdrop, Box, Button, Checkbox, CircularProgress, Dialog, DialogContent, DialogTitle, FormControlLabel, IconButton, List, ListItemButton, Stack, Tab, Tabs, TextField, Tooltip, Typography} from '@mui/material'
import { SessionContext, SessionContextType } from '../model/SessionContext'
import { InputBox } from '../tools/FrontTools'
import { Delete } from '@mui/icons-material'
import { AccessKey } from '@kwirthmagnify/kwirth-common'

interface IContextSelectorProps {
    isElectron: boolean
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

const ContextSelector: React.FC<IContextSelectorProps> = (props:IContextSelectorProps) => {
    const {backendUrl} = useContext(SessionContext) as SessionContextType
    const [selectedTab, setSelectedTab] = useState(0)
    const [localContexts, setLocalContexts] = useState<IContext[]>([])
    const [remoteClusters, setRemoteClusters] = useState<{name:string, url:string, accessString:string}[]>([])
    const [inputBoxTitle, setInputBoxTitle] = useState<any>()
    const [inputBoxMessage, setInputBoxMessage] = useState<any>()
    const [inputBoxResult, setInputBoxResult] = useState<(result:any) => void>()
    const [showActive, setShowActive] = useState(true)
    const [waiting, setWaiting] = useState(false)
    const [filterLocal, setFilterLocal] = useState('')
    const [filterRemote, setFilterRemote] = useState('')
    const intId = useRef<any>()

    useEffect(() => {
        const fetchData = async () => {
            try {
                let resp = await fetch(backendUrl + '/core/electron/kubeconfig')
                let contexts = await resp.json() as IContext[]

                setLocalContexts(contexts)
                update(contexts)

                if (props.isElectron) intId.current = setInterval(update, 5000, contexts)

                let rc = localStorage.getItem('remoteClusters')
                if (rc) setRemoteClusters(JSON.parse(rc))
            }
            catch (err) {
                console.error("Error loading contexts:", err)
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
        const promises = contexts.map(async (context) => {
            try {
                const isAvailable = await (window as any).kwirth.kubeApiAvailable(context.server);
                onUpdate({ ...context, status: isAvailable })
            }
            catch (error) {
                onUpdate({ ...context, status: false })
            }
        })

        await Promise.allSettled(promises)
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

    const addRemoteCluster = () => {
        setInputBoxResult ( () => (name:any) => {
            setInputBoxResult ( () => (url:any) => {
                setInputBoxResult ( () => (accessString:any) => {
                    console.log(name, url, accessString)
                    let newRemotes = [...remoteClusters, { name, url, accessString }]
                    localStorage.setItem('remoteClusters', JSON.stringify(newRemotes))
                    setRemoteClusters(newRemotes)
                })
                setInputBoxMessage('Enter Kwirth access string')
                setInputBoxTitle('Add cluster')
            })
            setInputBoxMessage('Enter Kwirth URL')
            setInputBoxTitle('Add cluster')
        })
        setInputBoxMessage('Enter cluster name')
        setInputBoxTitle('Add cluster')
    }

    const deleteRemoteCluster = (name:string) => {
        let newRemotes = remoteClusters.filter(c => c.name!==name)
        localStorage.setItem('remoteClusters', JSON.stringify(newRemotes))
        setRemoteClusters(newRemotes)
    }

    const selectLocal = async (name:string) => {
        setWaiting(true)
        try {
            let payload = JSON.stringify({ context:name })
            let resp = await fetch(backendUrl+'/core/electron/kubeconfig', { method:'POST', body:payload, headers: {'Content-Type':'application/json'} } )
            if (resp.status === 200) {
                let jresp = await resp.json()
                let sc = 0
                do {
                    await new Promise ( (resolve) => { setTimeout(resolve, 1000)})
                    let resp2 = await fetch(backendUrl+'/config/info')
                    sc = resp2.status
                } while (sc!==200)
                props.onContextSelectorLocal(name, jresp.accessKey as AccessKey)
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
                    <Stack direction={'column'} sx={{height:300, overflowY:'auto' }}>
                        <Stack direction={'row'} sx={{width:'100%'}}>
                            <TextField label={'Filter'} value={filterLocal} onChange={(e) => setFilterLocal(e.target.value)} sx={{width:'100%', ml:2, mr:2}} variant={'standard'}></TextField>
                            <FormControlLabel control={<Checkbox />} checked={showActive} onChange={() => setShowActive(!showActive)} label={'Show\u00a0only\u00a0active'}/>
                        </Stack>
                        <List>
                        {
                            localContexts.filter(c => c.cluster.includes(filterLocal)).filter(c => !showActive || (showActive && c.status)).map(c => 
                                <ListItemButton key={c.cluster} onClick={() => selectLocal(c.cluster)}>
                                    <Tooltip title={c.cluster}>
                                        <Typography>{c.cluster.substring(0,50)+(c.cluster.length>60?'...':'')}</Typography>
                                    </Tooltip>
                                    <Typography flexGrow={1}></Typography>
                                    <Box sx={{width:12, height:12, borderRadius:'50%', bgcolor:c.status!==undefined? (c.status?'success.main':'error.main'):'gray', mr:1}}></Box>
                                </ListItemButton>
                            )
                        }
                        </List>
                    </Stack>
                }
                { selectedTab === 1 &&
                    <>
                    <Stack direction={'column'} sx={{height:250, overflowY:'auto'}}>
                        <TextField label={'Filter'} value={filterRemote} onChange={(e) => setFilterRemote(e.target.value)} sx={{ml:2, mr:2}} variant={'standard'}></TextField>
                        <List>
                        {
                            remoteClusters.filter(c => c.name.includes(filterRemote)).map(c => 
                                <Stack key={c.name} direction={'row'} sx={{wodth:'100%'}}>
                                    <ListItemButton onClick={() => props.onContextSelectorRemote(c.name, c.url, c.accessString)}>
                                        <Typography>{c.name}</Typography>
                                    </ListItemButton>
                                    <IconButton onClick={() => deleteRemoteCluster(c.name)}>
                                        <Delete />
                                    </IconButton>                                    
                                </Stack>
                            )
                        }
                        </List>
                    </Stack>
                    <Button onClick={addRemoteCluster} sx={{ml:1, mt:1}}>Add cluster</Button>
                    </>
                }

            </DialogContent>
        </Dialog>
        <InputBox title={inputBoxTitle} message={inputBoxMessage} onClose={() => setInputBoxTitle(undefined)} onResult={inputBoxResult} width='300px'/>
        {waiting && <Backdrop
            sx={(theme) => ({ color: '#fff', zIndex: theme.zIndex.drawer + 10000 })}
            open={true}
            >
            <CircularProgress color="inherit" />
        </Backdrop>}
    </>)
}

export { ContextSelector }
