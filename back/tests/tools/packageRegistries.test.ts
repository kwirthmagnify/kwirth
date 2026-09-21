import { test } from 'node:test'
import assert from 'node:assert/strict'
import { matchRegistry, basicHeader, bearerHeader, authHeader, packageHeaders, configurePackageRegistries, readTarballFile, cachedExtensionFile, dropCachedExtensionFiles } from '../../src/tools/PackageRegistries'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { IConfigMaps } from '../../src/tools/IConfigMap'
import { ISecrets } from '../../src/tools/ISecrets'
import { IPackageRegistry, EPackageRegistryAuthType } from '@kwirthmagnify/kwirth-common'

// De donde se baja un paquete NO es el marketplace: el manifest solo lo lista, y su url puede apuntar a
// cualquier sitio — el marketplace publico ya tiene los manifests en GitHub y los tarballs en npmjs. Por
// eso la credencial de descarga se elige casando la URL del tarball, y no por el marketplace de origen.

const reg = (id: string, url: string, enabled = true, auth?: IPackageRegistry['auth']): IPackageRegistry =>
    ({ id, label: id, url, enabled, auth })

const NEXUS = 'https://nexus.plexus.services/repository/031-299-IriaOperae'
const TGZ = `${NEXUS}/@iriaoperae/kwirth-docs-agora/-/kwirth-docs-agora-0.1.33.tgz`

test('la URL de un tarball casa con el registro que la sirve', () => {
    assert.equal(matchRegistry(TGZ, [reg('nexus', NEXUS)])?.id, 'nexus')
})

test('una URL de otro sitio no casa: se baja anonima', () => {
    const npmjs = 'https://registry.npmjs.org/@kwirthmagnify/kwirth-plugin-log/-/kwirth-plugin-log-1.0.0.tgz'
    assert.equal(matchRegistry(npmjs, [reg('nexus', NEXUS)]), undefined)
})

test('gana el prefijo MAS LARGO, para que lo especifico pueda ganarle a lo general', () => {
    const registries = [reg('todo-el-nexus', 'https://nexus.plexus.services'), reg('solo-mi-repo', NEXUS)]
    assert.equal(matchRegistry(TGZ, registries)?.id, 'solo-mi-repo')
    // y el orden en la lista no debe influir
    assert.equal(matchRegistry(TGZ, [...registries].reverse())?.id, 'solo-mi-repo')
})

test('un registro deshabilitado no inyecta su credencial', () => {
    assert.equal(matchRegistry(TGZ, [reg('nexus', NEXUS, false)]), undefined)
})

test('la barra final del registro es indiferente', () => {
    assert.equal(matchRegistry(TGZ, [reg('nexus', NEXUS + '/')])?.id, 'nexus')
})

test('el prefijo casa por SEGMENTO, no por texto suelto', () => {
    // '.../031-299-IriaOperae' no debe casar con '.../031-299-IriaOperae-privado', que es otro repo
    const otro = `https://nexus.plexus.services/repository/031-299-IriaOperae-privado/x/-/x-1.0.0.tgz`
    assert.equal(matchRegistry(otro, [reg('nexus', NEXUS)]), undefined)
})

test('la ruta distingue mayusculas, el host no', () => {
    // el repo se llama '031-299-IriaOperae': escrito de otra forma es OTRO repo
    assert.equal(matchRegistry(TGZ, [reg('nexus', NEXUS.toLowerCase())]), undefined)
    const hostRaro = TGZ.replace('nexus.plexus.services', 'NEXUS.Plexus.Services')
    assert.equal(matchRegistry(hostRaro, [reg('nexus', NEXUS)])?.id, 'nexus')
})

test('la URL exacta del registro tambien casa consigo misma', () => {
    assert.equal(matchRegistry(NEXUS, [reg('nexus', NEXUS)])?.id, 'nexus')
})

test('la cabecera Basic lleva usuario y contraseña en base64', () => {
    const header = basicHeader('kwirth', 's3cr3t')
    assert.equal(header.Authorization, 'Basic ' + Buffer.from('kwirth:s3cr3t').toString('base64'))
})

test('sin usuario o sin contraseña la cabecera sigue siendo valida', () => {
    // Un PAT suele ir como contraseña con usuario vacio; que no reviente ni mande 'undefined'
    assert.equal(basicHeader(undefined, 'pat').Authorization, 'Basic ' + Buffer.from(':pat').toString('base64'))
})

