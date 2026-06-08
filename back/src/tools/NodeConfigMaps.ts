import { IConfigMaps } from './IConfigMap'
import fs from 'fs'
import path from 'path'
import os from 'os'

export class NodeConfigMaps implements IConfigMaps {
    private dir: string

    constructor() {
        this.dir = path.join(os.homedir(), '.kwirth', 'configmaps')
        fs.mkdirSync(this.dir, { recursive: true })
    }

    write = async (name: string, data: any): Promise<any> => {
        const file = path.join(this.dir, name)
        if (data === null) {
            try { fs.unlinkSync(file) } catch (err: any) { if (err.code !== 'ENOENT') console.log(`Error deleting configmap (${err}).`) }
            return {}
        }
        try {
            fs.writeFileSync(file, JSON.stringify(data))
        } catch (err: any) {
            console.log(`Error writing configmap (${err}).`)
        }
    }

    read = async (name: string, defaultValue: any = undefined): Promise<any> => {
        const file = path.join(this.dir, name)
        try {
            return JSON.parse(fs.readFileSync(file, 'utf-8'))
        } catch {
            return defaultValue
        }
    }

    writeKey = async (name: string, key: string, value: any): Promise<void> => {
        const file = path.join(this.dir, name)
        let existing: Record<string, any> = {}
        try { existing = JSON.parse(fs.readFileSync(file, 'utf-8')) } catch {}
        if (value === null) delete existing[key]
        else existing[key] = value
        try { fs.writeFileSync(file, JSON.stringify(existing)) } catch (err: any) { console.log(`Error writing key '${key}' in configmap ${name}: ${err}`) }
    }

    readAllKeys = async (name: string): Promise<Record<string, any>> => {
        const file = path.join(this.dir, name)
        try { return JSON.parse(fs.readFileSync(file, 'utf-8')) } catch { return {} }
    }
}
