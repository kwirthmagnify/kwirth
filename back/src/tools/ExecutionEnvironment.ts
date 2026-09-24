import fs from 'fs'
import { KubeConfig } from '@kubernetes/client-node'
import { EClusterType, EExecutionEnvironment } from '@kwirthmagnify/kwirth-common'

/*
    DONDE se guardan configuracion y secretos.

    Son tres y no dos porque el modo docker escribe JSON plano desde siempre (DockerSecrets) mientras que
    el resto de almacenamiento en fichero cifra los secretos con MASTERKEY (NodeSecrets). Unificarlos
    cambiaria el formato de los ficheros de quien ya tiene un Kwirth en docker, asi que el formato viejo se
    queda donde esta y no se usa para nada nuevo: ECS y cualquier entorno futuro van a FILE.
*/
enum EStoreKind {
    KUBERNETES = 'kubernetes',  // Secrets y ConfigMaps del namespace
    FILE = 'file',              // ficheros, con los secretos cifrados con MASTERKEY (NodeSecrets)
    FILE_PLAIN = 'file-plain'   // ficheros JSON planos (DockerSecrets), formato historico del modo docker
}

/*
    QUE tiene a mano este Kwirth. Es lo unico que decide comportamiento: el entorno de ejecucion dice donde
    corremos, pero no basta por si solo, porque un contenedor o una tarea de ECS pueden traer kubeconfig o
    no traerlo, y eso cambia si hay cluster que observar.

    'reasons' no es decoracion: el arranque la imprime tal cual. Quien despliega esto en un sitio al que no
    puede asomarse —una tarea de ECS, por ejemplo— solo tiene el log para entender por que Kwirth cree lo
    que cree, y una capacidad sin explicacion es una capacidad que se diagnostica a ciegas.
*/
interface IEnvironmentCapabilities {
    kubernetes: boolean         // hay API de Kubernetes: events, metricas, recursos, SA token
    store: EStoreKind
    storePath: string|undefined // con store FILE o FILE_PLAIN; undefined = el defecto de cada backend
    reasons: string[]
}

/*
    La comprobacion que mira la maquina, inyectable. Por defecto es la de verdad; un test la sustituye y
    asi puede preguntar 'que pasa en Fargate sin kubeconfig' sin estar en Fargate.
*/
interface IEnvironmentProbes {
    kubeconfig: (context:string|undefined) => boolean
}

const isDesktopRuntime = (): boolean => {
    const versions = process.versions as Record<string, string|undefined>
    const tauri = (globalThis as { __TAURI__?: unknown }).__TAURI__
    return versions.electron !== undefined || tauri !== undefined
}

/*
    El agente de ECS inyecta esta variable en los DOS launch types (EC2 desde la version 1.39 del agente,
    Fargate desde la plataforma 1.4), asi que es la senal canonica y no hay que adivinar cual de los dos es.
*/
const isEcsRuntime = (): boolean => process.env.ECS_CONTAINER_METADATA_URI_V4 !== undefined || process.env.ECS_CONTAINER_METADATA_URI !== undefined

const detectExecutionEnvironment = (): EExecutionEnvironment|undefined => {
    switch (process.env.FORCE) {
        case 'desktop':
            return EExecutionEnvironment.DESKTOP
        case 'docker':
            return EExecutionEnvironment.DOCKER
        case 'k8s':
            return EExecutionEnvironment.KUBERNETES
        case 'ecs':
            return EExecutionEnvironment.ECS
    }

    if (isDesktopRuntime()) return EExecutionEnvironment.DESKTOP
    if (process.env.KUBERNETES_SERVICE_HOST) return EExecutionEnvironment.KUBERNETES

    /*
        ECS va ANTES que docker a proposito: en el launch type EC2 los contenedores los arranca el demonio
        de Docker, asi que '/.dockerenv' existe y se llevaria la deteccion. En Fargate no existe —es
        containerd—, que es la razon de que hasta ahora una tarea de Fargate no fuese ningun entorno
        conocido y el proceso se cerrase al arrancar.
    */
    if (isEcsRuntime()) return EExecutionEnvironment.ECS
    if (fs.existsSync('/.dockerenv')) return EExecutionEnvironment.DOCKER

    return undefined
}

/*
    Comprobacion PASIVA: hay un kubeconfig con un cluster seleccionado. No se le pregunta al servidor.

    Es deliberado. Preguntar seria mas honesto, pero mete un timeout de red en el arranque y, sobre todo,
    convierte un cluster que tarda en responder en un Kwirth degradado a 'sin Kubernetes' —que es un
    diagnostico mucho peor que un error claro al primer uso. Si hay kubeconfig, se intenta usar; si el
    cluster no contesta, eso se ve y se reporta como el fallo que es.
*/
const hasUsableKubeconfig = (context:string|undefined): boolean => {
    try {
        const kubeConfig = new KubeConfig()
        kubeConfig.loadFromDefault()
        if (context) kubeConfig.setCurrentContext(context)
        return kubeConfig.getCurrentCluster() !== null
    }
    catch (err) {
        return false
    }
}