test('con auth NONE hay registro pero no credenciales que inyectar', () => {
    const r = reg('nexus', NEXUS, true, { type: EPackageRegistryAuthType.NONE })
    assert.equal(matchRegistry(TGZ, [r])?.auth?.type, EPackageRegistryAuthType.NONE)
    assert.deepEqual(authHeader(r.auth, 'lo-que-sea'), {})
})

// ⚠️ Bearer y Basic NO son intercambiables, aunque el token parezca una credencial codificada. Verificado
// contra el Nexus real: el mismo user token da 200 como Bearer y 401 como Basic. Y el token es OPACO, no
// un base64 de 'usuario:contraseña', asi que tampoco se puede traducir de un esquema al otro.

test('el token de un registro viaja como Bearer, TAL CUAL, sin recodificar', () => {
    // ⚠️ Un literal con FORMA de credencial real (aqui era 'NpmToken.<uuid>') hace que el escaneo de
    // secretos de GitHub bloquee el push, y con razon: no puede saber que es de mentira. En los tests, un
    // valor que no se parezca a nada.
    const token = 'fake-opaque-registry-token'
    assert.equal(bearerHeader(token).Authorization, `Bearer ${token}`)
})

test('authHeader elige el esquema por el TIPO, no por lo que parezca el secreto', () => {
    const token = 'fake-opaque-token'
    const bearer = authHeader({ type: EPackageRegistryAuthType.BEARER }, token)
    const basic = authHeader({ type: EPackageRegistryAuthType.BASIC, username: 'u' }, token)
    assert.equal(bearer.Authorization, `Bearer ${token}`)
    assert.equal(basic.Authorization, 'Basic ' + Buffer.from(`u:${token}`).toString('base64'))
    assert.notEqual(bearer.Authorization, basic.Authorization, 'mandar el uno por el otro es un 401')
})

test('en Bearer el username no pinta nada', () => {
    const conUsuario = authHeader({ type: EPackageRegistryAuthType.BEARER, username: 'sobra' }, 'tok')
    assert.equal(conUsuario.Authorization, 'Bearer tok')
})

test('sin secreto guardado la cabecera no se inventa nada', () => {
    assert.equal(authHeader({ type: EPackageRegistryAuthType.BEARER }, undefined).Authorization, 'Bearer ')
    assert.equal(authHeader(undefined, 'tok').Authorization, undefined)
})

// ⚠️ packageHeaders() sale por `if (!deps) return {}` mientras nadie haya llamado a
// configurePackageRegistries(). No es un detalle: una descarga hecha antes de ese momento va ANONIMA, y
// contra un registro privado eso es un 401 — pero solo al arrancar, porque instalar lo mismo desde la UI
// ocurre despues y si lleva credenciales. Paso de verdad: el core rehidrataba las extensiones instaladas
// en prepareRunningInstance() y configuraba esto mas tarde, en setUpRoutes(), y las docs de service-flow
// del Nexus fallaban con 401 en cada arranque.
//
// Estos dos tests fijan el contrato de las dos caras. El orden importa y por eso el 'sin configurar' va
// primero: `deps` es estado de modulo y no hay forma de desconfigurarlo.

test('sin configurar, packageHeaders NO manda credenciales (y la descarga saldria anonima)', async () => {
    assert.deepEqual(await packageHeaders(TGZ), {})
})

test('configurado, packageHeaders inyecta la credencial del registro que sirve esa URL', async () => {
    const registry = reg('nexus', NEXUS, true, { type: EPackageRegistryAuthType.BASIC, username: 'iriaoperae' })
    const configMaps = { read: async () => ({ packageRegistries: [registry] }) } as unknown as IConfigMaps
    const secrets = { readAllKeys: async () => ({ nexus: 'fake-stored-password' }) } as unknown as ISecrets

    configurePackageRegistries(configMaps, secrets)

    assert.deepEqual(await packageHeaders(TGZ), basicHeader('iriaoperae', 'fake-stored-password'))
    // una URL que no sirve ese registro sigue bajando anonima aunque ya este todo configurado
    assert.deepEqual(await packageHeaders('https://registry.npmjs.org/x/-/x-1.0.0.tgz'), {})
})

