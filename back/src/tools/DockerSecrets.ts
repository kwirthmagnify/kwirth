import { CoreV1Api } from '@kubernetes/client-node'
import { ISecrets } from './ISecrets'
import fs from 'fs'

export class DockerSecrets implements ISecrets {
    path:string

    constructor (_coreApi: CoreV1Api, namespace:string) {
        // namespace is used as a folder path
        if (!namespace.endsWith('/')) namespace += '/'
        this.path = namespace
    }

    public write = async (name:string, data:{}) => {
        try {
            fs.writeFileSync(this.path + name, JSON.stringify(data))
        }
        catch (err:any) {
            console.log(`Error writing secret (${err}).`)
            console.log(err)
            return
        }
    }
    
    public read = async (name:string, defaultValue?:any): Promise<any> => {
        try {
            let data:any = fs.readFileSync(this.path+name, 'utf-8')
            var jdata=JSON.parse(data)
            return jdata
        }
        catch (err) {
            console.log(`Error reading secret ${name}. Return default value.`)
            console.log(err)
            return defaultValue
        }
    }

    public writeKey = async (name: string, key: string, value: any): Promise<void> => {
        const file = this.path + name
        let existing: Record<string, any> = {}
        try { existing = JSON.parse(fs.readFileSync(file, 'utf-8')) } catch {}
        if (value === null) delete existing[key]
        else existing[key] = value
        try { fs.writeFileSync(file, JSON.stringify(existing)) } catch (err: any) { console.log(`Error writing key '${key}' in docker secret ${name}: ${err}`) }
    }

    public readAllKeys = async (name: string): Promise<Record<string, any>> => {
        try { return JSON.parse(fs.readFileSync(this.path + name, 'utf-8')) } catch { return {} }
    }
}
