import { Button, Stack, Typography } from "@mui/material"
import { ENotifyLevel } from "../../../tools/Global"
import { IFileObject } from "@jfvilas/react-file-manager"
import { useMemo } from "react"
import { getIconFromKind } from "../../../tools/Constants-React"
const _ = require('lodash')

interface IIssue {
    kind:string
    name:string
    namespace:string
    level:ENotifyLevel
    text:string
}
const formatIssues = (issues:IIssue[], onLink:(kind:string, name:string, namespace:string) => void) => {
    return <Stack direction={'column'}>{
        issues.map ( (i, index) => {
            return <Typography key={index} variant='body2'>{i.text}:&nbsp;<a href={`#`} onClick={() => onLink(i.kind, i.name, i.namespace)}>{i.name}</a></Typography>
        })}
    </Stack>
}

const validateReplicaSet = (files:IFileObject[]) => {
    let issues:IIssue[] = []

    for (let rs of files.filter(f => f.class==='ReplicaSet').map(f => f.data.origin)) {
        if (rs.status?.replicas === 0 || rs.status?.availableReplicas === 0 || rs.status?.readyReplicas ===0 ) {
            issues.push ({kind:'ReplicaSet', name:rs.metadata.name, namespace:rs.metadata.namespace, level: ENotifyLevel.WARNING, text: 'Unneeded ReplicaSet' })
        }
        else if (rs.status?.replicas === 0 || rs.spec.availableReplicas === 0 ) {
            issues.push ({kind:'ReplicaSet', name:rs.metadata.name, namespace:rs.metadata.namespace, level: ENotifyLevel.WARNING, text: '0 replicas desired' })
        }
    }
    return issues
}

const validateDeployment = (files:IFileObject[]) => {
    let issues:IIssue[] = []

    for (let dp of files.filter(f => f.class==='Deployment').map(f => f.data.origin)) {
        if (dp.status?.replicas !== dp.status?.availableReplicas) {
            issues.push ({kind:'Deployment', name:dp.metadata.name, namespace:dp.metadata.namespace, level: ENotifyLevel.WARNING, text: 'Unready replicas' })
        }
    }
    return issues
}

const validateJob = (files:IFileObject[]) => {
    let issues:IIssue[] = []

    for (let j of files.filter(f => f.class==='Job').map(f => f.data.origin)) {
        if (j.status?.failed!==undefined && +j.status?.failed>0) issues.push ({kind:'Job', name:j.metadata.name, namespace:j.metadata.namespace, level: ENotifyLevel.ERROR, text: 'Failed Job' })
    }
    return issues
}

const validateStatefulSet = (files:IFileObject[]) => {
    let issues:IIssue[] = []

    for (let ss of files.filter(f => f.class==='Stateful').map(f => f.data.origin)) {
        if (ss.status?.replicas !== ss.status?.availableReplicas) {
            issues.push ({kind:'StatefulSet', name:ss.metadata.name, namespace:ss.metadata.namespace, level: ENotifyLevel.ERROR, text: 'SS Replicas unready' })
        }
    }
    return issues
}

const validateDaemonSet = (files:IFileObject[]) => {
    let issues:IIssue[] = []

    for (let ds of files.filter(f => f.class==='Stateful').map(f => f.data.origin)) {
        if (ds.status?.replicas !== ds.status?.availableReplicas) {
            issues.push ({kind:'StatefulSet', name:ds.metadata.name, namespace:ds.metadata.namespace, level: ENotifyLevel.ERROR, text: 'DS replicas unready' })
        }
    }
    return issues
}

