declare module '@jfvilas/react-file-manager' {
    import { FC } from 'react'

    export interface IFileManagerHandle {
       changeFolder: (dest: string) => void
       lock: () => void
       unlock: () => void
    }

    export interface IFileUploadConfig {
        url: string
        method?: "POST" | "PUT"
        headers?: { [key: string]: string }
    }

    export interface IFileDownloadConfig {
        url: string
        headers?: { [key: string]: string }
    }

    export interface IError {
        type: string,
        message: string,
        response: {
            status: number,
            statusText: string,
            data: any,
        }
    }

    export interface IFileObject {
        name: string;
        displayName?: string;
        isDirectory: boolean;
        path: string;
        layout?: string;
        class?: string;
        children?: string|function;
        data?: any;
        categories?: string[];
        features?: string[];
    }

    export interface IAction {
        title: string,
        icon: React.JSX,
        onClick: (files : IFileObject[]) => void
    }

    export interface IIcon {
        open: React.JSX
        closed: React.JSX
        grid: React.JSX
        list: React.JSX
        default: React.JSX
    }

    export interface ISpace {
        text?: string     // Text to show on the header of the 'name' column (th name of the object)
        source?: string   // name of the property of the JSON where the data would be found
        width?: number    // width fo the column in the 'list' view
        sumSourceProperty?: string
        sumReducer?: number
        sumUnits?: string[]
        leftItems?: ISpaceMenuItem[]    // array of item actions
        configurable?: boolean,         // headers can be configurable (resize, add/remove...) or not
        properties?: ISpaceProperty[]   // properties of the object (like size, update date...)
    }

    export interface ISpaceMenuItem {
        name?: string,    // name of the action
        icon?: any,       // icon to show on the left
        text: string,     // text of the action to show
        permission: boolean,    // required permission (for using 'filedata' space, that is, a file manager not an object manager)
        multi?: boolean,        // true if this action can be executed on several files at the same time
        onClick?: (paths:string[], currentTraget:Element) => void     // what to do when th euser clicks the action
        isVisible?: (name:string, path:string) => boolean             // determine if the action is visible depending on name and path
        isEnabled?: (name:string, path:string) => boolean             // determine if the action is enabled depending on name and path
    }

    export interface IFileManagerMenuItem {
        name: string,   // name of the filemanager action (show on file manager right side)
        onClick?: (name:string, target:HTMLElement) => void,    // what to do on click
        onDraw?: (name:string) => void  // how to draw (or not to) it
    }

    export interface ISpaceProperty {
        name: string,   // name of the property
        text: string,   // text to show on 'list' view
        source: string|function,    // source property (can be a string or a funciton for showing dynamic data)
        format: 'string'|'function'|'age'|'number'|'storage',   // how to format data prior to be shown
        sortable: boolean,  // true if the column can be sorted
        removable?: boolean,    // column can be removed from list view if space is 'configurable' and 'removable' is true
        width: number,  // width of the column in the 'list' view
        visible: boolean    // true if the column is visible on list view
    }

    export interface ICategoryValue {
        key: string,
        text?: string
    }

    export interface ICategory {
        key: string,
        text: string,
        all: ICategoryValue[],
        selected: string[],
        onCategoryValuesChange: (categoryKey:string, value:string, selected:string[]) => void
        onCategoryFilter: (categoryKey:string, f:IFileObject) => boolean
        isFilterActive: (categoryKey:string) => boolean
    }

    export interface IPermissions {
        create: boolean,
        delete: boolean,
        download: boolean,
        copy: boolean,
        move: boolean,
        rename: boolean,
        upload: boolean
    }

    export interface IFileManagerProps {
        actions?: Map<string, IAction[]>
        space?: string
        spaces?: Map<string, ISpace>
        rightItems?: IFileManagerMenuItem[]
        files?: IFileObject[]
        fileUploadConfig?: IFileUploadConfig
        fileDownloadConfig?: IFileDownloadConfig
        icons?: Map<string, IIcon[]>
        isLoading?: boolean
        onCreateFolder? : (name: string, parentFolder: IFileObject) => void
        onFileUploaded? : (file:IFileObject, parentFolder: IFileObject) => void
        onFileUploading? : (file:IFileObject, parentFolder: IFileObject) => void
        onFileUploadError? : (file:IFileObject, parentFolder: IFileObject) => void
        onCut? : (files: IFileObject[]) => void
        onCopy? : (files: IFileObject[]) => void
        onPaste? : (files: IFileObject[], destFolder:IFileObject, operation:string) => void
        onRename? : (file: IFileObject, newName: string) => void
        onDownload? : (files: IFileObject[]) => void
        onDelete? : (files:IFileObject[]) => void
        onLayoutChange? : () => void
        onRefresh? : () => void
        onFileOpen? : () => void
        onFolderChange : (folder: string) => void
        onSelect? : (files:IFileObject[]) => void
        onSelectionChange? : (files:IFileObject[]) => void
        onError? : (error: IError, file: IFileObject) => void
        layout?: string
        enableFilePreview: boolean
        maxFileSize? : number
        filePreviewPath: string
        acceptedFileTypes? : string[]
        height: string
        width? : string
        initialPath: string
        filePreviewComponent? : React.ReactNode
        primaryColor: string
        fontFamily: string
        language? : string
        permissions: IPermissions
        collapsibleNav? : boolean
        defaultNavExpanded? : boolean
        className? : string
        style? : any
        searchMode?: 'auto'|'hidden'|'visible'
        searchRegex?: boolean
        searchCasing?: boolean
        showRefresh?: boolean
        showContextMenu?: boolean
        showBreadcrumb?: boolean
        categories?: ICategory[]
        maxNavigationPaneLevel: number
        minFileActionsLevel: number
        formatDate? : string | number
        openMode : 'default'|'none'
    }

    export const FileManager: React.ForwardRefExoticComponent<
        IFileManagerProps & React.RefAttributes<IFileManagerHandle>
    >

}