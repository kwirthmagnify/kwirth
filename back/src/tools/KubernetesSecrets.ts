import { CoreV1Api } from '@kubernetes/client-node'
import { ISecrets } from './ISecrets'
import { ELogComponent, logError, logWarning } from './Logging'

export class KubernetesSecrets implements ISecrets {
    coreApi:CoreV1Api
    namespace:string

    constructor (coreApi: CoreV1Api, namespace:string) {
        this.coreApi=coreApi
        this.namespace=namespace
    }

    // Misma escritura optimista con reintento que KubernetesConfigMaps: un escritor concurrente deja el
    // resourceVersion obsoleto y kubernetes responde 409 Conflict, que se resuelve releyendo.
    public write = async (name:string, content:{}) => {
        const MAX_ATTEMPTS = 3
        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            let resourceVersion: string | undefined
            try {
                const existing = await this.coreApi.readNamespacedSecret({ name, namespace: this.namespace })
                resourceVersion = existing.metadata?.resourceVersion
            }
            catch {}
            var secret = {
                metadata: {
                    name,
                    namespace: this.namespace,
                    ...(resourceVersion ? { resourceVersion } : {})
                },
                data: content
            }
            try {
                if (resourceVersion) {
                    await this.coreApi?.replaceNamespacedSecret({ name, namespace: this.namespace, body: secret })
                }
                else {
                    await this.coreApi?.createNamespacedSecret({ namespace: this.namespace, body: secret })
                }
                return
            }
            catch (err:any) {
                const conflict = err?.code === 409 || err?.body?.reason === 'Conflict' || String(err).includes('409')
                if (conflict && attempt < MAX_ATTEMPTS) {
                    logWarning(ELogComponent.STORAGE, `Conflict writing secret ${name}, retrying (${attempt}/${MAX_ATTEMPTS})`)
                    continue
                }
                logError(ELogComponent.STORAGE, `Error writing secret ${name}`)
                logError(ELogComponent.STORAGE, err)
                return
            }
        }
    }
    
    public read = async (name:string, defaultValue?:any): Promise<any> => {
        try {
            var ct = await this.coreApi?.readNamespacedSecret({ name, namespace:this.namespace })
            if (ct.data===undefined) ct.data={ data: defaultValue }
            return ct.data
        }
        catch(err:any){
            if (err.code===404) {
                logWarning(ELogComponent.STORAGE, 'Value not found reading secret '+this.namespace+'/'+name)
                return defaultValue
            }
            else {
                logError(ELogComponent.STORAGE, 'Error reading kubernetes secret '+this.namespace+'/'+name)
                return undefined
            }
        }
    }

    public writeKey = async (name: string, key: string, value: any): Promise<void> => {
        let existing: Record<string, string> = {}
        let resourceVersion: string | undefined
        try {
            const s = await this.coreApi.readNamespacedSecret({ name, namespace: this.namespace })
            existing = s.data ?? {}
            resourceVersion = s.metadata?.resourceVersion
        } catch (err: any) {
            if (err.code !== 404) logError(ELogComponent.STORAGE, `Error reading secret for writeKey ${this.namespace}/${name}: ${err}`)
        }
        if (value === null) {
            delete existing[key]
        } else {
            existing[key] = Buffer.from(JSON.stringify(value), 'utf8').toString('base64')
        }
        const secret = { metadata: { name, namespace: this.namespace, ...(resourceVersion ? { resourceVersion } : {}) }, data: existing }
        try {
            if (resourceVersion) {
                await this.coreApi.replaceNamespacedSecret({ name, namespace: this.namespace, body: secret })
            }
            else {
                await this.coreApi.createNamespacedSecret({ namespace: this.namespace, body: secret })
            }
        } catch (err: any) {
            logError(ELogComponent.STORAGE, `Error writing key '${key}' in secret ${this.namespace}/${name}: ${err}`)
        }
    }

    public readAllKeys = async (name: string): Promise<Record<string, any>> => {
        try {
            const s = await this.coreApi.readNamespacedSecret({ name, namespace: this.namespace })
            const result: Record<string, any> = {}
            for (const [k, v] of Object.entries(s.data ?? {})) {
                try { result[k] = JSON.parse(Buffer.from(v, 'base64').toString('utf8')) } catch { result[k] = v }
            }
            return result
        } catch (err: any) {
            if (err.code === 404) return {}
            logError(ELogComponent.STORAGE, `Error reading all keys from secret ${this.namespace}/${name}: ${err}`)
            return {}
        }
    }
}
