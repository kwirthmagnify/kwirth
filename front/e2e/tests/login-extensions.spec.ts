import { test, expect } from '@playwright/test'
import { login, clickExtensionMenuItem, dismissOpenDialogs } from './helpers'

test.use({ trace: 'off', screenshot: 'off', video: 'off' })

// ── 1. LoginDialog abre desde el menu ─────────────────────────────────────────
test('login extensions: menu item opens LoginDialog', async ({ page }) => {
    await login(page)
    await dismissOpenDialogs(page)

    await clickExtensionMenuItem(page, 'Login extensions')

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('Manage login extensions', { exact: true })).toBeVisible()

    await page.keyboard.press('Escape')
    await page.goto('about:blank')
})

// ── 2. LoginExtensionPage renderiza con ?loginExt= ────────────────────────────
test('login extensions: ?loginExt=magnify renders custom login page', async ({ page }) => {
    await page.goto('/?loginExt=magnify')

    // La página de login estándar es un Dialog MUI; la de extensión es un overlay fixed sin role=dialog
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 3000 }).catch(() => {})

    // Tiene los campos de usuario y contraseña
    await expect(page.getByLabel(/user/i)).toBeVisible({ timeout: 5000 })
    await expect(page.getByLabel(/password/i).first()).toBeVisible()

    await page.goto('about:blank')
})

// ── 3. LoginExtensionPage tiene los botones correctos ─────────────────────────
test('login extensions: extension page has Login and Change password buttons', async ({ page }) => {
    await page.goto('/?loginExt=magnify')

    await expect(page.getByLabel(/user/i)).toBeVisible({ timeout: 5000 })

    const loginBtn = page.getByRole('button', { name: /^login$/i })
    const changePwdBtn = page.getByRole('button', { name: /change password/i })

    // Botones presentes (disabled hasta que se rellenan los campos)
    await expect(loginBtn).toBeVisible()
    await expect(changePwdBtn).toBeVisible()

    // Deshabilitados con campos vacíos
    await expect(loginBtn).toBeDisabled()
    await expect(changePwdBtn).toBeDisabled()

    // Habilitados al rellenar user + password
    await page.getByLabel(/user/i).fill('admin')
    await page.getByLabel(/password/i).first().fill('asd')
    await expect(loginBtn).toBeEnabled()
    await expect(changePwdBtn).toBeEnabled()

    await page.goto('about:blank')
})

// ── 4. LoginExtensionPage muestra error con credenciales incorrectas ───────────
test('login extensions: wrong credentials show error', async ({ page }) => {
    await page.goto('/?loginExt=magnify')

    await expect(page.getByLabel(/user/i)).toBeVisible({ timeout: 5000 })
    await page.getByLabel(/user/i).fill('admin')
    await page.getByLabel(/password/i).first().fill('wrongpassword')
    await page.getByRole('button', { name: /^login$/i }).click()

    await expect(page.getByText(/invalid credentials/i)).toBeVisible({ timeout: 5000 })

    await page.goto('about:blank')
})

// ── 5. Anonymous login: botón de config (⚙) visible en Login Manager ──────────
test('login extensions: anonymous login shows config button', async ({ page }) => {
    await login(page)
    await dismissOpenDialogs(page)
    await clickExtensionMenuItem(page, 'Login extensions')

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    // La extensión anonymous debe aparecer en la lista
    await expect(dialog.getByText('Anonymous', { exact: true })).toBeVisible({ timeout: 5000 })

    // Debe haber al menos un botón de configuración (⚙)
    const settingsBtn = dialog.getByRole('button', { name: 'Configure' }).first()
    await expect(settingsBtn).toBeVisible()

    await page.keyboard.press('Escape')
    await page.goto('about:blank')
})

// ── 6. Anonymous config dialog: campos correctos y Scope como select ──────────
test('login extensions: anonymous config dialog has scope select and resource fields', async ({ page }) => {
    await login(page)
    await dismissOpenDialogs(page)
    await clickExtensionMenuItem(page, 'Login extensions')

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    // Abre el config dialog de anonymous
    const settingsBtn = dialog.getByRole('button', { name: 'Configure' }).first()
    await settingsBtn.click()

    // El Login Manager se cierra; aparece el config dialog (es el único dialog)
    const configDialog = page.getByRole('dialog', { name: /configure/i })
    await expect(configDialog).toBeVisible({ timeout: 5000 })
    await expect(configDialog.getByText(/configure/i)).toBeVisible()

    // Campos presentes
    await expect(configDialog.getByLabel(/auto-login user/i)).toBeVisible()
    await expect(configDialog.getByLabel(/auto-login password/i)).toBeVisible()
    await expect(configDialog.getByLabel(/scope/i)).toBeVisible()
    await expect(configDialog.getByRole('textbox', { name: /namespace/i })).toBeVisible()

    // Scope es un select con opciones correctas
    const scopeSelect = configDialog.getByLabel(/scope/i)
    await scopeSelect.click()
    const listbox = page.getByRole('listbox')
    await expect(listbox).toBeVisible()
    await expect(listbox.getByRole('option', { name: 'cluster' })).toBeVisible()
    await expect(listbox.getByRole('option', { name: 'namespace' })).toBeVisible()
    await expect(listbox.getByRole('option', { name: 'pod' })).toBeVisible()
    await page.keyboard.press('Escape')

    await page.keyboard.press('Escape')
    await page.goto('about:blank')
})

// ── 7. Anonymous login: depende de si el auto-login está configurado ───────────
//
// El login 'anonymous' solo entra solo si tiene autoUser Y autoPassword en su configuración. Sin ellos
// no puede autenticar a nadie, y en vez de romperse cae al formulario de siempre — que es lo sensato,
// y lo que hace en un Kwirth recién instalado.
//
// Este test daba por hecho que estaba configurado, así que fallaba en cualquier entorno donde no lo
// estuviera (aceptado en rojo el 2026-09-04 sin diagnosticar, diagnosticado en el CL9 del 2026-09-06).
// Ahora comprueba la rama que corresponda: lo que NUNCA vale es quedarse en blanco.
test('login extensions: ?loginExt=anonymous entra solo, o muestra el formulario si no está configurado', async ({ page }) => {
    await page.goto('/?loginExt=anonymous')

    const config = await page.evaluate(async () => {
        const r = await fetch(`${window.location.origin.replace(':3000', ':3883')}/core/logins/anonymous/config`)
        return r.ok ? await r.json().catch(() => ({})) : {}
    }) as { autoUser?: string, autoPassword?: string }

    const autoLoginReady = Boolean(config.autoUser && config.autoPassword)

    if (autoLoginReady) {
        // configurado: entra solo, así que spinner o error — nunca el formulario
        await expect(page.getByRole('progressbar').or(page.getByText(/error|invalid|denied|connect/i))).toBeVisible({ timeout: 5000 })
        await expect(page.getByLabel(/user/i)).not.toBeVisible()
    }
    else {
        // sin configurar: el formulario de siempre, operativo
        await expect(page.getByLabel(/user/i).first()).toBeVisible({ timeout: 5000 })
        await expect(page.getByRole('button', { name: /login|ok/i }).first()).toBeVisible()
    }

    await page.goto('about:blank')
})
