import React, { useState } from 'react'
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, List, ListItem, ListItemButton, Stack, TextField, Typography} from '@mui/material'
import { Cluster } from '../model/Cluster'
import { MsgBoxButtons, MsgBoxOk, MsgBoxWaitCancel, MsgBoxYesNo } from '../tools/MsgBox'
import { addGetAuthorization } from '../tools/AuthorizationManagement'
import { ENotifyLevel, readClusterInfo } from '../tools/Global'
import { KwirthData } from '@kwirthmagnify/kwirth-common'

interface IManageClustersProps {
  onClose:(clusters:Cluster[]) => void
  notify: (channel:string|undefined, level:ENotifyLevel, msg:string) => void
  clusters?: Cluster[]
}

const ManageClusters: React.FC<IManageClustersProps> = (props:IManageClustersProps) => {
    const [clusters, setClusters] = useState<Cluster[]>(props.clusters || [])
    const [selectedCluster, setSelectedCluster] = useState<Cluster|null>()
    const [name, setName] = useState<string>('')
    const [url, setUrl] = useState<string>('')
    const [accessKey, setAccessKey] = useState<string>('')
    const [msgBox, setMsgBox] =useState(<></>)
    const [refresh, setRefresh] = useState(0)

    const onClusterSelected = (cluster: Cluster) => {
        setSelectedCluster(cluster)
        setName(cluster.name)
        setUrl(cluster.url)
        setAccessKey(cluster.accessString)
    }

    const onClickSave = async () => {
        if (selectedCluster) {
            selectedCluster.accessString = accessKey
            selectedCluster.name = name
            selectedCluster.url = url
            selectedCluster.kwirthData = undefined
            clusters.splice(clusters.indexOf(selectedCluster),1)
            clusters.push(selectedCluster)
            await readClusterInfo(selectedCluster, props.notify)
            setRefresh(Math.random())
        }
        else {
            var c = new Cluster()
            c.accessString = accessKey
            c.name = name
            c.url = url
            c.kwirthData = undefined
            clusters.push(c)
            await readClusterInfo(c, props.notify)
            setRefresh(Math.random())
        }
        setName('')
        setUrl('')
        setAccessKey('')
        setClusters(clusters)
    }

    const onClickTest= async () => {
        try {
            let kwirthOk = false
            setMsgBox (MsgBoxWaitCancel('Test cluster','In order to add cluster to your cluster list we must first ensure we can connect with it and, if so, test if Kwirth is available and, if so, if evaluate Kwirth version for knowing if it is suitable for being connected to this Kwirth server.', setMsgBox))
            let kwirthResponse = await fetch(`${url}/config/info`, addGetAuthorization(accessKey))
            let clusterId = (await (await (await fetch(`${url}/config/cluster`, addGetAuthorization(accessKey))).json())).id
            let data = await kwirthResponse.json() as KwirthData
            kwirthOk = true
           
            let status = `Name: ${data.clusterName}<br/>`
            status += `Id: ${clusterId}<br/>`
            status += `Namespace: ${data.namespace}<br/>`
            status += `Deployment: ${data.deployment}<br/>`
            status += `inCluster: ${data.inCluster}<br/>`
            status += `Version: ${data.version}<br/>`
            status += `Last version: ${data.lastVersion}<br/>`
            status += `Cluster type: ${data.clusterType}<br/>`
            status += `Metrics interval: ${data.metricsInterval}`

            if (kwirthOk) {
                let suppChannels  = data.channels.map(channel => {
                    let suppSources  = '['+channel.sources.join(',')+']'
                    return `<b>${channel.id}</b>: ${channel.routable?'route ':''}${channel.pauseable?'pause ':''}${channel.modifiable?'modify ':''}${channel.reconnectable?'reconnect ':''}${channel.metrics?'metrics ':''} ${suppSources}`
                }).join('<br/>')
                setMsgBox(MsgBoxOk('Test cluster',`Connection to cluster and API key have been <font color=green>succesfully tested</font>. This is cluster data: <br/><br/>${status}<br/><br/>And these are supported channels: <br/>${suppChannels}`, setMsgBox))
            }
            else {
                if (kwirthOk) {
                    setMsgBox(MsgBoxOk('Test cluster',`Connection to cluster has been <font color=green>succesfully tested</font>:<br/><br/>${status}<br/><br/>But, Kwirth API key you've entered <font color=red>seems not to be correct</font>.`, setMsgBox))
                }
                else {
                    setMsgBox(MsgBoxOk('Test cluster',`Connection to cluster nor API key <font color='red'>couldn't be tested</font>.`, setMsgBox))
                }
            }
        }
        catch (error) {
            setMsgBox(MsgBoxOk('Test cluster',`Couldn't test connection. Error: <br/><br/>${error}`, setMsgBox))
        }
    }

    const onClickNew= () => {
        setSelectedCluster(undefined)
        setName('')
        setUrl('')
        setAccessKey('')
    }

    const onClickDelete= () => {
        setMsgBox(MsgBoxYesNo('Delete Cluster',`Are you sure you want to delete cluster ${selectedCluster?.name}?`, setMsgBox, (a:MsgBoxButtons)=> a===MsgBoxButtons.Yes? onConfirmDelete() : {}))
    }

    const onConfirmDelete= async () => {
        if (selectedCluster) {
            clusters.splice(clusters.indexOf(selectedCluster),1)
            setName('')
            setUrl('')
            setAccessKey('')
            setSelectedCluster(undefined)
        }
    }

    return (<>
        <Dialog open={true} fullWidth maxWidth='md'>
            <DialogTitle>Manage clusters</DialogTitle>
            <DialogContent data-refresh={refresh}>
                <Stack sx={{ display: 'flex', flexDirection: 'row' }}>
                    <List sx={{flexGrow:1, mr:2, width:'50vh' }}>
                        { clusters?.map(c => 
                            <ListItemButton key={c.url} selected={c===selectedCluster} onClick={() => onClusterSelected(c)}>
                                <ListItem>
                                  <Stack direction={'column'} sx={{width:'100%'}}>
                                      <Stack direction={'row'} justifyContent={'space-between'} alignItems={'baseline'}>
                                          <Typography>{c.name}</Typography>
                                          {c.id && <Typography color='text.secondary' fontSize={10}>{c.id}</Typography>}
                                      </Stack>
                                      {c.kwirthData?.clusterType && <Typography color='text.secondary' fontSize={12}>{c.kwirthData?.version}<b> ({c.kwirthData?.clusterType})</b></Typography>}
                                  </Stack>
                                </ListItem>
                            </ListItemButton>
                        )}
                    </List>
                    {
                        <Stack sx={{width:'50vh'}} spacing={1}>
                            <TextField value={name} onChange={(e) => setName(e.target.value)} disabled={selectedCluster?.source} variant='standard' label='Name'></TextField>
                            <TextField value={selectedCluster?.id || ''} disabled variant='standard' label='Id'></TextField>
                            <TextField value={url} onChange={(e) => setUrl(e.target.value)} disabled={selectedCluster?.source} variant='standard' label='URL'></TextField>
                            <TextField value={accessKey} onChange={(e) => setAccessKey(e.target.value)} disabled={selectedCluster?.source} variant='standard' label='API Key'></TextField>
                        </Stack>
                    }
                </Stack>
            </DialogContent>
            <DialogActions>
              <Stack direction='row' spacing={1}>
                <Button onClick={onClickNew}>NEW</Button>
                <Button onClick={onClickSave} disabled={selectedCluster?.source || name==='' || url==='' || accessKey==='' }>SAVE</Button>
                <Button onClick={onClickTest} disabled={!url || !url.toLocaleLowerCase().startsWith('http') || !accessKey}>TEST</Button>
                <Button onClick={onClickDelete} disabled={selectedCluster===undefined || selectedCluster?.source}>DELETE</Button>
              </Stack>
              <Typography sx={{flexGrow:1}}></Typography>
              <Button onClick={() => props.onClose(clusters)}>CLOSE</Button>
            </DialogActions>
        </Dialog>
        {msgBox}
    </>)
}

export { ManageClusters }