// ── readTarballFile ─────────────────────────────────────────────────────────────
//
// Un tarball extraido puede tener las entradas en la raiz (los tgz que armamos a mano: docs, logins) o
// dentro de 'package/' (todo lo que sale de `npm publish`). El install() de cada manager ya probaba las
// dos rutas, pero la RECUPERACION mirando solo la raiz dejaba fuera justo a los paquetes del registro:
// un back.js que no cabe en el ConfigMap se baja del origen EN CADA ARRANQUE, asi que la extension se
// instalaba bien y desaparecia al primer reinicio. Lo canto el provider 'trivy' (15,8 MB de bundle).

const extractDir = (layout: Record<string, string>): string => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'kwirth-tarball-test-'))
    for (const [rel, content] of Object.entries(layout)) {
        const full = path.join(dir, rel)
        mkdirSync(path.dirname(full), { recursive: true })
        writeFileSync(full, content)
    }
    return dir
}

test('lo lee de la raiz del extract (tgz armado a mano)', () => {
    const dir = extractDir({ 'back.js': 'raiz' })
    assert.equal(readTarballFile(dir, 'back.js'), 'raiz')
    rmSync(dir, { recursive: true, force: true })
})

test('lo lee de package/ (formato npm: el caso del provider trivy)', () => {
    const dir = extractDir({ 'package/back.js': 'dentro-de-package', 'package/package.json': '{}' })
    assert.equal(readTarballFile(dir, 'back.js'), 'dentro-de-package')
    rmSync(dir, { recursive: true, force: true })
})

test('si esta en los dos sitios gana la raiz, como en el install()', () => {
    const dir = extractDir({ 'back.js': 'raiz', 'package/back.js': 'dentro-de-package' })
    assert.equal(readTarballFile(dir, 'back.js'), 'raiz')
    rmSync(dir, { recursive: true, force: true })
})

test('devuelve undefined —sin lanzar— cuando el fichero no esta en ninguno de los dos sitios', () => {
    const dir = extractDir({ 'package/package.json': '{}' })
    assert.equal(readTarballFile(dir, 'back.js'), undefined)
    rmSync(dir, { recursive: true, force: true })
})

test('cada fichero se busca por su nombre: front.js y back.js no se confunden', () => {
    const dir = extractDir({ 'package/back.js': 'el-back', 'package/front.js': 'el-front' })
    assert.equal(readTarballFile(dir, 'back.js'), 'el-back')
    assert.equal(readTarballFile(dir, 'front.js'), 'el-front')
    rmSync(dir, { recursive: true, force: true })
})

test('solo mira esos dos sitios: un back.js mas profundo NO se da por bueno', () => {
    const dir = extractDir({ 'package/dist/back.js': 'demasiado-profundo' })
    assert.equal(readTarballFile(dir, 'back.js'), undefined)
    rmSync(dir, { recursive: true, force: true })
})

// ── cache en /tmp del js que se baja del origen ──────────────────────────────────
//
// Un back que no cabe en el ConfigMap se vuelve a bajar del origen. Sin cache eso es un tarball entero
// por arranque (914 KB en el provider 'trivy') y, si el registro no responde en ese momento, la extension
// no carga. Y la cache HAY que invalidarla: no lleva la version en el nombre —quien la lee al arrancar
// solo conoce el id— asi que sin borrarla una actualizacion seguiria cargando el js VIEJO.

test('el nombre de la cache sale del tipo, el id y el fichero', () => {
    const back = cachedExtensionFile('provider', 'trivy', 'back.js')
    assert.equal(path.basename(back), 'kwirth-provider-trivy-back.js')
    assert.equal(path.dirname(back), os.tmpdir())
    assert.equal(path.basename(cachedExtensionFile('plugin', 'montag', 'front.js')), 'kwirth-plugin-montag-front.js')
})

test('invalidar borra el back y el front de esa extension, y nada mas', () => {
    const otro = cachedExtensionFile('provider', 'otro', 'back.js')
    const back = cachedExtensionFile('provider', 'trivy', 'back.js')
    const front = cachedExtensionFile('provider', 'trivy', 'front.js')
    for (const f of [otro, back, front]) writeFileSync(f, 'x')

    dropCachedExtensionFiles('provider', 'trivy')

    assert.equal(existsSync(back), false, 'el back cacheado se va')
    assert.equal(existsSync(front), false, 'y el front tambien')
    assert.equal(existsSync(otro), true, 'pero no se toca la cache de otra extension')
    rmSync(otro, { force: true })
})

test('invalidar lo que no existe no es un error: no puede romper una instalacion', () => {
    assert.doesNotThrow(() => dropCachedExtensionFiles('sender', 'nunca-instalado'))
})