const validateConfigMap = (files:IFileObject[]) => {
    let configMaps = files.filter(f => f.class==='ConfigMap' && f.data?.origin?.metadata?.namespace!=='kube-system' && f.data?.origin?.metadata?.namespace!=='kube-public')
    let unused = [...configMaps]

    const isUsedInEnvs = (cont:any, name:string) : boolean => {
        let envFroms = cont.envFrom as any[] || []
        for (let envFrom of envFroms) {
            if (envFrom.configMapRef?.name === name) return true
        }
        let envs = cont.env as any[] || []
        for (let env of envs) {
            if (env.valueFrom?.configMapRef?.name === name) return true
        }
        return false
    }

    const isUsedInPod = (pod:any, name:string) : boolean => {
        for (let cont of pod.spec?.containers as any[] || [])
            if (isUsedInEnvs(cont, name)) return true
        
        let vols = pod['spec']?.['volumes'] as any[] || []
        for (let vol of vols) {
            if(vol.configMap?.name === name) return true
            if (vol.projected?.sources?.some( (s:any) => s.configMap?.name === name)) return true
        }
        return false
    }

    for (let configMap of configMaps) {
        let configMapName = configMap.data.origin.metadata.name
        if (' kwirth.keys kwirth-keys '.includes(configMapName)) unused = unused.filter(s => s !== configMap)
        for (let pod of files.filter(f => f.class==='Pod/').map(f => f.data.origin))
            if (isUsedInPod(pod, configMapName)) unused = unused.filter(s => s !== configMap)
        for (let ss of files.filter(f => f.class==='StatefulSet').map(f => f.data.origin))
            if (isUsedInPod(ss.spec.template, configMapName)) unused = unused.filter(s => s !== configMap)
        for (let rs of files.filter(f => f.class==='ReplicaSet').map(f => f.data.origin))
            if (isUsedInPod(rs.spec.template, configMapName)) unused = unused.filter(s => s !== configMap)
        for (let dp of files.filter(f => f.class==='Deployment').map(f => f.data.origin))
            if (isUsedInPod(dp.spec.template, configMapName)) unused = unused.filter(s => s !== configMap)
        for (let ds of files.filter(f => f.class==='DaemonSet').map(f => f.data.origin))
            if (isUsedInPod(ds.spec.template, configMapName)) unused = unused.filter(s => s !== configMap)
        for (let rc of files.filter(f => f.class==='ReplicationController').map(f => f.data.origin))
            if (isUsedInPod(rc.spec.template, configMapName)) unused = unused.filter(s => s !== configMap)
    }
    return unused.map(u => { return {name:u.data.origin.metadata.name, namespace:u.data.origin.metadata.namespace, kind:'ConfigMap', text:'Unreferenced ConfigMap', level: ENotifyLevel.WARNING}})
}

