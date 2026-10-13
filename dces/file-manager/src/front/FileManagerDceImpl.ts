import * as fileManager from '@jfvilas/react-file-manager'
import { IFileManagerDce, TFileManagerModule } from '../common/index'

/*
    The instance the core keeps in `window.__kwirth_dce__['file-manager'].instance`.

    It is built ONCE per page, by the core, so every consumer holds the same module namespace — which
    is the whole point: one copy of the library on the page instead of one per extension that draws a
    file tree.

    The namespace goes out untouched. Picking exports apart here would mean this file had to grow every
    time the library gains one, and a consumer would be stuck until the DCE was republished.
*/
export const createFileManagerFront = (id: string): IFileManagerDce => ({
    id,
    fileManager: fileManager as TFileManagerModule
})
