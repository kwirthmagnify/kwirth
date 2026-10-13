/*
    What DCE `file-manager` hands its consumers (plan: plans/file-manager/PRD.md).

    Consumers import THIS file for the types only: at runtime they get the instance the core keeps,
    through getDce<IFileManagerDce>('file-manager'). Nothing here is a runtime import, so a consumer
    that imports these types does not bundle a byte of the file manager.

    What is shared is the module NAMESPACE and not an object of our own, on purpose: a consumer writes
    `import { FileManager } from '@jfvilas/react-file-manager'` and its build maps that package onto
    `fileManager`, so the import keeps meaning exactly what it meant when the core published the
    library as a global. A wrapper would be a second API to keep in step, and one more place to fall
    behind the library it wraps.
*/

/** The file manager's module namespace (@jfvilas/react-file-manager), as a type. */
export type TFileManagerModule = typeof import('@jfvilas/react-file-manager')

export interface IFileManagerDce {
    /** The DCE's id, as the core installed it. */
    readonly id: string
    /**
     * The library, shared by every consumer on the page. Its stylesheet is already on the page: the
     * factory puts it there when the core creates this instance, so a consumer never has to.
     */
    readonly fileManager: TFileManagerModule
}
