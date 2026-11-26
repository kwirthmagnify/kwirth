import React, { useContext, useState } from 'react'
import { useEscapeToClose } from '../../tools/useKeyboard'
import { Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider, FormControl, FormControlLabel, IconButton, InputAdornment, InputLabel, List, ListItem, ListItemButton, MenuItem, Select, Stack, Switch, TextField, Typography } from '@mui/material'
import { Visibility, VisibilityOff } from '@kwirthmagnify/kwirth-common-front/icons'
import CheckCircleOutline from '@mui/icons-material/CheckCircleOutlined'
import ErrorOutline from '@mui/icons-material/ErrorOutlined'
import { SessionContext, SessionContextType } from '../../model/SessionContext'
import { DialogTitleHelp, docsUrl } from '@kwirthmagnify/kwirth-common-front'
import { Cluster, EClusterCredentials } from '../../model/Cluster'
import { isLoginCluster, loginStatusOf, signOutOfCluster } from '../../tools/ClusterLogin'
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
    /** A success with no data to show: a LOGIN entry with no session, which can only be checked as reachable. */
    message?: string
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
    // How it authenticates (plans/completed/cluster-login): an access key pasted in, or a sign-in to the remote when used
    const [credentials, setCredentials] = useState<EClusterCredentials>(EClusterCredentials.KEY)
    const isLogin = credentials === EClusterCredentials.LOGIN
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
        setCredentials(cluster.credentials ?? EClusterCredentials.KEY)
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
        setCredentials(EClusterCredentials.KEY)
        setKeyRevealed(false)
    }

    /*
        The credentials of the form, applied to an entry. A LOGIN entry keeps the key it signed in with —it is the
        session, not something typed here— unless it has just become a login entry: then the old key goes, and
        so does any remote user. A KEY entry takes the key of the field and has no remote user.
    */
    const applyCredentials = (cluster: Cluster) => {
        if (isLogin) {
            if (!isLoginCluster(cluster)) signOutOfCluster(cluster)
            cluster.credentials = EClusterCredentials.LOGIN
        }
        else {
            cluster.credentials = undefined
            cluster.accessString = accessKey
            cluster.remoteUser = undefined
            cluster.loginExpired = undefined
        }
    }

    // The session of the selected entry, for the line beside Credentials. Blank (not missing) for a KEY entry.
    const sessionText = (): string => {
        if (!isLogin) return ''
        if (!selectedCluster || !isLoginCluster(selectedCluster)) return 'Signs in on use'
        return loginStatusOf(selectedCluster)
    }

    // Sign out of a LOGIN entry: the key goes, and the next use asks for credentials again (maybe as another user)
    const onClickSignOut = () => {
        if (!selectedCluster) return
        signOutOfCluster(selectedCluster)
        setClusters([...clusters])
        setRefresh(Math.random())
    }

    /*
        Saving leaves the saved entry SELECTED, with what was saved in the form.

        🔴 It used to clear the form but keep the entry selected: the list showed it highlighted, the form
        showed nothing, and whatever was typed next —looking like a new cluster— OVERWROTE that entry on the
        next save. And an edited entry was taken out and appended at the END, so the list reordered itself
        on every save. Now it stays where it was.
    */
    const onClickSave = async () => {
        if (selectedCluster) {
            applyCredentials(selectedCluster)
            selectedCluster.name = name
            selectedCluster.url = url
            selectedCluster.route = editedRoute()
            selectedCluster.inUse = inUse
            selectedCluster.kwirthData = undefined
            // one that is not in use is not read: nothing reaches out to a cluster nobody uses
            if (inUse) await readClusterInfo(selectedCluster, props.notify)
            setClusters(clusters.map(c => c === selectedCluster ? selectedCluster : c))
            setRefresh(Math.random())
        }
        else {
            var c = new Cluster()
            applyCredentials(c)
            c.name = name
            c.url = url
            c.route = editedRoute()
            c.inUse = inUse
            c.kwirthData = undefined
            if (inUse) await readClusterInfo(c, props.notify)
            setClusters([...clusters, c])
            setRefresh(Math.random())
            // the new one becomes the selected one: a second SAVE edits it instead of adding it again
            setSelectedCluster(c)
        }
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
        /*
            A LOGIN entry is tested with its session's key when it has one. Without a session there is no key to
            test, so what is checked is that a Kwirth answers there — through its route too — on the public route
            its own login page reads first.
        */
        const testKey = isLogin ? (selectedCluster?.accessString ?? '') : accessKey
        if (isLogin && !testKey) {
            try {
                setMsgBox(MsgBoxWaitCancel('Test cluster', 'Connecting to cluster and verifying Kwirth availability...', setMsgBox))
                const r = await fetch(`${base}/core/auth/method`)
                setMsgBox(<></>)
                setTestResult(r.ok
                    ? { success: true, message: 'Kwirth answers there. Sign in when you use this cluster.' }
                    : { success: false, error: `Connection failed (HTTP ${r.status}). Check the ${probe.route ? 'route and cluster UID' : 'URL'}.` })
            }
            catch (error) {
                setMsgBox(<></>)
                setTestResult({ success: false, error: `The cluster could not be reached${probe.route ? ` through the route '${probe.route.resolver}'` : ''}: ${error}` })
            }
            return
        }
        try {
            setMsgBox(MsgBoxWaitCancel('Test cluster', 'Connecting to cluster and verifying Kwirth availability...', setMsgBox))

            const [infoResponse, clusterResponse] = await Promise.all([
                fetch(`${base}/config/info`, addGetAuthorization(testKey)),
                fetch(`${base}/config/cluster`, addGetAuthorization(testKey))
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
                            {/* key by POSITION, not by url: two entries may share a url, and with the url as key React
                                mixed their rows up — duplicated rows, a click landing on the wrong one */}
                            { clusters?.map((c, index) =>
                                <ListItemButton key={`${index}-${c.url}`} selected={c===selectedCluster} onClick={() => onClusterSelected(c)} sx={{ opacity: c.inUse === false ? 0.5 : 1 }} title={c.inUse === false ? 'Not enabled: kept here, but not in the resource selector nor given to extensions' : undefined}>
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
                                          {/* a LOGIN entry says its session: who it is signed in as, or that it needs signing in */}
                                          {isLoginCluster(c) && <Typography data-testid='manage-clusters-row-session'
                                              sx={{
                                                  color: c.accessString && !c.loginExpired ? 'text.secondary' : 'warning.main',
                                                  fontSize: 12
                                              }}>{loginStatusOf(c)}</Typography>}
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
                                {/*
                                    How it authenticates, apart from how it is reached (plans/completed/cluster-login, D1): an API key, or
                                    a sign-in to the remote with any of ITS users when the cluster is used. On its row, the session
                                    of a Login entry and its Sign out — always there (empty / disabled for an API key entry), so
                                    choosing one or the other moves nothing.
                                */}
                                <Stack direction='row' spacing={1} sx={{ alignItems: 'flex-end' }}>
                                    <FormControl variant='standard' sx={{ width: 130, flexShrink: 0 }} disabled={selectedCluster?.home}>
                                        <InputLabel id='manage-clusters-credentials-label' shrink>Credentials</InputLabel>
                                        <Select labelId='manage-clusters-credentials-label' value={credentials} onChange={(e) => setCredentials(e.target.value as EClusterCredentials)}>
                                            <MenuItem value={EClusterCredentials.KEY}>API key</MenuItem>
                                            <MenuItem value={EClusterCredentials.LOGIN}>Login</MenuItem>
                                        </Select>
                                    </FormControl>
                                    <Typography variant='body2' data-testid='manage-clusters-session' sx={{ flexGrow: 1, minWidth: 0, color: 'text.secondary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', pb: 0.5 }}>
                                        {sessionText()}
                                    </Typography>
                                    <Button size='small' variant='outlined' onClick={onClickSignOut} sx={{ flexShrink: 0 }}
                                        disabled={!isLogin || !selectedCluster || !isLoginCluster(selectedCluster) || !selectedCluster.accessString}>SIGN OUT</Button>
                                </Stack>
                                {/* With Login there is no key to type: the field stays there, disabled and empty — never hidden */}
                                <TextField value={isLogin ? '' : accessKey} onChange={(e) => setAccessKey(e.target.value)} disabled={selectedCluster?.home || isLogin} variant='standard' label='API Key'
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
                    <Button variant='outlined' onClick={onClickSave} disabled={selectedCluster?.home || name==='' || url==='' || (!isLogin && accessKey==='') || (routeResolver !== DIRECT_ROUTE && routeUid.trim()==='') }>SAVE</Button>
                    <Button variant='outlined' onClick={onClickTest} disabled={!url || !url.toLocaleLowerCase().startsWith('http') || (!isLogin && !accessKey) || (routeResolver !== DIRECT_ROUTE && routeUid.trim()==='')}>TEST</Button>
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
                                        {testResult.message ?? 'Connection and API key successfully tested'}
                                    </Typography>
                                </Stack>

                                {testResult.data && <>
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
                                </>}
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