const validateSecret = (files:IFileObject[]) => {
    let secrets = files.filter(f => f.class==='Secret' && f.data?.origin?.metadata?.namespace!=='kube-system' && f.data?.origin?.metadata?.namespace!=='kube-public')
    let unused = [...secrets]

    for (let secretx of secrets) {
        let secretNamex = secretx.data.origin.metadata.name
        if (' kwirth-sa-kwirthtoken kwirth-users kwirth.keys kwirth-keys '.includes(secretNamex)) unused = unused.filter(s => s !== secretx)
        if (secretx.data?.origin?.type?.startsWith('helm.sh/release.')) unused = unused.filter(s => s !== secretx)

        for (let file of files.filter(f => f.class==='Pod')) {
            let pod = file.data.origin;
            if ((_.get(pod, 'spec.imagePullSecrets') as [] || []).map((s:any) => s.name).some((imgSecretName:any) => imgSecretName === secretNamex)) {
                unused = unused.filter(s => s !== secretx)
                break
            }
            let conts = pod.spec?.containers as any[] || []
            for (let cont of conts) {
                let envFroms = cont.envFrom as any[] || []
                for (let envFrom of envFroms) {
                    if (envFrom.secretRef?.name === secretNamex) unused = unused.filter(s => s !== secretx)
                }
                let envs = cont.env as any[] || []
                for (let env of envs) {
                    if (env.valueFrom?.secretKeyRef?.name === secretNamex) unused = unused.filter(s => s !== secretx)
                }
            }
            let vols = pod.spec?.volumes as any[] || []
            for (let vol of vols) {
                if (vol.secret?.secretName === secretNamex) unused = unused.filter(s => s !== secretx)
                if (vol.projected?.sources?.some( (s:any) => s.secret?.name === secretNamex)) unused = unused.filter(s => s !== secretx)
            }
        }
        for (let obj of files.filter(f => f.class==='Deployment' || f.class==='Job' || f.class==='ReplicaSet' || f.class==='DaemonSet' || f.class==='StatefulSet').map(f => f.data.origin)) {
            if ((_.get(obj, 'spec.template.spec.imagePullSecrets') as any[] || []).map((s:any) => s.name).some((imgSecretName:any) => imgSecretName === secretNamex)) {
                unused = unused.filter(s => s !== secretx)
                break
            }
        }
        for (let file of files.filter(f => f.class==='Ingress')) {
            let pod = file.data.origin
            if ((_.get(pod, 'spec.tls') as [] || []).some((host:any) => host.secretName === secretNamex)) unused = unused.filter(s => s !== secretx)
        }
        for (let file of files.filter(f => f.class==='PersistentVolume')) {
            let pv = file.data.origin
            if (_.get(pv, 'spec.csi.nodeStageSecretRef.name')===secretNamex) unused = unused.filter(s => s !== secretx)
            if (_.get(pv, 'spec.csi.volumeAttributes.secretName')===secretNamex) unused = unused.filter(s => s !== secretx)
        }
        for (let file of files.filter(f => f.class==='StorageClass')) {
            let sc = file.data.origin
            if (_.get(sc, 'parameters.secretName')===secretNamex) unused = unused.filter(s => s !== secretx)
        }

    }
    return unused.map(u => { return {name:u.data.origin.metadata.name, namespace:u.data.origin.metadata.namespace, kind:'Secret', text:'Unreferenced Secret', level: ENotifyLevel.WARNING}})
}

const validateVolumeAttachment = (files:IFileObject[]) => {
    let vas = files.filter(f => f.class==='VolumeAttachment')
    let issues:IIssue[] = []
    for (let va of vas) {
        if (va.data.origin.status.attachError || va.data.origin.status.detachError) issues.push({
            kind: 'VolumeAttach',
            name: va.data.origin.metadata.name,
            namespace: '',
            level: ENotifyLevel.ERROR,
            text: 'Attach/detach error'
        })
    }
    return issues
}

const validateNode = (files:IFileObject[]) => {
    let issues:IIssue[] = []
    let nodes = files.filter(f => f.class==='Node').map(f => f.data.origin)
    for (let node of nodes) {
        let ready = node.status.conditions.some((c:any) => c.type==='Ready' && c.status==='True')
        if (!ready) issues.push({
            name: node.metadata.name, 
            namespace:'', 
            kind:'Node', 
            text:'Node not ready', 
            level: ENotifyLevel.ERROR}
        )
    }
    return issues
}

const validateIngress = (files:IFileObject[]) => {
    let issues:IIssue[] = []
    let is = files.filter(f => f.class==='Ingress').map(f => f.data.origin)
    for (let i of is) {
        let ns = i.metadata?.namespace
        let rules = i.spec?.rules
        for (let r of rules) {
            let paths = r.http?.paths
            for (let p of paths) {
                let svc = p.backend?.service?.name
                if (!files.find(f => f.class==='Service' && f.data.origin?.metadata?.name===svc && f.data.origin?.metadata?.namespace===ns))
                    issues.push({kind: 'Ingress', name: i.metadata.name, namespace: i.metadata.namespace, level: ENotifyLevel.ERROR, text: "Inexistent service "+svc})
            }
        }
    }
    return issues
}

