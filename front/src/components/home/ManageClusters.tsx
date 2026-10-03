import React, { useContext, useState } from 'react'
import { useKeyboard } from '../../tools/useKeyboard'
import { Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider, List, ListItem, ListItemButton, Stack, TextField, Typography } from '@mui/material'
import CheckCircleOutline from '@mui/icons-material/CheckCircleOutline'
import ErrorOutline from '@mui/icons-material/ErrorOutline'
import { SessionContext, SessionContextType } from '../../model/SessionContext'
import { DialogTitleHelp, docsUrl } from '@kwirthmagnify/kwirth-common-front'
import { Cluster } from '../../model/Cluster'
import { MsgBoxButtons, MsgBoxWaitCancel, MsgBoxYesNo } from '../../tools/MsgBox'
import { addGetAuthorization } from '../../tools/AuthorizationManagement'
import { ENotifyLevel, readClusterInfo } from '../../tools/Global'
import { KwirthData } from '@kwirthmagnify/kwirth-common'

interface IManageClustersProps {
  onClose:(clusters:Cluster[]) => void
  notify: (channel:string|undefined, level:ENotifyLevel, msg:string) => void
  clusters?: Cluster[]
}

/*
    What the TEST button leaves behind when it finishes: either the cluster data and its channels, or
    an error message. It is drawn by a Dialog of our own instead of MsgBoxOk/MsgBoxOkError so the layout
    — icon on the first line, a clean label/value list, MUI Chips for channel capabilities — can use the
    theme instead of hardcoded HTML colours.
*/
interface ITestResult {
    success: boolean
    data?: KwirthData
    clusterId?: string
    error?: string
}

