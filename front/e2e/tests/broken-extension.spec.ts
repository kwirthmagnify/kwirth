import { test, expect } from '@playwright/test'
import { login, assertFrontCompiles, pickCombo, pickLastCombo, dismissOpenDialogs } from './helpers'

/*
    Una extension rota NO puede tumbar Kwirth.

    El caso es real y costo una mañana: un plugin construido contra otra version del barrel de iconos
    devolvia como icono de canal algo que React no sabe pintar, y como ese icono se dibuja en la HOME
    —en las pestañas, en el selector de canales—, React 18 desmontaba el arbol entero. El usuario no veia
    una extension rota: veia Kwirth en blanco, sin una sola pista de quien tenia la culpa.

    Aqui se provoca a proposito, sin tocar el codigo del plugin: se deja cargar su front de verdad y se
    le sustituye `getChannelIcon` por uno que devuelve un elemento con el `type` estropeado, que es
    exactamente la forma del fallo (un objeto sin marca de React, como el namespace de un modulo).

    ⚠️ Un `type` asi es TRUTHY: por eso no basta con comprobar que el elemento existe.
*/

const romperIconoDeCanal = async (page: import('@playwright/test').Page): Promise<void> => {
    await page.addInitScript(() => {
        const almacen: Record<string, unknown> = {}
        Object.defineProperty(window, '__kwirth_plugins__', {
            configurable: true,
            get: () => new Proxy(almacen, {
                set(destino: Record<string, unknown>, clave: string, valor: unknown) {
                    // the FIRST one to register is broken, whichever it is: what is tested is the core
                    if (typeof valor === 'function' && !(window as unknown as { __roto__?: boolean }).__roto__) {
                        ;(window as unknown as { __roto__?: boolean }).__roto__ = true
                        ;(window as unknown as { __rotoId__?: string }).__rotoId__ = clave
                        const proto = (valor as { prototype: { getChannelIcon?: () => unknown } }).prototype
                        const original = proto.getChannelIcon
                        proto.getChannelIcon = function () {
                            const elemento = original?.call(this) as Record<string, unknown>
                            // a valid element whose `type` is a bare object: the exact failure
                            return { ...elemento, type: { esto: 'no es un componente' } }
                        }
                    }
                    destino[clave] = valor
                    return true
                }
            }),
            set: (v: Record<string, unknown>) => { Object.assign(almacen, v) }
        })
    })
}

test('una extension con el icono de canal roto no deja la aplicacion en blanco', async ({ page }) => {
    const avisos: string[] = []
    page.on('console', m => { if (m.type() === 'warning' || m.type() === 'error') avisos.push(m.text()) })

    await romperIconoDeCanal(page)
    await login(page)
    await assertFrontCompiles(page)
    await page.waitForTimeout(3000)

    // what matters: the application IS STILL THERE. With the fault, the body was left empty.
    const texto = await page.locator('body').innerText()
    expect(texto.length, 'la pagina se ha quedado en blanco').toBeGreaterThan(20)
    expect(texto).toContain('Kwirth')

    // and it says WHICH extension it is, which is what was missing in order to fix it
    const roto = await page.evaluate(() => (window as unknown as { __rotoId__?: string }).__rotoId__)
    if (roto) {
        expect(avisos.some(a => a.includes(roto) && a.includes('icon')),
            `ningun aviso menciona '${roto}'; avisos vistos: ${avisos.slice(0, 5).join(' | ')}`).toBe(true)
    }
})

test('el resto de la aplicacion sigue siendo usable', async ({ page }) => {
    await romperIconoDeCanal(page)
    await login(page)
    await assertFrontCompiles(page)
    await page.waitForTimeout(3000)

    // the resource selector responds: it is not just that something is drawn, it is that you can work
    const combo = page.getByRole('combobox').first()
    await expect(combo).toBeVisible({ timeout: 15_000 })
    await combo.click()
    await expect(page.getByRole('listbox')).toBeVisible({ timeout: 10_000 })
    await page.locator('.MuiBackdrop-root').last().click({ force: true })
})

/*
    Y lo mismo con el CONTENIDO de una pestaña: si el canal revienta al pintarse, se cae la pestaña y se
    dice cual, no la aplicacion. Aqui se rompe a proposito el TabContent de un canal —envolviendo su
    clase, que asi vale tanto si la propiedad es de instancia como si es del prototipo— y se abre su
    pestaña por el camino normal.
*/
// A CLUSTER channel that draws as soon as it is added: with no setup in between, the content — and hence
// the boundary — is visible the moment the tab opens.
const CANAL_DE_PRUEBA = 'provider-debug'

const romperContenidoDelCanal = async (page: import('@playwright/test').Page): Promise<void> => {
    await page.addInitScript((CANAL: string) => {
        const almacen: Record<string, unknown> = {}
        Object.defineProperty(window, '__kwirth_plugins__', {
            configurable: true,
            get: () => new Proxy(almacen, {
                set(destino: Record<string, unknown>, clave: string, valor: unknown) {
                    if (clave === CANAL && typeof valor === 'function') {
                        const Original = valor as new (...args: unknown[]) => Record<string, unknown>
                        const Roto = class extends Original {
                            constructor(...args: unknown[]) {
                                super(...args)
                                this.TabContent = () => { throw new Error('boom de prueba') }
                            }
                        }
                        destino[clave] = Roto
                        return true
                    }
                    destino[clave] = valor
                    return true
                }
            }),
            set: (v: Record<string, unknown>) => { Object.assign(almacen, v) }
        })
    }, CANAL_DE_PRUEBA)
}

test('un canal que revienta al pintarse se lleva su pestaña, no la aplicacion', async ({ page }) => {
    await romperContenidoDelCanal(page)
    await login(page)
    await assertFrontCompiles(page)
    await dismissOpenDialogs(page)

    // Cluster -> vista cluster -> canal log -> ADD
    await pickCombo(page, 0, 'inCluster')
    await page.waitForTimeout(600)
    await pickCombo(page, 1, 'cluster')
    await page.waitForTimeout(600)
    await pickLastCombo(page, CANAL_DE_PRUEBA)
    await page.getByRole('button', { name: 'ADD' }).click()
    await page.waitForTimeout(2500)
    await dismissOpenDialogs(page)

    // the boundary's message, with the channel's name: without it there is no telling what to uninstall
    const aviso = page.getByText('This channel stopped working')
    await expect(aviso).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('boom de prueba')).toBeVisible()

    // and the application is still whole around it
    await expect(page.getByRole('combobox').first()).toBeVisible()
})
