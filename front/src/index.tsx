import * as React from 'react'
import * as MUIMaterial from '@mui/material'
import * as MUIIcons from '@kwirthmagnify/kwirth-common-front/icons'
import * as kwirthCommon from '@kwirthmagnify/kwirth-common'
import * as kwirthCommonFront from '@kwirthmagnify/kwirth-common-front'
import * as kwirthCommonAiFront from '@kwirthmagnify/kwirth-common-ai/front'
import * as codeMirrorView from '@codemirror/view'
import * as codeMirrorState from '@codemirror/state'
import * as codeMirrorCommands from '@codemirror/commands'
import * as codeMirrorSearch from '@codemirror/search'
import * as codeMirrorLanguage from '@codemirror/language'
import * as codeMirrorLangYaml from '@codemirror/lang-yaml'
import * as codeMirrorThemeOneDark from '@codemirror/theme-one-dark'
import uiwReactCodeMirror from '@uiw/react-codemirror'
import { FileManager as _rfmFileManager } from '@jfvilas/react-file-manager'
import * as recharts from 'recharts'
import * as reactFlow from '@xyflow/react'
// @ts-ignore - React Flow CSS (no type declarations)
import '@xyflow/react/dist/style.css'
import ReactDOM from 'react-dom/client'
import App from './App'
import { SnackbarProvider } from 'notistack'
import { BrowserRouter } from 'react-router-dom'
// @ts-ignore
import './index.css'

declare global {
    interface Window {
        __kwirth__: { React: typeof React; MUI: { material: typeof MUIMaterial; icons: typeof MUIIcons }; kwirthCommon: typeof kwirthCommon; kwirthCommonFront: typeof kwirthCommonFront; kwirthCommonAiFront: typeof kwirthCommonAiFront; codeMirrorView: typeof codeMirrorView; codeMirrorState: typeof codeMirrorState; codeMirrorCommands: typeof codeMirrorCommands; codeMirrorSearch: typeof codeMirrorSearch; codeMirrorLanguage: typeof codeMirrorLanguage; codeMirrorLangYaml: typeof codeMirrorLangYaml; codeMirrorThemeOneDark: typeof codeMirrorThemeOneDark; uiwReactCodeMirror: typeof uiwReactCodeMirror; jfvilasReactFileManager: { FileManager: typeof _rfmFileManager }; recharts: typeof recharts; reactFlow: typeof reactFlow; loadElk: () => Promise<any> }
        __kwirth_plugins__: Record<string, any>
        __kwirth_senders__: Record<string, { ConfigDialog?: React.ComponentType<any>; nodeLabel?: string; nodeDescription?: string; nodeIcon?: string }>
        __kwirth_themes__: Record<string, { displayName: string; getThemeOptions: (mode: 'light' | 'dark') => any }>
        __kwirth_homepages__: Record<string, any>
    }
}
/*
    "ResizeObserver loop completed with undelivered notifications".

    Lo lanza el NAVEGADOR cuando el callback de un ResizeObserver provoca mas cambios de tamaño en el
    mismo fotograma: React re-renderiza, el elemento cambia, y quedan notificaciones sin entregar. Es
    benigno —nada se rompe— pero en desarrollo el overlay de CRA lo trata como fatal y TAPA LA PANTALLA,
    que es justo lo que impide ver un error de verdad.

    Se parchea aqui, UNA vez y para toda la aplicacion, en vez de en cada sitio que observa tamaños: asi
    cubre tambien los ResizeObserver de las librerias de terceros —React Flow re-mide sus nodos, MUI sus
    contenedores—, que no podemos tocar. Diferir la medida un fotograma es seguro: lo unico que cambia es
    que se mide despues de que el navegador haya terminado, que es cuando el dato es bueno.

    El patron salio del mapa de iter (React Flow), donde ya se habia resuelto; aqui vale para todos.
*/
if (typeof window !== 'undefined' && window.ResizeObserver && !(window as unknown as { __kwirthROPatched?: boolean }).__kwirthROPatched) {
    ;(window as unknown as { __kwirthROPatched?: boolean }).__kwirthROPatched = true
    const NativeRO = window.ResizeObserver
    window.ResizeObserver = class extends NativeRO {
        constructor(cb: ResizeObserverCallback) {
            let raf = 0
            super((entries, observer) => {
                // se descarta la medida anterior si llega otra antes del siguiente fotograma
                cancelAnimationFrame(raf)
                raf = requestAnimationFrame(() => cb(entries, observer))
            })
        }
    }
}

// elkjs (~1.4MB) is lazy-loaded on first layout computation; webpack code-splits it into its own chunk.
// @ts-ignore - elk.bundled.js is a JS bundle without type declarations
const loadElk = () => import('elkjs/lib/elk.bundled.js').then((m: any) => m.default ?? m)
window.__kwirth__ = { React, MUI: { material: MUIMaterial, icons: MUIIcons }, kwirthCommon, kwirthCommonFront, kwirthCommonAiFront, codeMirrorView, codeMirrorState, codeMirrorCommands, codeMirrorSearch, codeMirrorLanguage, codeMirrorLangYaml, codeMirrorThemeOneDark, uiwReactCodeMirror, jfvilasReactFileManager: { FileManager: _rfmFileManager }, recharts, reactFlow, loadElk }
window.__kwirth_plugins__ = {}
window.__kwirth_senders__ = {}
window.__kwirth_themes__ = {}
window.__kwirth_homepages__ = {}

//const isDesktop = true
const isDesktop = navigator.userAgent.toLowerCase().indexOf(' electron/') >= 0 || !!(globalThis as any).__TAURI__

var rootPath = (window.__PUBLIC_PATH__ || '/').trim().toLowerCase()
if (rootPath.endsWith('/')) rootPath=rootPath.substring(0,rootPath.length-1)
if (rootPath.endsWith('/front')) rootPath=rootPath.substring(0,rootPath.length-6)

console.log(`Environment: ${process.env.NODE_ENV}`)
console.log(`Front running in desktop mode: ${isDesktop}`)
console.log(`Root path: '${rootPath}'`)
let backendUrl = 'http://localhost:3883'
if (process.env.NODE_ENV==='production') backendUrl=window.location.protocol+'//'+window.location.host
backendUrl = backendUrl + rootPath
console.log(`Backend URL: ${backendUrl}`)
console.log(`Getting auth`)
let auth = await (await fetch(backendUrl + '/core/auth/method')).json()

const root = ReactDOM.createRoot(
	document.getElementById('root') as HTMLElement
)

root.render(
	//<React.StrictMode>
	<BrowserRouter basename={rootPath}>
		<SnackbarProvider>
			<App backendUrl={backendUrl} isDesktop={isDesktop} auth={auth.auth} authMethods={auth.methods || []}/>
		</SnackbarProvider>
	</BrowserRouter>
	//</React.StrictMode>
)
