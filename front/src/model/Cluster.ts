import { EClusterFlavour, ERancherRole, IClusterRoute, KwirthData } from '@kwirthmagnify/kwirth-common'
import { MetricDefinition } from '@kwirthmagnify/kwirth-common-front'

/*
    How an entry of the cluster list authenticates against its Kwirth (plan: plans/cluster-login/PRD.md, D1). It is
    independent of HOW it is reached (direct or through a router, `route`): a cluster behind a bridge can go with
    a login too.
*/
export enum EClusterCredentials {
    /** The entry carries an access key of the remote Kwirth, pasted in when it was added. */
    KEY = 'key',
    /** No key is stored up front: the user signs in to the remote Kwirth, with any of ITS users, and the key it hands out is kept. */
    LOGIN = 'login'
}

export class Cluster {
    public id: string = ''
    public name: string = ''
    public enabled: boolean = true
    public url: string = ''             // ALWAYS the real url (persisted, shown). To connect: clusterBaseUrl() in tools/ClusterRouting
    public accessString: string = ''
    public route?: IClusterRoute        // set on PROXIED entries: how this core reaches a cluster it cannot reach directly
    /** How it authenticates (see EClusterCredentials). Absent = KEY: every entry saved before keeps working as it did. */
    public credentials?: EClusterCredentials
    /** LOGIN: the remote user the key was obtained with — shown as 'as <user>'. Unrelated to the user of THIS Kwirth. */
    public remoteUser?: string
    /** LOGIN, runtime: the remote refused the kept key (expired after 24 h, or revoked), so the next use asks again. */
    public loginExpired?: boolean
    /*
        The user's switch in Manage cluster list ('Enabled'). false = kept in the list but not used: not in the resource
        selector, not given to extensions, not read. Absent = in use, so every saved entry keeps working. Not 'enabled':
        that one is runtime state (whether the cluster answered), set by readClusterInfo.
    */
    public inUse?: boolean
    public home: boolean|undefined = false
    public inCluster: boolean = false
    public metricsList: Map<string,MetricDefinition> = new Map()  //+++ review if needs to be moved to metrics channel
    public kwirthData?: KwirthData
    public clusterInfo?: IClusterInfo
}

export interface IClusterInfo {
    id: string,
    name: string,
    type: string,
    flavour: EClusterFlavour,
    /** Whether a Rancher manages this cluster, and whether it is the one Rancher runs on. */
    rancherManaged: boolean,
    rancherRole: ERancherRole,
    memory: number
    vcpu: number
    reportedName: string,
    reportedServer: string,
    version: string,
    platform: string,
    nodes: string[]
}
