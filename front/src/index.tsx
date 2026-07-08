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
import ReactDOM from 'react-dom/client'
import App from './App'
import { SnackbarProvider } from 'notistack'
import { BrowserRouter } from 'react-router-dom'
// @ts-ignore
import './index.css'

declare global {
    interface Window {
        __kwirth__: { React: typeof React; MUI: { material: typeof MUIMaterial; icons: typeof MUIIcons }; kwirthCommon: typeof kwirthCommon; kwirthCommonFront: typeof kwirthCommonFront; kwirthCommonAiFront: typeof kwirthCommonAiFront; codeMirrorView: typeof codeMirrorView; codeMirrorState: typeof codeMirrorState; codeMirrorCommands: typeof codeMirrorCommands; codeMirrorSearch: typeof codeMirrorSearch; codeMirrorLanguage: typeof codeMirrorLanguage; codeMirrorLangYaml: typeof codeMirrorLangYaml; codeMirrorThemeOneDark: typeof codeMirrorThemeOneDark; uiwReactCodeMirror: typeof uiwReactCodeMirror; jfvilasReactFileManager: { FileManager: typeof _rfmFileManager }; recharts: typeof recharts }
        __kwirth_plugins__: Record<string, any>
        __kwirth_senders__: Record<string, { ConfigDialog?: React.ComponentType<any>; nodeLabel?: string; nodeDescription?: string; nodeIcon?: string }>
        __kwirth_themes__: Record<string, { displayName: string; getThemeOptions: (mode: 'light' | 'dark') => any }>
        __kwirth_homepages__: Record<string, any>
    }
}
window.__kwirth__ = { React, MUI: { material: MUIMaterial, icons: MUIIcons }, kwirthCommon, kwirthCommonFront, kwirthCommonAiFront, codeMirrorView, codeMirrorState, codeMirrorCommands, codeMirrorSearch, codeMirrorLanguage, codeMirrorLangYaml, codeMirrorThemeOneDark, uiwReactCodeMirror, jfvilasReactFileManager: { FileManager: _rfmFileManager }, recharts }
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
