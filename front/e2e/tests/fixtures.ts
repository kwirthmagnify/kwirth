import { test as base, expect, Page } from '@playwright/test'
import { login, dismissOpenDialogs } from './helpers'

/*
    🔴 LA APLICACION, ARRANCADA UNA VEZ PARA TODA LA CORRIDA.

    Arrancar Kwirth —cargar el bundle de CRA, el login, esperar a que la barra superior pinte y a
    `networkidle`— cuesta entre cuarenta y sesenta segundos, y crece con cada extension instalada en el
    dev. La suite lo pagaba una vez por FICHERO: con medio centenar de specs, eso son unos cincuenta
    minutos de una corrida de cien. La mitad del tiempo era arrancar la misma aplicacion una y otra vez.

    El fixture es de ambito `worker` y la corrida va con `workers: 1`, asi que se abre UNA vez y la
    heredan todos los ficheros que lo piden. Es el mismo patron que el e2e de montag, que bajo de quince
    minutos a minuto y medio.

    ── Quien NO puede heredarla ───────────────────────────────────────────────────────────────────────

    No es una lista de excepciones molestas: es la frontera de lo que el fixture significa. Siguen
    abriendo su propia pagina, con `browser.newPage()` y el `test` de Playwright de siempre:

      · los que prueban el PROPIO arranque: `login-idp-password`, `broken-extension` (inyecta un canal
        que revienta en el almacen ANTES de entrar), `login-extensions` (navega a `?loginExt=`)
      · los que entran por una URL que no es la raiz: `sso-result-messages` (`?ssoerror=`), `signup-ui`
        (`?signup=`), `capture-signup`
      · los que ESPIAN las peticiones del arranque, que es justo lo que una sesion heredada ya no hace:
        `config-bundle`, `dce-api`, `dce-nettools` (capturan la cabecera Authorization), y
        `extension-catalogs`, cuyo propio comentario explica que el espia va antes del login o no ve
        nada
      · los `capture-*`, que cambian tema y estado para fotografiarlos y quedan fuera de la corrida por
        defecto

    ── El precio, y por que la limpieza NO es automatica ──────────────────────────────────────────────

    Compartir pagina significa que lo que un fichero deja abierto rompe al siguiente. La tentacion es un
    fixture `auto` que barra los dialogos antes de cada test, como hace montag; aqui NO sirve, y se probo:
    media docena de specs del core —los gestores de extensiones, sobre todo— abren su dialogo UNA vez en
    el `beforeAll` y lo recorren a lo largo de varios tests, asi que un barrido por test les cierra en la
    cara justo lo que estan mirando. En montag no pasa porque cada uno de sus tests abre y cierra lo suyo.

    La limpieza va donde pertenece: en el `afterAll` de cada fichero, que es quien sabe lo que abrio.
    Todos los que heredan la sesion lo tienen. Un spec que ademas deje ESTADO —algo guardado, una
    extension instalada— tiene que limpiarlo el, como ya hacia cuando la pagina era suya: compartirla no
    cambia esa responsabilidad, solo la hace visible antes.
*/

export const test = base.extend<object, { kwirth: Page }>({
    kwirth: [async ({ browser }, use) => {
        const page = await browser.newPage()
        await login(page)
        await dismissOpenDialogs(page)
        await use(page)
        await page.close()
    }, { scope: 'worker' }]
})

export { expect }
