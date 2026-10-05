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
import * as reactDom from 'react-dom'
import ReactDOM from 'react-dom/client'
import App from './App'
import { SnackbarProvider } from 'notistack'
import { BrowserRouter } from 'react-router-dom'
// @ts-ignore
import './index.css'

declare global {
    interface Window {
        __kwirth__: { React: typeof React; ReactDOM: typeof reactDom; MUI: { material: typeof MUIMaterial; icons: typeof MUIIcons }; kwirthCommon: typeof kwirthCommon; kwirthCommonFront: typeof kwirthCommonFront; kwirthCommonAiFront: typeof kwirthCommonAiFront; codeMirrorView: typeof codeMirrorView; codeMirrorState: typeof codeMirrorState; codeMirrorCommands: typeof codeMirrorCommands; codeMirrorSearch: typeof codeMirrorSearch; codeMirrorLanguage: typeof codeMirrorLanguage; codeMirrorLangYaml: typeof codeMirrorLangYaml; codeMirrorThemeOneDark: typeof codeMirrorThemeOneDark; uiwReactCodeMirror: typeof uiwReactCodeMirror; jfvilasReactFileManager: { FileManager: typeof _rfmFileManager }; recharts: typeof recharts }
        __kwirth_plugins__: Record<string, any>
        __kwirth_senders__: Record<string, { ConfigDialog?: React.ComponentType<any>; nodeLabel?: string; nodeDescription?: string; nodeIcon?: string }>
        __kwirth_themes__: Record<string, { displayName: string; getThemeOptions: (mode: 'light' | 'dark') => any }>
        __kwirth_homepages__: Record<string, any>
        /*
            The DCE registry (plan: plans/completed/dce/PRD.md) and the doorstep its front.js registers on.

            Two globals and not one, because they are two different things: `__kwirth_dce_factories__` is
            where a DCE's script LEAVES its factory when it loads, and `__kwirth_dce__` is where the core
            puts the instance after calling it — which is what `getDce()` reads. Keeping them apart is
            what makes "loaded" mean the factory already ran.
        */
        __kwirth_dce_factories__: Record<string, { create: (kwirth: unknown) => unknown }>
        __kwirth_dce__: kwirthCommon.TDceRegistry
    }
}
/*
    "ResizeObserver loop completed with undelivered notifications".

    The BROWSER throws it when a ResizeObserver's callback causes further size changes in the same frame:
    React re-renders, the element changes, and notifications are left undelivered. It is benign —nothing
    breaks— but in development CRA's overlay treats it as fatal and COVERS THE SCREEN, which is exactly
    what stops a real error from being seen.

    It is patched here, ONCE and for the whole application, instead of in every place that observes sizes:
    that way it also covers third-party libraries' ResizeObservers —React Flow re-measures its nodes, MUI
    its containers— which we cannot touch. Deferring the measurement by one frame is safe: the only thing
    that changes is that it measures after the browser has finished, which is when the figure is good.

    The pattern came from iter's map (React Flow), where it had already been solved; here it serves everybody.
*/
if (typeof window !== 'undefined' && window.ResizeObserver && !(window as unknown as { __kwirthROPatched?: boolean }).__kwirthROPatched) {
    ;(window as unknown as { __kwirthROPatched?: boolean }).__kwirthROPatched = true
    const NativeRO = window.ResizeObserver
    window.ResizeObserver = class extends NativeRO {
        constructor(cb: ResizeObserverCallback) {
            let raf = 0
            super((entries, observer) => {
                // the previous measurement is discarded if another arrives before the next frame
                cancelAnimationFrame(raf)
                raf = requestAnimationFrame(() => cb(entries, observer))
            })
        }
    }
}

/*
    ReactDOM is published for extensions that bring React libraries of their own, such as DCE `xyflow`
    (React Flow): their portals have to go through the same react-dom that renders the page.

    React Flow and elk are not published here any more: they live in DCE `xyflow`, so a Kwirth with no
    diagrams does not load them.
*/
window.__kwirth__ = { React, ReactDOM: reactDom, MUI: { material: MUIMaterial, icons: MUIIcons }, kwirthCommon, kwirthCommonFront, kwirthCommonAiFront, codeMirrorView, codeMirrorState, codeMirrorCommands, codeMirrorSearch, codeMirrorLanguage, codeMirrorLangYaml, codeMirrorThemeOneDark, uiwReactCodeMirror, jfvilasReactFileManager: { FileManager: _rfmFileManager }, recharts }
window.__kwirth_plugins__ = {}
window.__kwirth_senders__ = {}
window.__kwirth_themes__ = {}
window.__kwirth_homepages__ = {}
window.__kwirth_dce_factories__ = {}
window.__kwirth_dce__ = {}

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