const validateService = (files:IFileObject[]) => {
    let issues:IIssue[] = []
    let ss = files.filter(f => f.class==='Service' && f.data.origin?.metadata?.namespace!=='kube-system' && f.data.origin?.metadata?.namespace!=='kube-public').map(f => f.data.origin)
    for (let s of ss) {
        const ns = s.metadata?.namespace
        const selector = s.spec.selector
        if (selector) {
            let found = false
            for (let p of files.filter(f => f.class==='Pod' && f.data.origin?.metadata?.namespace===ns).map(f => f.data.origin)) {
                let x = 0
                for (let k of Object.keys(selector)) {
                    if (p.metadata?.labels?.[k]===selector[k]) x++
                }
                if (x===Object.keys(selector).length) {
                    found=true
                    break
                }
            }
            if (!found) issues.push({kind: 'Service', name: s.metadata.name, namespace: s.metadata.namespace, level: ENotifyLevel.ERROR, text: 'Inexistent service destination pods'})
        }
    }
    return issues
}

const validateRole = (files:IFileObject[]) => {
    let issues:IIssue[] = []
    let rs = files.filter(f => f.class==='Role' && f.data.origin?.metadata?.namespace!=='kube-system' && f.data.origin?.metadata?.namespace!=='kube-public').map(f => f.data.origin)
    for (let r of rs) {
        let inUse = false
        for(let rb of files.filter(f => f.class==='RoleBinding').map(f => f.data.origin)) {
            inUse = rb.subjects.some((s:any) => s.kind==='ServiceAccount' && s.name === r.metadata.name && s.namespace === r.metadata.namespace)
            if (inUse) break
        }
        if (!inUse) issues.push({kind: 'Role', name: r.metadata.name, namespace: r.metadata.namespace, level: ENotifyLevel.WARNING, text: 'Role not in use'})
    }
    return issues
}

const validateClusterRole = (files:IFileObject[]) => {
    let issues:IIssue[] = []
    let crs = files.filter(f => f.class==='ClusterRole').map(f => f.data.origin)
    for (let cr of crs) {
        let inUse = false
        for(let crb of files.filter(f => f.class==='ClusterRoleBinding').map(f => f.data.origin)) {
            inUse = crb.subjects && crb.subjects.some((s:any) => s.kind==='ServiceAccount' && s.name === crb.metadata.name && s.namespace === crb.metadata.namespace)
            if (inUse) break
        }
        if (!inUse) issues.push({kind: 'ClusterRole', name: cr.metadata.name, namespace: '', level: ENotifyLevel.WARNING, text: 'ClusterRole not in use'})
    }
    return issues
}

const showBadge = (issues:IIssue[], icon:JSX.Element, onNavigate:(dest:string)=> void, dest:string) => {
    let errors = issues.filter(i => i.level === ENotifyLevel.ERROR).length
    let warnings = issues.filter(i => i.level === ENotifyLevel.WARNING).length
    return (
        <Button onClick={() => onNavigate(dest)} sx={{backgroundColor:errors>0?'#ffaaaa':''}}>
            <Stack direction={'column'} alignItems={'center'}>
                {icon}
                <Stack direction={'row'}>
                    <Typography fontSize={10} color={errors>0?'red':'gray'}>{errors}&nbsp;&nbsp;</Typography>
                    <Typography fontSize={10} color={warnings>0?'orange':errors>0?'gray':'orange'}>{issues.filter(i => i.level === ENotifyLevel.WARNING).length}</Typography>
                </Stack>
            </Stack>
        </Button>
    )
}

