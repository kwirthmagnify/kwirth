import { test, expect, request as playwrightRequest } from '@playwright/test'
import { login, assertFrontCompiles, dismissOpenDialogs } from './helpers'

/*
    El entorno de ejecucion y las capacidades que se derivan de el.

    Lo que aqui se comprueba es la parte OBSERVABLE del cambio que permitio a Kwirth arrancar fuera de
    Kubernetes: el entorno se publica en vez de perderse al arrancar, y '/healthz' existe siempre y no solo
    dentro de un cluster. El arranque en ECS en si no se puede montar en un e2e —haria falta ECS—, y esa
    parte la cubre el harness de 'back/tests/tools/executionEnvironment.test.ts'.

    NO destructivo: todo son lecturas.
*/

const BACK_URL = process.env.KWIRTH_E2E_BACK_URL ?? 'http://localhost:3883'

// Los valores que puede tomar el entorno. Se listan aqui a proposito, en vez de importar el enum: si
// alguien anade uno nuevo, este test lo obliga a pasar por aqui y decidir que significa para el e2e.
const ENTORNOS = ['kubernetes', 'docker', 'desktop', 'ecs']
const FUENTES = ['kubernetes', 'docker', 'none']

interface IInfo {
    clusterType: string
    executionEnvironment: string
    inCluster: boolean
    channels: { id:string, sources:string[] }[]
}

const leerInfo = async (): Promise<IInfo> => {
    const contexto = await playwrightRequest.newContext({ baseURL: BACK_URL })
    try {
        const respuesta = await contexto.get('/config/info')
        expect(respuesta.status()).toBe(200)
        return await respuesta.json() as IInfo
    }
    finally {
        await contexto.dispose()
    }
}

test('el entorno de ejecucion se publica, y es uno de los conocidos', async () => {
    const info = await leerInfo()
    expect(ENTORNOS, `'${info.executionEnvironment}' no es un entorno conocido`).toContain(info.executionEnvironment)
})

test('la fuente de recursos se publica, y es una de las conocidas', async () => {
    const info = await leerInfo()
    expect(FUENTES, `'${info.clusterType}' no es una fuente conocida`).toContain(info.clusterType)
})

test('healthz responde aunque Kwirth no sea una carga del cluster', async () => {
    const info = await leerInfo()
    // El caso que importa: antes este endpoint solo se montaba con inCluster, y sin el un balanceador
    // externo no puede saber si la instancia esta viva.
    const contexto = await playwrightRequest.newContext({ baseURL: BACK_URL })
    try {
        const respuesta = await contexto.get('/healthz')
        expect(respuesta.status(), `healthz deberia responder tambien con inCluster=${info.inCluster}`).toBe(200)
    }
    finally {
        await contexto.dispose()
    }
})

test('el selector de recursos sigue pintandose tras el cambio de iconos', async ({ page }) => {
    // Regresion: el icono del cluster se decidia por la primera letra del tipo, y con una fuente cuyo
    // nombre no empieza por 'd' ni por 'k' la funcion no devolvia nada.
    await login(page)
    await assertFrontCompiles(page)
    await dismissOpenDialogs(page)
    await expect(page.locator('#root')).toBeVisible()
    await expect(page.locator('iframe#webpack-dev-server-client-overlay')).toHaveCount(0)
})
