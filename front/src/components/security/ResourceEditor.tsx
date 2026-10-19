import React, { useEffect, useState } from 'react'
import { Button, Checkbox, FormControl, IconButton, InputLabel, ListSubheader, MenuItem, Select, SelectChangeEvent, Stack, TextField, Tooltip, Typography} from '@mui/material'
import { Settings } from '@kwirthmagnify/kwirth-common-front/icons'
import { buildResource, parseResource, parseThinScope, IExtensionScope } from '@kwirthmagnify/kwirth-common'
import { ScopeConfigDialog } from './ScopeConfigDialog'

interface IResourceEditorProps {
    resources:string[]
    onUpdate:(resources:string[]) => void
    scopeCatalog?:IExtensionScope[]   // catálogo completo (built-in + plugins) servido por GET /core/scopes
}

const ResourceEditor: React.FC<IResourceEditorProps> = (props:IResourceEditorProps) => {
    const [scopes, setScopes] = useState<string[]>([])
    const [scopeFilter, setScopeFilter] = useState('')
    const [allResources, setAllResources] = useState<string[]>(props.resources)
    const [selectedResource, setSelectedResource] = useState<string>('')
    const [namespace, setNamespace] = useState('')
    const [deployment, setDeployment] = useState('')
    const [replicaset, setReplicaset] = useState('')
    const [replicationController, setReplicationController] = useState('')
    const [daemonset, setDaemonset] = useState('')
    const [statefulset, setStatefulset] = useState('')
    const [pod, setPod] = useState('')
    const [container, setContainer] = useState('')
    // The scope being narrowed right now, if the dialog is open.
    const [narrowing, setNarrowing] = useState<IExtensionScope | undefined>()

    useEffect(() => {
        setAllResources(props.resources)
        if (props.resources.length>0) {
            setSelectedResource(props.resources[0])
            showResource(props.resources[0])
        }
        else {
            newResource()
        }
    }, [props.resources])

    const showResource = (resourceString:string) => {
        let resource = parseResource(resourceString)

        /*
            `''.split(',')` returns [''], NOT [] — an array holding one empty string. That empty entry
            survived into the selection, and buildResource joins with commas, so a resource with no
            scopes yet turned into ',cluster::::' the moment the first scope was ticked. The leading
            comma then travelled into the accessKey, where an empty scope is one more token the ladder
            does not know.
        */
        setScopes(resource.scopes?.split(',').filter(s => s !== '') ?? [])
        setNamespace(resource.namespaces||'')

        let groups = (resource.groups as string)
        if (groups) {
            let dps = groups.split(',').filter(g => g.split('+')[0] === 'deployment').map(g => g.split('+')[1]).join(',')
            setDeployment(dps)
            let rss = groups.split(',').filter(g => g.split('+')[0] === 'replicaset').map(g => g.split('+')[1]).join(',')
            setReplicaset(rss)
            let rcs = groups.split(',').filter(g => g.split('+')[0] === 'replicationcontroller').map(g => g.split('+')[1]).join(',')
            setReplicationController(rcs)
            let dss = groups.split(',').filter(g => g.split('+')[0] === 'daemonset').map(g => g.split('+')[1]).join(',')
            setDaemonset(dss)
            let sss = groups.split(',').filter(g => g.split('+')[0] === 'statefulset').map(g => g.split('+')[1]).join(',')
            setStatefulset(sss)
        }

        setPod(resource.pods||'')
        setContainer(resource.containers||'')
    }

    const newResource= () => {
        setSelectedResource('')
        setScopes([])
        setNamespace('')
        setDeployment('')
        setReplicaset('')
        setReplicationController('')
        setDaemonset('')
        setStatefulset('')
        setPod('')
        setContainer('')
    }

    const saveResource = () => {
        if (scopes.length === 0) return
        let groups:string[]=[]
        if (deployment.trim()!=='') groups.push (...deployment.split(',').map(g => 'deployment+'+g))
        if (replicaset.trim()!=='') groups.push (...replicaset.split(',').map(g => 'replicaset+'+g))
        if (replicationController.trim()!=='') groups.push (...replicationController.split(',').map(g => 'replicationcontroller+'+g))
        if (daemonset.trim()!=='') groups.push (...daemonset.split(',').map(g => 'daemonset+'+g))
        if (statefulset.trim()!=='') groups.push (...statefulset.split(',').map(g => 'statefulset+'+g))
        // Empty scopes are filtered here as well as on reading: what is built here ends up inside the
        // accessKey, and an empty token there is one more scope the channel ladders do not recognise.
        let resource = buildResource(scopes.filter(s => s !== ''), namespace.split(','), groups, pod.split(','), container.split(','))

        let rs = allResources.filter(r => r!== selectedResource)
        rs = [...rs, resource]
        setAllResources (rs)
        props.onUpdate(rs)
        newResource()
    }

    const removeResource = () => {
        let rs = allResources.filter(r => r !== selectedResource)
        setAllResources(rs)
        props.onUpdate(rs)
    }

    /*
        A scope is stored in one of two forms — `magnify$read` or `magnify#read#<b64>` — and BOTH are the
        same entry of the catalogue. Everything below goes through here so the thin one is never treated
        as a scope of its own: it would show up unticked, as a line of base64, next to the option it is.
    */
    const wideOf = (token: string): string => parseThinScope(token)?.wide ?? token
    const entryOf = (token: string): IExtensionScope | undefined => scopeOptions.find(o => o.scope === wideOf(token))
    /** What is stored for this catalogue entry, in whichever form. */
    const storedFor = (optScope: string): string | undefined => scopes.find(s => wideOf(s) === optScope)

    /** The configuration of a thin scope, said in words, so the admin can audit it without decoding. */
    const describeConfig = (config: unknown): string => {
        if (config === null || config === undefined) return ''
        if (Array.isArray(config)) return config.join(', ')
        if (typeof config === 'object') return Object.entries(config as Record<string, unknown>).map(([k, v]) => `${k}=${v}`).join(', ')
        return String(config)
    }

    /** One stored scope, as the admin should read it: the label, and what it is narrowed to. */
    const describeScope = (token: string): string => {
        const thin = parseThinScope(token)
        const label = entryOf(token)?.label ?? wideOf(token)
        return thin ? `${label} → ${describeConfig(thin.config)}` : label
    }

    /** Replaces whatever is stored for this entry — the two forms are exclusive within one resource. */
    const setScopeFor = (optScope: string, token: string|undefined) => {
        setScopes(prev => {
            const rest = prev.filter(s => wideOf(s) !== optScope)
            return token ? [...rest, token] : rest
        })
    }

    /*
        MUI toggles by EXACT equality against each item's value, and that is why a MenuItem's value is the
        STORED token when there is one. Without that, clicking an option already granted in its thin form
        would not untick it — it would ADD the wide one beside it, and the wide one wins, so the editor
        itself would silently widen a permission the admin was trying to narrow.
    */
    const onChangeScopes = (event: SelectChangeEvent<typeof scopes>) => {
        const next = event.target.value as string[]
        const added = next.filter(s => !scopes.includes(s))

        // Nothing added = something was unticked. Removal needs no form.
        if (added.length !== 1) {
            setScopes(next)
            return
        }
        const entry = scopeOptions.find(o => o.scope === added[0])
        /*
            The form opens on ticking ONLY when the channel declared one: that scope's author expects it
            to be narrowed, so asking is the point. Everything else goes in as it always did — making
            every grant cost a dialog would tax the common case to serve the rare one. Narrowing a scope
            whose channel declared no fields stays possible, through the gear, with the free field.
        */
        if (!entry || (entry.config ?? []).length === 0) {
            setScopes(next)
            return
        }
        setNarrowing(entry)
    }

    /** What the narrowing dialog decided: a thin token, or the wide scope when nothing was filled in. */
    const onNarrowed = (scope: string) => {
        if (narrowing) setScopeFor(narrowing.scope, scope)
        setNarrowing(undefined)
    }

    /*
        🔴 The trap of decision 3 of the PRD, said out loud. Resources are OR'd and the WIDE form wins, so
        an admin who grants `fileman$write` and then adds `fileman#write#/tmp` believing they restricted
        it has restricted NOTHING, and until now nobody told them. It is not a rule being changed — it is
        the rule not being silent.

        It cannot happen through this editor any more (the two forms are exclusive per entry), but it can
        arrive in a key written by hand through /key, or from one granted before this existed.
    */
    const widenedByAWiderScope = (): IExtensionScope[] => {
        const thin = scopes.filter(s => parseThinScope(s))
        return thin
            .filter(t => scopes.some(s => s !== t && !parseThinScope(s) && s === wideOf(t)))
            .map(t => entryOf(t))
            .filter((e): e is IExtensionScope => e !== undefined)
    }

    const onChangeResource = (event: SelectChangeEvent) => {
        let res = event.target.value
        showResource(res)
        setSelectedResource(res)
    }

    // The select's options = the complete catalogue served by GET /core/scopes (the core's built-ins +
    // legacy ops/trivy + the scopes plugins declare through getScopeCatalog). There is no enum in the
    // front end any more.
    const scopeOptions: IExtensionScope[] = props.scopeCatalog ?? []
    const filteredScopeOptions = scopeFilter.trim()
        ? scopeOptions.filter(o => scopes.includes(o.scope) || (o.scope + ' ' + o.label).toLowerCase().includes(scopeFilter.trim().toLowerCase()))
        : scopeOptions

    return (
        <Stack spacing={1} style={{width:'100%', minWidth: 0, overflow: 'hidden'}}>
            <FormControl variant='standard'>
                <InputLabel>Resource List</InputLabel>
                <Select value={selectedResource} onChange={onChangeResource}>
                    { allResources.map ((resource,index) => {
                        if (selectedResource === resource || (!selectedResource && index === 0)) {
                            return <MenuItem selected key={index} value={resource}>{resource.length>50? resource.substring(0,50)+'...':resource }</MenuItem>
                        }
                        else
                            return <MenuItem key={index} value={resource}>{resource}</MenuItem>
                    })}
                </Select>
            </FormControl>

            <Stack direction={'column'} spacing={1} sx={{paddingLeft:3}}>
                <FormControl variant='standard'>
                    <InputLabel>Scopes</InputLabel>
                    {/* The label and what it is narrowed to — NEVER the raw token: a line of base64 in
                        here is a permission nobody can audit without decoding it by hand. */}
                    <Select value={scopes} multiple onChange={onChangeScopes}
                        renderValue={(s) => { const v = s.map(describeScope).join(', '); return v.length > 60 ? v.substring(0, 60) + '…' : v }}
                        MenuProps={{ autoFocus: false, PaperProps: { style: { maxHeight: 380 } } }}
                        onClose={() => setScopeFilter('')}>
                        <ListSubheader sx={{ p: 0, bgcolor: 'background.paper' }}>
                            <TextField autoFocus fullWidth size='small' variant='standard' placeholder='Filter scopes…'
                                value={scopeFilter} onChange={(e) => setScopeFilter(e.target.value)}
                                onKeyDown={(e) => { if (e.key !== 'Escape') e.stopPropagation() }} sx={{ px: 1, py: 0.5 }} />
                        </ListSubheader>
                        { filteredScopeOptions.map( (opt:IExtensionScope) => {
                            const stored = storedFor(opt.scope)
                            const thin = stored ? parseThinScope(stored) : undefined
                            return (
                            // The item's value is what is STORED, so MUI's equality ticks and unticks the
                            // right thing whichever of the two forms the scope is in.
                            <MenuItem key={opt.scope} value={stored ?? opt.scope}>
                                <Checkbox checked={stored !== undefined} />
                                { opt.description
                                    ? <Tooltip title={opt.description} placement='right' arrow><Typography>{opt.label}</Typography></Tooltip>
                                    : <Typography>{opt.label}</Typography> }
                                { thin && <Typography variant='caption' color='primary' sx={{ ml: 1 }}>→ {describeConfig(thin.config)}</Typography> }
                                {/* Reopening is its own control: clicking the row toggles the permission,
                                    so without this there is no way to CHANGE what it is narrowed to —
                                    only to revoke it and grant it again. */}
                                { opt.scope.includes('$') && (
                                    <Tooltip title={stored ? 'Change what this is limited to' : 'Limit this scope'}>
                                        <IconButton size='small' sx={{ ml: 'auto' }} aria-label={`Narrow ${opt.label}`}
                                            onClick={e => { e.stopPropagation(); setNarrowing(opt) }}>
                                            <Settings fontSize='small' />
                                        </IconButton>
                                    </Tooltip>
                                )}
                            </MenuItem>
                        )})}
                        { filteredScopeOptions.length === 0 && <MenuItem disabled><Typography variant='caption'>No matches</Typography></MenuItem> }
                    </Select>
                </FormControl>
                { widenedByAWiderScope().map(e => (
                    <Typography key={e.scope} variant='caption' color='warning.main'>
                        ⚠️ <b>{e.label}</b> is granted in full as well, so the limit below it does nothing — resources are combined, and the wider form wins. Remove <b>{e.scope}</b> to make the limit apply.
                    </Typography>
                ))}
                {/*
                    🔴 Said here, once, above the fields it applies to. Everything below is a list of
                    REGULAR EXPRESSIONS and they are matched UNANCHORED, which is not what the names of
                    the fields suggest: granting 'kwirth' also grants 'kwirth-system', and 'pre' also
                    grants 'pre-produccion'. An administrator who did not know that has granted more
                    than they think, and nothing on this screen told them.
                */}
                <Typography variant='caption' color='text.secondary'>
                    Namespaces, workloads, pods and containers below are <b>regular expressions</b>, separated by commas, and they match <b>anywhere in the name</b>: <code>kwirth</code> also matches <code>kwirth-system</code>. Write <code>^kwirth$</code> to mean that one and no other.
                </Typography>
                <TextField value={namespace} onChange={(e) => setNamespace(e.target.value)} variant='standard' label='Namespaces' placeholder='e.g. ^kwirth$, pre-.*'></TextField>

                <Stack direction={'row'} spacing={1}>
                    <TextField value={deployment} onChange={(e) => setDeployment(e.target.value)} variant='standard' label='Deployments' fullWidth/>
                    <TextField value={replicaset} onChange={(e) => setReplicaset(e.target.value)} variant='standard' label='ReplicaSets' fullWidth/>
                    <TextField value={replicationController} onChange={(e) => setReplicationController(e.target.value)} variant='standard' label='ReplicationControllers' fullWidth/>
                </Stack>
                <Stack direction={'row'} spacing={1}>
                    <TextField value={daemonset} onChange={(e) => setDaemonset(e.target.value)} variant='standard' label='DaemonSets' fullWidth/>
                    <TextField value={statefulset} onChange={(e) => setStatefulset(e.target.value)} variant='standard' label='StatefulSets' fullWidth/>
                </Stack>

                <TextField value={pod} onChange={(e) => setPod(e.target.value)} variant='standard' label='Pods'/>
                <TextField value={container} onChange={(e) => setContainer(e.target.value)} variant='standard' label='Containers'/>
                <Stack direction={'row'} spacing={1} alignSelf={'end'}>
                    <Button onClick={newResource} size='small' variant='outlined'>New</Button>
                    <Button onClick={saveResource} size='small' variant='outlined' disabled={scopes.length===0}>Save</Button>
                    <Button onClick={removeResource} size='small' variant='outlined' disabled={scopes.length===0}>Remove</Button>
                </Stack>
            </Stack>

            {/* Reopening fills the form with what is stored, decoded. That is what makes a permission
                auditable six months later: the admin sees the list they ticked, not a base64 string. */}
            { narrowing && (
                <ScopeConfigDialog entry={narrowing}
                    initial={parseThinScope(storedFor(narrowing.scope) ?? '')?.config}
                    onAccept={onNarrowed}
                    onClose={() => setNarrowing(undefined)} />
            )}
        </Stack>
    )
}

export { ResourceEditor }