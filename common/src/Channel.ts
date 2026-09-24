//transient
enum ClusterTypeEnum {
    KUBERNETES = 'kubernetes'
}

/*
    De donde salen los recursos que este Kwirth observa. Solo hay dos respuestas: de un cluster de
    Kubernetes, o de ningun sitio.

    NONE no es un arranque a medias: es la respuesta honesta cuando no hay API de Kubernetes a mano. Un
    Kwirth asi sigue sirviendo el front, sigue llevando canales AUTONOMOS —los que declaran 'cluster' y
    'resourced' a false y arrancan con la vista 'none'—, y desde el se puede federar contra otro Kwirth o
    apuntar a un cluster montando un kubeconfig. Sin este valor habria que declararse KUBERNETES sin
    Kubernetes, y el front saldria a listar pods contra nada.

    DOCKER estuvo aqui: Kwirth iba a gestionar contenedores y proyectos de compose como si fuesen un
    cluster. Esa via se abandono. Docker sigue siendo un sitio DONDE correr —eso lo dice
    EExecutionEnvironment—, pero no una fuente de recursos.

    OJO: esto NO decide capacidades, se DERIVA de ellas. Quien manda es el entorno de ejecucion mas lo que
    se compruebe al arrancar.
*/
enum EClusterType {
    KUBERNETES = 'kubernetes',
    NONE = 'none'
}

/*
    Donde corre este Kwirth. Es el resultado de getExecutionEnvironment() en el back, que hasta ahora se
    perdia en cuanto terminaba el switch de arranque: lo unico que sobrevivia eran campos derivados y peor
    informados. Se publica porque es el dato del que cuelga todo lo demas —que hay a mano y donde se
    persiste— y porque es lo primero que se quiere saber al diagnosticar un despliegue ajeno.
*/
enum EExecutionEnvironment {
    KUBERNETES = 'kubernetes',  // dentro de un cluster, o contra uno via kubeconfig
    DOCKER = 'docker',          // contenedor suelto en un CRI
    DESKTOP = 'desktop',        // Electron/Tauri en la maquina del usuario
    ECS = 'ecs'                 // tarea de AWS ECS (Fargate o EC2)
}

// How many back instances of a channel make sense per cluster.
enum EChannelInstances {
    MULTI = 'multi',    // several backs per cluster are valid (default: log, metrics, mirc…)
    SINGLE = 'single'   // exactly one back per cluster; home = in-cluster Kwirth
}

// Whether a channel's back is hosted by this Kwirth or lives elsewhere (resolved by the front-hub).
enum EChannelMode {
    LOCAL = 'local',    // hosted here (current behavior)
    REMOTE = 'remote'   // not hosted here; find it on the in-cluster Kwirth
}

interface IEndpointConfig {
    name: string,
    methods: string[]
    requiresAccessKey: boolean
}

interface BackChannelData {
    id: string
    routable: boolean  // instance can receive routed commands
    pauseable: boolean  // instance can be paused
    modifiable: boolean  // instance can be modified
    reconnectable: boolean  // instance supports client reconnect requests
    sources: string[]  // array of sources (kubernetes, docker...)
    metrics: boolean  // this channel requires metrics provider
    endpoints: IEndpointConfig[]  // array of specific endpoints the channel requires (usually this would be empty)
    websocket: boolean  // this channel allows websocket creation (aside from main websocket communication)
    cluster: boolean    // this channel supports cluster-wide invocation (addObject called once with *all)
    resourced: boolean  // this channel supports resource-based invocation (addObject called per selected resource)
    /*
        BOTH false = autonomous channel: it needs nothing from the cluster and can ONLY be started with
        the 'none' view, which invokes addObject once with empty selectors. Use it for a channel whose
        data does not live in the cluster (an external API, for instance): declaring 'cluster' instead
        would make the core register the instance as holding a cluster-wide access key, which is
        unjustified privilege and noise in the audit trail for a channel that never looks at a pod.
    */
    mode?: EChannelMode  // hosted here (local) or elsewhere (remote); set by the core when announcing channels
}

interface KwirthData {
    version: string
    lastVersion: string
    clusterName: string
    clusterType: EClusterType                       // de donde salen los recursos (NONE = de ningun sitio)
    executionEnvironment: EExecutionEnvironment     // donde corre este Kwirth
    inCluster: boolean
    isDesktop: boolean
    namespace: string
    deployment: string
    metricsInterval: number
    channels: BackChannelData[]
}

interface IBackChannelRequirements {
    storage: boolean
    providers: string[]
    instances?: EChannelInstances   // default MULTI; SINGLE = one back per cluster (home = in-cluster)
}

/*
    Prefijo del id con el que se referencia a un PLUVIDER: un plugin que ademas produce informacion
    y la expone in-process, para que otros plugins se suscriban a ella.

    El id completo es '<PLUVIDER_ID_PREFIX><channelId>' y lo compone SIEMPRE el core, para que el
    autor del plugin no pueda equivocarse con el prefijo. Un consumidor lo usa igual que el de un
    provider, tanto en 'requirements.providers' como en 'addSubscriber'.

    Vive en common porque el front tambien lo necesita, para distinguir un pluvider de un provider
    instalado cuando los enseña.
*/
const PLUVIDER_ID_PREFIX = 'plugin:'

export { ClusterTypeEnum, KwirthData, BackChannelData, EClusterType, EExecutionEnvironment, EChannelInstances, EChannelMode, IBackChannelRequirements, PLUVIDER_ID_PREFIX }
