import React, { useContext, useState } from 'react'
import { useEscapeToClose } from '../../tools/useKeyboard'
import { Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider, FormControl, FormControlLabel, IconButton, InputAdornment, InputLabel, List, ListItem, ListItemButton, MenuItem, Select, Stack, Switch, TextField, Typography } from '@mui/material'
import { Visibility, VisibilityOff } from '@kwirthmagnify/kwirth-common-front/icons'
import CheckCircleOutline from '@mui/icons-material/CheckCircleOutlined'
import ErrorOutline from '@mui/icons-material/ErrorOutlined'
import { SessionContext, SessionContextType } from '../../model/SessionContext'
import { DialogTitleHelp, docsUrl } from '@kwirthmagnify/kwirth-common-front'
import { Cluster } from '../../model/Cluster'
import { MsgBoxButtons, MsgBoxWaitCancel, MsgBoxYesNo } from '../../tools/MsgBox'
import { addGetAuthorization } from '../../tools/AuthorizationManagement'
import { ENotifyLevel, readClusterInfo } from '../../tools/Global'
import { clusterRouters, resolvedClusterUrl, unresolvedRouteMessage } from '../../tools/ClusterRouting'
import { IClusterRoute, KwirthData } from '@kwirthmagnify/kwirth-common'

// The value of the Route select for an entry reached directly (no route).
const DIRECT_ROUTE = ''

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
    const [routeResolver, setRouteResolver] = useState<string>(DIRECT_ROUTE)
    const [routeUid, setRouteUid] = useState<string>('')
    const [inUse, setInUse] = useState<boolean>(true)
    const [keyRevealed, setKeyRevealed] = useState<boolean>(false)     // the API key is a secret: masked, with the eye
    const [msgBox, setMsgBox] = useState(<></>)
    const [refresh, setRefresh] = useState(0)
    const [testResult, setTestResult] = useState<ITestResult | null>(null)
    const escapeRef = useEscapeToClose(() => props.onClose(clusters))


    const onClusterSelected = (cluster: Cluster) => {
        setSelectedCluster(cluster)
        setName(cluster.name)
        setUrl(cluster.url)
        setAccessKey(cluster.accessString)
        setRouteResolver(cluster.route?.resolver ?? DIRECT_ROUTE)
        setRouteUid(cluster.route?.clusterUid ?? '')
        setInUse(cluster.inUse !== false)
        setKeyRevealed(false)              // another entry: its key starts masked
    }

    // The route being edited: none for a direct entry.
    const editedRoute = (): IClusterRoute | undefined =>
        routeResolver === DIRECT_ROUTE ? undefined : { resolver: routeResolver, clusterUid: routeUid.trim() }

    const clearForm = () => {
        setName('')
        setUrl('')
        setAccessKey('')
        setRouteResolver(DIRECT_ROUTE)
        setRouteUid('')
        setInUse(true)
        setKeyRevealed(false)
    }

    const onClickSave = async () => {
        if (selectedCluster) {
            selectedCluster.accessString = accessKey
            selectedCluster.name = name
            selectedCluster.url = url
            selectedCluster.route = editedRoute()
            selectedCluster.inUse = inUse
            selectedCluster.kwirthData = undefined
            const updated = [...clusters.filter(c => c !== selectedCluster), selectedCluster]
            // one that is not in use is not read: nothing reaches out to a cluster nobody uses
            if (inUse) await readClusterInfo(selectedCluster, props.notify)
            setClusters(updated)
            setRefresh(Math.random())
        }
        else {
            var c = new Cluster()
            c.accessString = accessKey
            c.name = name
            c.url = url
            c.route = editedRoute()
            c.inUse = inUse
            c.kwirthData = undefined
            const updated = [...clusters, c]
            if (inUse) await readClusterInfo(c, props.notify)
            setClusters(updated)
            setRefresh(Math.random())
        }
        clearForm()
    }

    const onClickTest = async () => {
        /*
            TEST goes exactly where the cluster will be used: through its route when it has one. The form is
            tested, not the saved entry, so a scratch Cluster carries what is being edited.
        */
        const probe = new Cluster()
        probe.name = name || 'this cluster'
        probe.url = url
        probe.route = editedRoute()
        const base = resolvedClusterUrl(probe)
        if (!base) {
            setTestResult({ success: false, error: unresolvedRouteMessage(probe) })
            return
        }
        try {
            setMsgBox(MsgBoxWaitCancel('Test cluster', 'Connecting to cluster and verifying Kwirth availability...', setMsgBox))

            const [infoResponse, clusterResponse] = await Promise.all([
                fetch(`${base}/config/info`, addGetAuthorization(accessKey)),
                fetch(`${base}/config/cluster`, addGetAuthorization(accessKey))
            ])

            if (infoResponse.status !== 200 || clusterResponse.status !== 200) {
                const failed = infoResponse.status !== 200 ? infoResponse : clusterResponse
                const status = failed.status
                // what the answer says about why ({ error }): through a route, the refusal may be the ROUTER's
                // (the session lacks its scope, the target is not reachable now), not the cluster's
                let reason = ''
                try {
                    const body: unknown = await failed.json()
                    if (body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string') reason = (body as { error: string }).error
                }
                catch { /* not JSON */ }
                setMsgBox(<></>)
                const error = reason
                    ? `Refused (HTTP ${status}): ${reason}`
                    : status === 401 || status === 403
                        // Reached, but refused: with no reason given, it is the key, not the address.
                        ? `The cluster was reached, but it refused the API key (HTTP ${status}).`
                        : `Connection failed (HTTP ${status}). Check the ${probe.route ? 'route and cluster UID' : 'URL'} and the API key.`
                setTestResult({ success: false, error })
                return
            }

            const data = await infoResponse.json() as KwirthData
            const clusterId = (await clusterResponse.json()).id

            setMsgBox(<></>)
            setTestResult({ success: true, data, clusterId })
        }
        catch (error) {
            setMsgBox(<></>)
            setTestResult({ success: false, error: `The cluster could not be reached${probe.route ? ` through the route '${probe.route.resolver}'` : ''}: ${error}` })
        }
    }

    const onClickNew= () => {
        setSelectedCluster(undefined)
        clearForm()
    }

    const onClickDelete= () => {
        setMsgBox(MsgBoxYesNo('Delete Cluster',`Are you sure you want to delete cluster ${selectedCluster?.name}?`, setMsgBox, (a:MsgBoxButtons)=> a===MsgBoxButtons.Yes? onConfirmDelete() : {}))
    }

    const onConfirmDelete= async () => {
        if (selectedCluster) {
            setClusters(clusters.filter(c => c !== selectedCluster))
            clearForm()
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

    return (
        <>
            <Dialog open={true} ref={escapeRef} fullWidth maxWidth='md' disableEnforceFocus>
                <DialogTitleHelp section='guide/admin/06-cluster-management?id=add-a-remote-cluster' docsUrl={docsUrl(backendUrl, 'core', 'kwirth')}>Manage clusters</DialogTitleHelp>
                <DialogContent data-refresh={refresh}>
                    <Stack sx={{ display: 'flex', flexDirection: 'row' }}>
                        <List sx={{flexGrow:1, mr:2, width:'50vh' }}>
                            { clusters?.map(c =>
                                <ListItemButton key={c.url} selected={c===selectedCluster} onClick={() => onClusterSelected(c)} sx={{ opacity: c.inUse === false ? 0.5 : 1 }} title={c.inUse === false ? 'Not enabled: kept here, but not in the resource selector nor given to extensions' : undefined}>
                                    <ListItem>
                                      <Stack direction={'column'} sx={{width:'100%'}}>
                                          <Stack
                                              direction={'row'}
                                              sx={{
                                                  justifyContent: 'space-between',
                                                  alignItems: 'baseline'
                                              }}>
                                              <Typography>{c.name}</Typography>
                                              {c.id && <Typography
                                                  sx={{
                                                      color: 'text.secondary',
                                                      fontSize: 10
                                                  }}>{c.id}</Typography>}
                                          </Stack>
                                          {c.kwirthData?.clusterType && <Typography
                                              sx={{
                                                  color: 'text.secondary',
                                                  fontSize: 12
                                              }}>{c.kwirthData?.version}<b> ({c.kwirthData?.clusterType})</b></Typography>}
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
                                <TextField value={accessKey} onChange={(e) => setAccessKey(e.target.value)} disabled={selectedCluster?.home} variant='standard' label='API Key'
                                    type={keyRevealed ? 'text' : 'password'}
                                    slotProps={{ input: { endAdornment: (
                                        <InputAdornment position='end'>
                                            <IconButton size='small' onClick={() => setKeyRevealed(r => !r)} title={keyRevealed ? 'Hide' : 'Show'} aria-label={keyRevealed ? 'Hide API key' : 'Show API key'}>
                                                { keyRevealed ? <VisibilityOff fontSize='small' /> : <Visibility fontSize='small' /> }
                                            </IconButton>
                                        </InputAdornment>) } }}></TextField>
                                {/*
                                    How this core reaches the cluster: directly, or through one of its installed ROUTERS.
                                    Always visible; disabled when there is nothing to choose.
                                */}
                                <Stack direction='row' spacing={1}>
                                    <FormControl variant='standard' sx={{ width: 180 }} disabled={selectedCluster?.home || (clusterRouters().length === 0 && routeResolver === DIRECT_ROUTE)}>
                                        {/* DIRECT_ROUTE is '': without displayEmpty MUI would show it as no selection at all */}
                                        <InputLabel id='manage-clusters-route-label' shrink>Route</InputLabel>
                                        <Select labelId='manage-clusters-route-label' displayEmpty value={routeResolver} onChange={(e) => setRouteResolver(e.target.value)}>
                                            <MenuItem value={DIRECT_ROUTE}>Direct</MenuItem>
                                            { clusterRouters().map(r => <MenuItem key={r.id} value={r.id}>{r.id}</MenuItem>) }
                                            {/* A saved route whose router is gone stays selectable, so it is seen and can be changed */}
                                            { routeResolver !== DIRECT_ROUTE && !clusterRouters().some(r => r.id === routeResolver) && <MenuItem value={routeResolver}>{routeResolver} (not installed)</MenuItem> }
                                        </Select>
                                    </FormControl>
                                    <TextField value={routeUid} onChange={(e) => setRouteUid(e.target.value)} disabled={selectedCluster?.home || routeResolver === DIRECT_ROUTE} variant='standard' label='Cluster UID' sx={{ flexGrow: 1 }}></TextField>
                                </Stack>
                                {/*
                                    The user's switch: an entry not enabled stays in this list, to be edited, but it is not offered in the
                                    resource selector, not given to extensions (federation, bots) and not read. The home is always in use.
                                */}
                                <Box>
                                    <FormControlLabel sx={{ ml: 0 }} disabled={selectedCluster?.home} control={<Switch checked={inUse} onChange={(e) => setInUse(e.target.checked)} />} label='Enabled' />
                                    <Typography variant='caption' sx={{ display: 'block', color: 'text.secondary' }}>Not enabled: it stays in this list, but it is not offered in the resource selector nor given to extensions.</Typography>
                                </Box>
                            </Stack>
                        }
                    </Stack>
                </DialogContent>
                <DialogActions>
                  <Stack direction='row' spacing={1}>
                    <Button variant='outlined' onClick={onClickNew}>NEW</Button>
                    <Button variant='outlined' onClick={onClickSave} disabled={selectedCluster?.home || name==='' || url==='' || accessKey==='' || (routeResolver !== DIRECT_ROUTE && routeUid.trim()==='') }>SAVE</Button>
                    <Button variant='outlined' onClick={onClickTest} disabled={!url || !url.toLocaleLowerCase().startsWith('http') || !accessKey || (routeResolver !== DIRECT_ROUTE && routeUid.trim()==='')}>TEST</Button>
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
                                <Stack direction='row' spacing={1} sx={{
                                    alignItems: 'center'
                                }}>
                                    <CheckCircleOutline color='success' />
                                    <Typography
                                        sx={{
                                            color: 'success.main',
                                            fontWeight: 600
                                        }}>
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
                                <Typography sx={{
                                    fontWeight: 600
                                }}>Supported channels</Typography>
                                <Stack spacing={1}>
                                    {testResult.data!.channels.map(ch => {
                                        const caps = channelCaps(ch)
                                        return (
                                            <Stack direction='row' spacing={1} key={ch.id} sx={{
                                                alignItems: 'center'
                                            }}>
                                                <Typography sx={{
                                                    fontWeight: 600
                                                }}>{ch.id}</Typography>
                                                {caps.map(cap => (
                                                    <Chip key={cap} label={cap} size='small' variant='outlined' />
                                                ))}
                                                <Typography variant='caption' sx={{
                                                    color: 'text.secondary'
                                                }}>
                                                    [{ch.sources.join(', ')}]
                                                </Typography>
                                            </Stack>
                                        );
                                    })}
                                </Stack>
                            </Stack>
                        ) : (
                            /* Error: icon and message on the same line */
                            <Stack direction='row' spacing={1} sx={{
                                alignItems: 'center'
                            }}>
                                <ErrorOutline color='error' />
                                <Typography sx={{
                                    color: 'error.main'
                                }}>{testResult.error}</Typography>
                            </Stack>
                        )}
                    </DialogContent>
                    <DialogActions>
                        <Button variant='outlined' onClick={() => setTestResult(null)}>ok</Button>
                    </DialogActions>
                </Dialog>
            )}

            {msgBox}
        </>
    );
}

export { ManageClusters }
