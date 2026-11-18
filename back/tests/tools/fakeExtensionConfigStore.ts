import { ExtensionConfigStore } from '../../src/tools/ExtensionConfigStore'
import { ISecrets } from '../../src/tools/ISecrets'

/*
    In-memory Secrets and the ExtensionConfigStore over them, for the tests of every manager that keeps
    installation config (plans/extension-config). Objects by name, as the three real stores keep them; a
    missing one reads as the default. `objects` is exposed so a test can look at what was really stored.
*/

export interface IFakeSecrets extends ISecrets {
    objects: Map<string, Record<string, unknown>>
}

export const fakeSecrets = (): IFakeSecrets => {
    const objects = new Map<string, Record<string, unknown>>()
    return {
        objects,
        write: async (name, content) => { objects.set(name, content as Record<string, unknown>) },
        read: async (name, defaultValue) => objects.has(name) ? objects.get(name) : defaultValue,
        writeKey: async () => { throw new Error('not used by the extension config store') },
        readAllKeys: async () => { throw new Error('not used by the extension config store') },
        list: async prefix => [...objects.keys()].filter(n => n.startsWith(prefix)),
        delete: async name => { objects.delete(name) },
        storeLimit: () => undefined
    }
}

export const fakeConfigStore = (secrets: ISecrets = fakeSecrets()): ExtensionConfigStore => new ExtensionConfigStore(secrets)
