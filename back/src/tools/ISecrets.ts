export interface ISecrets {
    write: (name: string, content: {}) => Promise<void>
    read: (name: string, defaultValue?: any) => Promise<any>
    writeKey: (name: string, key: string, value: any) => Promise<void>
    readAllKeys: (name: string) => Promise<Record<string, any>>
}