const ManageClusters: React.FC<IManageClustersProps> = (props:IManageClustersProps) => {
    const { backendUrl } = useContext(SessionContext) as SessionContextType
    const [clusters, setClusters] = useState<Cluster[]>(props.clusters ? [...props.clusters] : [])
    const [selectedCluster, setSelectedCluster] = useState<Cluster|null>()
    const [name, setName] = useState<string>('')
    const [url, setUrl] = useState<string>('')
    const [accessKey, setAccessKey] = useState<string>('')
    const [msgBox, setMsgBox] = useState(<></>)
    const [refresh, setRefresh] = useState(0)
    const [testResult, setTestResult] = useState<ITestResult | null>(null)

    useKeyboard(() => props.onClose(clusters))

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
            const updated = [...clusters.filter(c => c !== selectedCluster), selectedCluster]
            await readClusterInfo(selectedCluster, props.notify)
            setClusters(updated)
            setRefresh(Math.random())
        }
        else {
            var c = new Cluster()
            c.accessString = accessKey
            c.name = name
            c.url = url
            c.kwirthData = undefined
            const updated = [...clusters, c]
            await readClusterInfo(c, props.notify)
            setClusters(updated)
            setRefresh(Math.random())
        }
        setName('')
        setUrl('')
        setAccessKey('')
    }

    const onClickTest = async () => {
        try {
            setMsgBox(MsgBoxWaitCancel('Test cluster', 'Connecting to cluster and verifying Kwirth availability...', setMsgBox))

            const [infoResponse, clusterResponse] = await Promise.all([
                fetch(`${url}/config/info`, addGetAuthorization(accessKey)),
                fetch(`${url}/config/cluster`, addGetAuthorization(accessKey))
            ])

            if (infoResponse.status !== 200 || clusterResponse.status !== 200) {
                const status = infoResponse.status !== 200 ? infoResponse.status : clusterResponse.status
                setMsgBox(<></>)
                setTestResult({ success: false, error: `Connection failed (HTTP ${status}). Check the URL and API key.` })
                return
            }

            const data = await infoResponse.json() as KwirthData
            const clusterId = (await clusterResponse.json()).id

            setMsgBox(<></>)
            setTestResult({ success: true, data, clusterId })
        }
        catch (error) {
            setMsgBox(<></>)
            setTestResult({ success: false, error: `Could not test connection: ${error}` })
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
            setClusters(clusters.filter(c => c !== selectedCluster))
            setName('')
            setUrl('')
            setAccessKey('')
            setSelectedCluster(undefined)
        }
    }

    /*
        The channel capabilities that earn a chip: the order is fixed so the same channel always shows
        them in the same order, regardless of how the flags arrive.
    */
    const channelCaps = (ch: KwirthData['channels'][number]): string[] => [
        ch.routable ? 'route' : null,
        ch.pauseable ? 'pause' : null,
        ch.modifiable ? 'modify' : null,
        ch.reconnectable ? 'reconnect' : null,
        ch.metrics ? 'metrics' : null
    ].filter(Boolean) as string[]

    return (<>
        <Dialog open={true} fullWidth maxWidth='md' disableEnforceFocus>
            <DialogTitleHelp section='guide/admin/06-cluster-management?id=add-a-remote-cluster' docsUrl={docsUrl(backendUrl, 'core', 'kwirth')}>Manage clusters</DialogTitleHelp>
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
                            <TextField value={name} onChange={(e) => setName(e.target.value)} disabled={selectedCluster?.home} variant='standard' label='Name'></TextField>
                            <TextField value={selectedCluster?.id || ''} disabled variant='standard' label='Id'></TextField>
                            <TextField value={url} onChange={(e) => setUrl(e.target.value)} disabled={selectedCluster?.home} variant='standard' label='URL'></TextField>
                            <TextField value={accessKey} onChange={(e) => setAccessKey(e.target.value)} disabled={selectedCluster?.home} variant='standard' label='API Key'></TextField>
                        </Stack>
                    }
                </Stack>
            </DialogContent>
            <DialogActions>
              <Stack direction='row' spacing={1}>
                <Button variant='outlined' onClick={onClickNew}>NEW</Button>
                <Button variant='outlined' onClick={onClickSave} disabled={selectedCluster?.home || name==='' || url==='' || accessKey==='' }>SAVE</Button>
                <Button variant='outlined' onClick={onClickTest} disabled={!url || !url.toLocaleLowerCase().startsWith('http') || !accessKey}>TEST</Button>
                <Button variant='outlined' onClick={onClickDelete} disabled={selectedCluster===undefined || selectedCluster?.home}>DELETE</Button>
              </Stack>
              <Typography sx={{flexGrow:1}}></Typography>
              <Button variant='outlined' onClick={() => props.onClose(clusters)}>CLOSE</Button>
            </DialogActions>
        </Dialog>

        {/*
            Test result dialog. The icon sits on the first line, next to the success/error message;
            the cluster data is a clean label/value list; the channels use MUI Chips that follow the
            theme. Nothing here is hardcoded HTML — every colour comes from the palette.
        */}
        {testResult && (
            <Dialog open={true} onClose={() => setTestResult(null)} fullWidth maxWidth='sm'>
                <DialogTitle>Test cluster</DialogTitle>
                <DialogContent>
                    {testResult.success ? (
                        <Stack spacing={2}>
                            {/* Success header: icon and message on the same line */}
                            <Stack direction='row' alignItems='center' spacing={1}>
                                <CheckCircleOutline color='success' />
                                <Typography color='success.main' fontWeight={600}>
                                    Connection and API key successfully tested
                                </Typography>
                            </Stack>

                            <Divider />

                            {/* Cluster data as label/value rows */}
                            <Box>
                                <Stack direction='row' spacing={2}>
                                    <Typography sx={{ width: 140, color: 'text.secondary', fontWeight: 600 }}>Name</Typography>
                                    <Typography>{testResult.data!.clusterName}</Typography>
                                </Stack>
                                <Stack direction='row' spacing={2}>
                                    <Typography sx={{ width: 140, color: 'text.secondary', fontWeight: 600 }}>Id</Typography>
                                    <Typography>{testResult.clusterId}</Typography>
                                </Stack>
                                <Stack direction='row' spacing={2}>
                                    <Typography sx={{ width: 140, color: 'text.secondary', fontWeight: 600 }}>Workload</Typography>
                                    <Typography>{testResult.data!.namespace}/{testResult.data!.deployment}</Typography>
                                </Stack>
                                <Stack direction='row' spacing={2}>
                                    <Typography sx={{ width: 140, color: 'text.secondary', fontWeight: 600 }}>inCluster</Typography>
                                    <Typography>{String(testResult.data!.inCluster)}</Typography>
                                </Stack>
                                <Stack direction='row' spacing={2}>
                                    <Typography sx={{ width: 140, color: 'text.secondary', fontWeight: 600 }}>Version</Typography>
                                    <Typography>{testResult.data!.version}</Typography>
                                </Stack>
                                <Stack direction='row' spacing={2}>
                                    <Typography sx={{ width: 140, color: 'text.secondary', fontWeight: 600 }}>Metrics interval</Typography>
                                    <Typography>{testResult.data!.metricsInterval}</Typography>
                                </Stack>
                            </Box>

                            <Divider />

                            {/* Supported channels */}
                            <Typography fontWeight={600}>Supported channels</Typography>
                            <Stack spacing={1}>
                                {testResult.data!.channels.map(ch => {
                                    const caps = channelCaps(ch)
                                    return (
                                        <Stack direction='row' alignItems='center' spacing={1} key={ch.id}>
                                            <Typography fontWeight={600}>{ch.id}</Typography>
                                            {caps.map(cap => (
                                                <Chip key={cap} label={cap} size='small' variant='outlined' />
                                            ))}
                                            <Typography variant='caption' color='text.secondary'>
                                                [{ch.sources.join(', ')}]
                                            </Typography>
                                        </Stack>
                                    )
                                })}
                            </Stack>
                        </Stack>
                    ) : (
                        /* Error: icon and message on the same line */
                        <Stack direction='row' alignItems='center' spacing={1}>
                            <ErrorOutline color='error' />
                            <Typography color='error.main'>{testResult.error}</Typography>
                        </Stack>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button variant='outlined' onClick={() => setTestResult(null)}>ok</Button>
                </DialogActions>
            </Dialog>
        )}

        {msgBox}
    </>)
}

export { ManageClusters }