const resolveStore = (executionEnvironment:EExecutionEnvironment, kubernetes:boolean, reasons:string[]): { store:EStoreKind, storePath:string|undefined } => {
    const kwirthStore = process.env.KWIRTH_STORE

    switch (executionEnvironment) {
        case EExecutionEnvironment.DESKTOP:
            reasons.push('Store: encrypted files (desktop always keeps its data locally)')
            return { store: EStoreKind.FILE, storePath: kwirthStore }

        case EExecutionEnvironment.DOCKER:
            reasons.push('Store: plain files (legacy docker format, set by CONFIGMAPPATH and SECRETPATH)')
            return { store: EStoreKind.FILE_PLAIN, storePath: undefined }

        case EExecutionEnvironment.ECS:
            if (kwirthStore) {
                reasons.push(`Store: encrypted files at '${kwirthStore}' (KWIRTH_STORE)`)
            }
            else {
                reasons.push('Store: encrypted files at the default path. WARNING: no KWIRTH_STORE set, so nothing will survive a task recycle unless that path is a mounted volume')
            }
            return { store: EStoreKind.FILE, storePath: kwirthStore }

        case EExecutionEnvironment.KUBERNETES:
            /*
                'etcd' se admite por compatibilidad: es como se pedia explicitamente el almacenamiento del
                propio cluster antes de que KWIRTH_STORE aceptase una ruta.
            */
            if (kwirthStore && kwirthStore !== 'etcd') {
                reasons.push(`Store: encrypted files at '${kwirthStore}' (KWIRTH_STORE)`)
                return { store: EStoreKind.FILE, storePath: kwirthStore }
            }
            if (!kubernetes) {
                reasons.push('Store: encrypted files, because there is no Kubernetes API to hold Secrets and ConfigMaps')
                return { store: EStoreKind.FILE, storePath: undefined }
            }
            reasons.push('Store: cluster Secrets and ConfigMaps')
            return { store: EStoreKind.KUBERNETES, storePath: undefined }
    }
}

/*
    De aqui sale TODO lo que el arranque necesita decidir. Quien quiera saber si hay events de Kubernetes,
    si hay metricas o donde se persiste, pregunta a este objeto y no vuelve a mirar el entorno por su
    cuenta: es precisamente la dispersion de esas condiciones lo que hacia que anadir un entorno nuevo
    fuese un trabajo de riesgo.
*/
const resolveEnvironmentCapabilities = async (executionEnvironment:EExecutionEnvironment, context:string|undefined, probes:IEnvironmentProbes = { kubeconfig: hasUsableKubeconfig }): Promise<IEnvironmentCapabilities> => {
    const reasons:string[] = []

    let kubernetes:boolean
    if (executionEnvironment === EExecutionEnvironment.KUBERNETES) {
        // Dentro del cluster (o apuntando a uno) Kubernetes no es opcional: si falla es un error, no una
        // degradacion, y hacerlo opcional aqui solo serviria para esconderlo.
        kubernetes = true
        reasons.push('Kubernetes API: yes (running as a Kubernetes workload)')
    }
    else {
        kubernetes = probes.kubeconfig(context)
        if (kubernetes)
            reasons.push('Kubernetes API: yes (a kubeconfig with a selected cluster was found)')
        else
            reasons.push('Kubernetes API: no (no usable kubeconfig), so cluster events, metrics and resources are not available')
    }

    const { store, storePath } = resolveStore(executionEnvironment, kubernetes, reasons)

    return { kubernetes, store, storePath, reasons }
}

/*
    De donde saldran los recursos. Solo hay dos respuestas: el cluster, o ningun sitio.

    Un Kwirth sin cluster NO se queda sin funcion — sirve el front, lleva canales que no miran a la
    infraestructura y desde el se puede federar contra otro Kwirth o apuntar a un cluster montando un
    kubeconfig. Lo que no hace es gestionar contenedores por su cuenta: 'docker compose' como cosa a
    observar es una via que se abandono a proposito.
*/
const resolveClusterType = (capabilities:IEnvironmentCapabilities): EClusterType => {
    if (capabilities.kubernetes) return EClusterType.KUBERNETES
    return EClusterType.NONE
}

export { EStoreKind, IEnvironmentCapabilities, IEnvironmentProbes, detectExecutionEnvironment, resolveEnvironmentCapabilities, resolveClusterType, hasUsableKubeconfig }