const validateSummary = (files:IFileObject[], onNavigate: (dest:string) => void) => {
    return (
        <Stack direction={'row'} flex={1} justifyContent={"space-between"}>
            {showBadge(validateNode(files), getIconFromKind('Node', 50), onNavigate, '/cluster/Node')}
            {showBadge(validateConfigMap(files), getIconFromKind('ConfigMap', 50), onNavigate, '/config/ConfigMap')}
            {showBadge(validateSecret(files), getIconFromKind('Secret', 50), onNavigate, '/config/Secret')}
            {showBadge(validateDeployment(files), getIconFromKind('Deployment', 50), onNavigate, '/workload/Deployment')}
            {showBadge(validateReplicaSet(files), getIconFromKind('ReplicaSet', 50), onNavigate, '/workload/ReplicaSet')}
            {showBadge(validateStatefulSet(files), getIconFromKind('StatefulSet', 50), onNavigate, '/workload/StatefulSet')}
            {showBadge(validateDaemonSet(files), getIconFromKind('DaemonSet', 50), onNavigate, '/workload/DaemonSet')}
            {showBadge(validateJob(files), getIconFromKind('Job', 50), onNavigate, '/workload/Job')}
            {showBadge(validateIngress(files), getIconFromKind('Ingress', 50), onNavigate, '/network/Ingress')}
            {showBadge(validateService(files), getIconFromKind('Service', 50), onNavigate, '/network/Service')}
            {showBadge(validateVolumeAttachment(files), getIconFromKind('VolumeAttachment', 50), onNavigate, '/storage/VolumeAttachment')}
            {showBadge(validateRole(files), getIconFromKind('Role', 50), onNavigate, '/access/Role')}
            {showBadge(validateClusterRole(files), getIconFromKind('ClusterRole', 50), onNavigate, '/access/ClusterRole')}
        </Stack>
    )
}

interface IValidationsProps {
    files: IFileObject[]
    onLink: (kind:string, name:string, namespace:string) => void
    onNavigate: (dest:string) => void
    options: {
        node? : boolean
        configMap? : boolean
        secret? : boolean
        deployment? : boolean
        replicaSet? : boolean
        statefulSet? : boolean
        daemonSet? : boolean
        job? : boolean
        volumeAttachment? :boolean
        ingress? : boolean
        service? : boolean
        role? :boolean
        custerRole? : boolean
        summary? : boolean
    }
}

const Validations: React.FC<IValidationsProps> = (props: IValidationsProps) => {
    const results = useMemo(() => {
        const data: any = {};
        const { options, files, onNavigate } = props;

        // Solo ejecutamos si la opción está habilitada
        if (options.node) data.node = validateNode(files)
        if (options.configMap) data.configMap = validateConfigMap(files)
        if (options.secret) data.secret = validateSecret(files)
        if (options.deployment) data.deployment = validateDeployment(files)
        if (options.replicaSet) data.replicaSet = validateReplicaSet(files)
        if (options.statefulSet) data.statefulSet = validateStatefulSet(files)
        if (options.daemonSet) data.daemonSet = validateDaemonSet(files)
        if (options.job) data.job = validateJob(files)
        if (options.volumeAttachment) data.volumeAttachment = validateVolumeAttachment(files)
        if (options.ingress) data.ingress = validateIngress(files)
        if (options.service) data.service = validateService(files)
        if (options.role) data.role = validateRole(files)
        if (options.custerRole) data.clusterRole = validateClusterRole(files)
        
        if (options.summary) data.summary = validateSummary(files, onNavigate)

        return data
    }, [props.files, props.options, props.onNavigate])

    return (
        <Stack>
            {props.options.node && formatIssues(results.node, props.onLink)}
            {props.options.configMap && formatIssues(results.configMap, props.onLink)}
            {props.options.secret && formatIssues(results.secret, props.onLink)}
            {props.options.deployment && formatIssues(results.deployment, props.onLink)}
            {props.options.replicaSet && formatIssues(results.replicaSet, props.onLink)}
            {props.options.statefulSet && formatIssues(results.statefulSet, props.onLink)}
            {props.options.daemonSet && formatIssues(results.daemonSet, props.onLink)}
            {props.options.job && formatIssues(results.job, props.onLink)}
            {props.options.volumeAttachment && formatIssues(results.volumeAttachment, props.onLink)}
            {props.options.ingress && formatIssues(results.ingress, props.onLink)}
            {props.options.service && formatIssues(results.service, props.onLink)}
            {props.options.role && formatIssues(results.role, props.onLink)}
            {props.options.custerRole && formatIssues(results.clusterRole, props.onLink)}
            {props.options.summary && results.summary}
        </Stack>
    )
}

export { Validations }