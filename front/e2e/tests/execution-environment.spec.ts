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

// The values the environment can take. They are listed here on purpose rather than importing the enum:
// if somebody adds a new one, this test forces them through here to decide what it means for the e2e.
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
    // The case that matters: this endpoint used to be mounted only with inCluster, and without it an
    // external load balancer cannot tell whether the instance is alive.
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
    // Regression: the cluster's icon was decided by the type's first letter, and with a source whose
    // name starts with neither 'd' nor 'k' the function returned nothing.
    await login(page)
    await assertFrontCompiles(page)
    await dismissOpenDialogs(page)
    await expect(page.locator('#root')).toBeVisible()
    await expect(page.locator('iframe#webpack-dev-server-client-overlay')).toHaveCount(0)
})
