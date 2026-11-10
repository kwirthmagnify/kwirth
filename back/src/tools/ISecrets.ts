export interface ISecrets {
    write: (name: string, content: {}) => Promise<void>
    read: (name: string, defaultValue?: any) => Promise<any>
    writeKey: (name: string, key: string, value: any) => Promise<void>
    readAllKeys: (name: string) => Promise<Record<string, any>>

    // The names of the objects that start with `prefix`, unordered. What cannot be listed gives [].
    list: (prefix: string) => Promise<string[]>
    // Removes the object; one that does not exist is not an error.
    delete: (name: string) => Promise<void>

    /*
        How much ONE object admits, in bytes, or `undefined` when there is no practical ceiling. The same
        criterion as in IConfigMaps: a Kubernetes Secret has the same ~1 MiB ceiling as a ConfigMap, and
        the file storages do not. Whoever stores something big asks first.
    */
    storeLimit: () => number | undefined
}
