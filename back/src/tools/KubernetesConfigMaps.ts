import { CoreV1Api, V1ConfigMap } from '@kubernetes/client-node'
import { IConfigMaps } from './IConfigMap'
import { ELogComponent, logError, logInfo, logWarning } from './Logging'

export class KubernetesConfigMaps implements IConfigMaps {
    coreApi:CoreV1Api
    namespace:string

    constructor(coreApi: CoreV1Api, namespace:string) {
        this.coreApi=coreApi
        this.namespace=namespace
    }

    public write = async (name:string, data:any): Promise<any> =>{
        if (data === null) {
            try {
                await this.coreApi?.deleteNamespacedConfigMap({ name, namespace: this.namespace })
                logInfo(ELogComponent.CORE, `ConfigMap ${this.namespace}/${name} deleted`)
            }
            catch (err:any) {
                if (err.code !== 404) logError(ELogComponent.CORE, `Error deleting ConfigMap ${this.namespace}/${name}: ${err}`)
            }
            return {}
        }
        try {
            var configMap:V1ConfigMap = {
                metadata: {
                    name: name,
                    namespace: this.namespace
                },
                data: { data: JSON.stringify(data) }
            }
            try {
                await this.coreApi?.replaceNamespacedConfigMap({ name: name, namespace: this.namespace, body: configMap })
                return {}
            }
            catch (err:any) {
                logWarning(ELogComponent.CORE, `Error replacing, try to create.`)
                try {
                    await this.coreApi?.createNamespacedConfigMap({ namespace: this.namespace, body: configMap })
                    return {}
                }
                catch (err:any) {
                    logError(ELogComponent.CORE, `Error creating ConfigMap`)
                    logError(ELogComponent.CORE, err)
                    return {}
                }
            }
        }
        catch (err) {
            logError(ELogComponent.CORE, 'Error writing configMap'+this.namespace+'/'+name)
            logError(ELogComponent.CORE, err)
            return undefined
        }

    }
    
    public read = async (name:string, defaultValue:any=undefined): Promise<any> => {
        try {
            var ct = await this.coreApi?.readNamespacedConfigMap({ name: name, namespace: this.namespace })
            if (ct.data===undefined) ct.data={ data: defaultValue }
            return JSON.parse(ct.data.data)
        }
        catch(err:any){
            if (err.code===404) {
                logInfo(ELogComponent.CORE, 'Value not found reading configMap ' + this.namespace + '/' + name)
                return defaultValue
            }
            else {
                logError(ELogComponent.CORE, 'Error reading kubernetes configMap ' + this.namespace + '/' + name)
                return undefined
            }
        }
    }

    public writeKey = async (name: string, key: string, value: any): Promise<void> => {
        let existing: Record<string, string> = {}
        try {
            const cm = await this.coreApi.readNamespacedConfigMap({ name, namespace: this.namespace })
            existing = cm.data ?? {}
        } catch (err: any) {
            if (err.code !== 404) logError(ELogComponent.CORE, `Error reading ConfigMap for writeKey ${this.namespace}/${name}: ${err}`)
        }
        if (value === null) {
            delete existing[key]
        } else {
            existing[key] = JSON.stringify(value)
        }
        const configMap: V1ConfigMap = { metadata: { name, namespace: this.namespace }, data: existing }
        try {
            await this.coreApi.replaceNamespacedConfigMap({ name, namespace: this.namespace, body: configMap })
        } catch {
            try {
                await this.coreApi.createNamespacedConfigMap({ namespace: this.namespace, body: configMap })
            } catch (err: any) {
                logError(ELogComponent.CORE, `Error writing key '${key}' in ConfigMap ${this.namespace}/${name}: ${err}`)
            }
        }
    }

    public readAllKeys = async (name: string): Promise<Record<string, any>> => {
        try {
            const cm = await this.coreApi.readNamespacedConfigMap({ name, namespace: this.namespace })
            const result: Record<string, any> = {}
            for (const [k, v] of Object.entries(cm.data ?? {})) {
                try { result[k] = JSON.parse(v) } catch { result[k] = v }
            }
            return result
        } catch (err: any) {
            if (err.code === 404) return {}
            logError(ELogComponent.CORE, `Error reading all keys from ConfigMap ${this.namespace}/${name}: ${err}`)
            return {}
        }
    }
}
