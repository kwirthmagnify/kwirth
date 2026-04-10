import ReactDOM from 'react-dom/client'
import App from './App'
import { SnackbarProvider } from 'notistack'
import { BrowserRouter } from 'react-router-dom'
// @ts-ignore
import './index.css'

const isElectron = true
//const isElectron = navigator.userAgent.toLowerCase().indexOf(' electron/') >= 0

var rootPath = (window.__PUBLIC_PATH__ || '/').trim().toLowerCase()
if (rootPath.endsWith('/')) rootPath=rootPath.substring(0,rootPath.length-1)
if (rootPath.endsWith('/front')) rootPath=rootPath.substring(0,rootPath.length-6)

console.log(`Environment: ${process.env.NODE_ENV}`)
console.log(`Front running inside electron: ${isElectron}`)
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
			<App backendUrl={backendUrl} isElectron={isElectron} auth={auth.auth}/>
		</SnackbarProvider>
	</BrowserRouter>
	//</React.StrictMode>
)
