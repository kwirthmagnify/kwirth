const { VERSION } = require('./version')
const { app, BrowserWindow,  BaseWindow, nativeImage, ImageView, ipcMain } = require('electron')
const path = require('path')
const portfinder = require('portfinder')
const https = require('https')

ipcMain.handle('kube-api-available', async (event, rawUrl) => {
    return new Promise((resolve) => {
        let timer
        let req

        try {
            const parsedUrl = new URL(rawUrl);
            const options = {
                hostname: parsedUrl.hostname,
                port: parsedUrl.port || 443,
                path: '/version', 
                method: 'GET',
                rejectUnauthorized: false,
            };

            timer = setTimeout(() => {
                if (req) req.destroy()
                resolve(false)
            }, 2500)

            req = https.request(options, (res) => {
                let rawData = '';

                // 1. Vamos acumulando los trozos de texto que llegan
                res.on('data', (chunk) => { rawData += chunk; });

                // 2. Cuando termina la respuesta, intentamos parsear
                res.on('end', () => {
                    clearTimeout(timer)
                
                    if (res.statusCode === 200 || res.statusCode === 401 || res.statusCode === 403) {
                        try {
                            const json = JSON.parse(rawData)
							console.log(json)
                            //if we get a yaml with kind 'Status' its perfect
                            // if we just get a minr, minr, gitVersion... (this is GKE way), it is also ok
                            resolve(json.kind==='Status' || !!(json.major || json.gitVersion))
                        }
                        catch (e) {
                            resolve(false)
                        }
                    }
                    else {
                        resolve(false)
                    }
                })
            })

            req.on('error', () => {
                clearTimeout(timer)
                resolve(false)
            })

            req.end()
        }
        catch (err) {
            if (timer) clearTimeout(timer)
            resolve(false)
        }
    })
})

async function createMainWindow() {
    console.log('Starting Kwirth Desktop...')

	let splash = new BaseWindow({
        width: 450,
        height: 300,
        frame: false,
        alwaysOnTop: true,
        center: true,
		resizable: false,
        show: false
    })

	const splashPath = path.join(__dirname, 'splash.png')
	const splashView = new ImageView()
	const splashImage = nativeImage.createFromPath(splashPath)
	let resizedImage = splashImage.resize({ width: 450, height: 300, quality: 'best' })
	splashView.setImage(resizedImage)
	splash.setContentView(splashView)

	splash.show()

	setTimeout( async () => {
		const win = new BrowserWindow({
			width: 1200,
			height: 800,
			webPreferences: {
				preload: path.join(__dirname, 'preload.js')
			},
			show: false
		})

		portfinder.basePort = 3883
		const port = await portfinder.getPortPromise()
		try {
			process.env.PORT = String(port)
			process.env.AUTH = 'kubeconfig'
			process.env.NODE_ENV = 'production'
			
			const backendDir = path.join(__dirname, 'bundle')
			process.chdir(backendDir)
			
			console.log(`Starting Kwirth Desktop backend at port: '${port}' and home path '${backendDir}'`)
			require('./bundle/bundle.js')
		}
		catch (err) {
			console.error('Error loading backend:', err);
		}

		const loadApp = () => {
			win.loadURL(`http://localhost:${port}/`).then( () => {
				setTimeout(() => {if (splash && !splash.isDestroyed()) splash.destroy()}, 2000)				
			})
			.catch(() => {
				console.log('Waiting for backend to be ready...')
				setTimeout(loadApp, 100)
			})
		}

		loadApp()

		win.once('ready-to-show', () => {
			console.log('Backend is ready and front is rendered. Success!')
			win.show()
			win.focus()
		})
	}, 5000)
}

console.log('Kwirth Desktop version:', VERSION)
app.whenReady().then(createMainWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  process.exit(0)
})