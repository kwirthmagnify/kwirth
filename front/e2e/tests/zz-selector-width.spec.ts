import { test, expect } from '@playwright/test'
import { login, clickExtensionMenuItem, dismissOpenDialogs } from './helpers'

/*
    El selector de concesión de una tarjeta de extensión: ancho FIJO y sin tooltip encima del desplegable.

    Dos regresiones reales, las dos del mismo componente (lo comparten AI toolsets y themes):

      · con `minWidth` crecía con cada plugin concedido («agora, pinocchio, excubitor») y descuadraba la
        tarjeta — en una rejilla, una tarjeta no puede cambiar de tamaño por su contenido;
      · el tooltip se pintaba ENCIMA de la lista al desplegarla, tapando las primeras opciones.

    ⚠️ No se concede nada a nadie ni se marca ninguna casilla: eso cambiaría la configuración real. Se abre,
    se mide y se cierra con Escape.
*/
test('el selector de plugins: ancho fijo y sin tooltip al desplegar', async ({ page }) => {
    test.setTimeout(120_000)
    await login(page)
    await dismissOpenDialogs(page)
    await clickExtensionMenuItem(page, 'AI toolsets')

    const dialog = page.getByRole('dialog').filter({ hasText: /Manage AI toolsets/i })
    await dialog.waitFor({ timeout: 20000 })
    await page.waitForTimeout(1500)

    // The width is set by the Select (.MuiInputBase-root) and not by its child: the child measures its
    // content. And only those on the installed cards: the catalogue below has its own version Selects.
    // ⚠️ The filter can NOT be anchored with ^$: MUI puts a zero-width space at the end of the Select's
    // text, so '0.1.0' would never match /^\d+\.\d+\.\d+$/ and the version ones slipped into the measurement.
    const selects = dialog.locator('.MuiInputBase-root:has(.MuiSelect-select)')
        .filter({ hasNotText: /\d+\.\d+\.\d+/ })
    expect(await selects.count(), 'no hay ningun selector en el dialogo').toBeGreaterThan(0)

    // 1. they all measure the same, whether they carry one plugin, three or none
    const anchos = await selects.evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().width)))
    expect(new Set(anchos).size, `anchos distintos entre tarjetas: ${anchos.join(', ')}`).toBe(1)

    // 2. and it does not grow even when the text does not fit (injected into the DOM: nothing is granted)
    const antes = anchos[0]
    await selects.first().locator('.MuiSelect-select')
        .evaluate(e => { e.textContent = 'agora, pinocchio, excubitor, montag, iter' })
    await page.waitForTimeout(200)
    const despues = Math.round(await selects.first().evaluate(e => e.getBoundingClientRect().width))
    expect(despues, `el selector creció de ${antes}px a ${despues}px`).toBe(antes)

    // 3. what overflows is clipped
    const recorte = await selects.first().locator('.MuiSelect-select').evaluate(e => getComputedStyle(e).textOverflow)
    expect(recorte).toBe('ellipsis')

    // 4. on expanding there is NO tooltip covering the list
    await selects.first().click()
    await page.getByRole('listbox').waitFor({ timeout: 5000 })
    await page.waitForTimeout(900)   // el tooltip de MUI tarda en aparecer: hay que darle su oportunidad
    await expect(page.locator('.MuiTooltip-popper'), 'el tooltip tapa el desplegable').toHaveCount(0)
    await page.screenshot({ path: 'test-results/selector-desplegado.png' })
    await page.keyboard.press('Escape')

    await dismissOpenDialogs(page).catch(() => {})
})
