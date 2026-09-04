import { ISecrets } from './ISecrets'
import fs from 'fs'
import path from 'path'
import os from 'os'
import crypto from 'crypto'

const ALGO = 'aes-256-gcm'
const IV_LEN = 12
const TAG_LEN = 16

export class NodeSecrets implements ISecrets {
    private dir: string
    private key: Buffer

    constructor(baseDir?: string, masterKey: string = 'Kwirth4Ever') {
        this.dir = baseDir ? path.join(baseDir, 'secrets') : path.join(os.homedir(), '.kwirth', 'secrets')
        fs.mkdirSync(this.dir, { recursive: true })
        // deriva una clave de 32 bytes a partir de masterKey
        this.key = crypto.createHash('sha256').update(masterKey).digest()
    }

    private encrypt(plain: string): string {
        const iv = crypto.randomBytes(IV_LEN)
        const cipher = crypto.createCipheriv(ALGO, this.key, iv)
        const encrypted = Buffer.concat([cipher.update(plain, 'utf-8'), cipher.final()])
        const tag = cipher.getAuthTag()
        return Buffer.concat([iv, tag, encrypted]).toString('base64')
    }

    private decrypt(encoded: string): string {
        const buf = Buffer.from(encoded, 'base64')
        const iv = buf.subarray(0, IV_LEN)
        const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN)
        const data = buf.subarray(IV_LEN + TAG_LEN)
        const decipher = crypto.createDecipheriv(ALGO, this.key, iv)
        decipher.setAuthTag(tag)
        return decipher.update(data) + decipher.final('utf-8')
    }

    write = async (name: string, data: {}): Promise<void> => {
        try {
            fs.writeFileSync(path.join(this.dir, name), this.encrypt(JSON.stringify(data)))
        } catch (err: any) {
            console.log(`Error writing secret (${err}).`)
        }
    }

    read = async (name: string, defaultValue?: any): Promise<any> => {
        try {
            const raw = fs.readFileSync(path.join(this.dir, name), 'utf-8')
            return JSON.parse(this.decrypt(raw))
        } catch {
            return defaultValue
        }
    }

    writeKey = async (name: string, key: string, value: any): Promise<void> => {
        let existing: Record<string, any> = await this.read(name) ?? {}
        if (value === null) delete existing[key]
        else existing[key] = value
        await this.write(name, existing)
    }

    readAllKeys = async (name: string): Promise<Record<string, any>> => {
        return await this.read(name) ?? {}
    }
}
