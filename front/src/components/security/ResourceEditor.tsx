import React, { useEffect, useState } from 'react'
import { Button, Checkbox, FormControl, InputLabel, MenuItem, Select, SelectChangeEvent, Stack, TextField, Typography} from '@mui/material'
import { buildResource, parseResource } from '@kwirthmagnify/kwirth-common'

interface IResourceEditorProps {
    resources:string[]
    onUpdate:(resources:string[]) => void
}

const ResourceEditor: React.FC<IResourceEditorProps> = (props:IResourceEditorProps) => {
    const [scopes, setScopes] = useState<string[]>([])
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

    enum allScopes {
        NONE = 'none',
        API = 'api',
        CLUSTER = 'cluster',
        FILTER = 'filter',
        VIEW = 'view',
        SNAPSHOT = 'snapshot',
        STREAM = 'stream',
        CREATE = 'create',
        SUBSCRIBE = 'subscribe',
        OPS_GET = 'ops$get',
        OPS_EXECUTE = 'ops$execute',
        OPS_XTERM = 'ops$xterm',
        OPS_RESTART = 'ops$restart',
        TRIVY_WORKLOAD = 'trivy$workload',
        TRIVY_KUBERNETES = 'trivy$kubernetes'
    }

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

        setScopes(resource.scopes?.split(',')||[])
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
        let resource = buildResource(scopes, namespace.split(','), groups, pod.split(','), container.split(','))
        console.log(resource)
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

    const onChangeScopes = (event: SelectChangeEvent<typeof scopes>) => {
        let ss  = event.target.value as string[]
        setScopes(ss)
    }

    const onChangeResource = (event: SelectChangeEvent) => {
        let res = event.target.value
        showResource(res)
        setSelectedResource(res)
    }

    return (
        <Stack spacing={1} style={{width:'100%'}}>
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
                    <Select value={scopes} multiple onChange={onChangeScopes} renderValue={(s) => s.join(',')}>
                        { Object.entries(allScopes).map( (kvp:[string,string]) => {
                            let scope = kvp[1]
                            return <MenuItem key={scope} value={scope}>
                                <Checkbox checked={scopes.includes(scope)} />
                                <Typography>{scope}</Typography>
                            </MenuItem>
                        })}
                    </Select>
                </FormControl>
                <TextField value={namespace} onChange={(e) => setNamespace(e.target.value)} variant='standard' label='Namespaces'></TextField>

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
        </Stack>
    )
}

export { ResourceEditor }