import { test } from 'node:test'
import assert from 'node:assert/strict'
import { matchRegistry, basicHeader, bearerHeader, authHeader, packageHeaders, configurePackageRegistries, readTarballFile, cachedExtensionFile, dropCachedExtensionFiles } from '../../src/tools/PackageRegistries'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { IConfigMaps } from '../../src/tools/IConfigMap'
import { ISecrets } from '../../src/tools/ISecrets'
import { IPackageRegistry, EPackageRegistryAuthType } from '@kwirthmagnify/kwirth-common'

// Where a package is downloaded from is NOT the marketplace: the manifest merely lists it, and its url
// may point anywhere — the public marketplace already has the manifests on GitHub and the tarballs on
// npmjs. That is why the download credential is chosen by matching the tarball's URL, and not by the
// marketplace it came from.

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
    // and the order in the list must not matter
    assert.equal(matchRegistry(TGZ, [...registries].reverse())?.id, 'solo-mi-repo')
})

test('un registro deshabilitado no inyecta su credencial', () => {
    assert.equal(matchRegistry(TGZ, [reg('nexus', NEXUS, false)]), undefined)
})

test('la barra final del registro es indiferente', () => {
    assert.equal(matchRegistry(TGZ, [reg('nexus', NEXUS + '/')])?.id, 'nexus')
})

test('el prefijo casa por SEGMENTO, no por texto suelto', () => {
    // '.../031-299-IriaOperae' must not match '.../031-299-IriaOperae-privado', which is another repo
    const otro = `https://nexus.plexus.services/repository/031-299-IriaOperae-privado/x/-/x-1.0.0.tgz`
    assert.equal(matchRegistry(otro, [reg('nexus', NEXUS)]), undefined)
})

test('la ruta distingue mayusculas, el host no', () => {
    // the repo is called '031-299-IriaOperae': written any other way it is a DIFFERENT repo
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
    // A PAT usually travels as a password with an empty user; it must neither blow up nor send 'undefined'
    assert.equal(basicHeader(undefined, 'pat').Authorization, 'Basic ' + Buffer.from(':pat').toString('base64'))
})

test('con auth NONE hay registro pero no credenciales que inyectar', () => {
    const r = reg('nexus', NEXUS, true, { type: EPackageRegistryAuthType.NONE })
    assert.equal(matchRegistry(TGZ, [r])?.auth?.type, EPackageRegistryAuthType.NONE)
    assert.deepEqual(authHeader(r.auth, 'lo-que-sea'), {})
})

// ⚠️ Bearer and Basic are NOT interchangeable, even though the token looks like an encoded credential.
// Verified against the real Nexus: the same user token gives 200 as Bearer and 401 as Basic. And the
// token is OPAQUE, not a base64 of 'user:password', so it cannot be translated from one scheme to the other.

test('el token de un registro viaja como Bearer, TAL CUAL, sin recodificar', () => {
    // ⚠️ A literal SHAPED like a real credential (here it was 'NpmToken.<uuid>') makes GitHub's secret
    // scanning block the push, and rightly so: it cannot know it is fake. In tests, a value that looks
    // like nothing at all.
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

// ⚠️ packageHeaders() leaves through `if (!deps) return {}` for as long as nobody has called
// configurePackageRegistries(). That is no detail: a download made before that moment goes ANONYMOUS, and
// against a private registry that is a 401 — but only at startup, because installing the same thing from
// the UI happens later and does carry credentials. It really happened: the core rehydrated the installed
// extensions in prepareRunningInstance() and configured this later, in setUpRoutes(), and service-flow's
// docs from the Nexus failed with 401 on every startup.
//
// These two tests pin down both sides of the contract. Order matters, which is why the 'unconfigured' one
// goes first: `deps` is module state and there is no way to unconfigure it.

test('sin configurar, packageHeaders NO manda credenciales (y la descarga saldria anonima)', async () => {
    assert.deepEqual(await packageHeaders(TGZ), {})
})

test('configurado, packageHeaders inyecta la credencial del registro que sirve esa URL', async () => {
    const registry = reg('nexus', NEXUS, true, { type: EPackageRegistryAuthType.BASIC, username: 'iriaoperae' })
    const configMaps = { read: async () => ({ packageRegistries: [registry] }) } as unknown as IConfigMaps
    const secrets = { readAllKeys: async () => ({ nexus: 'fake-stored-password' }) } as unknown as ISecrets

    configurePackageRegistries(configMaps, secrets)

    assert.deepEqual(await packageHeaders(TGZ), basicHeader('iriaoperae', 'fake-stored-password'))
    // a URL that registry does not serve still downloads anonymously even with everything configured
    assert.deepEqual(await packageHeaders('https://registry.npmjs.org/x/-/x-1.0.0.tgz'), {})
})

// ── readTarballFile ─────────────────────────────────────────────────────────────
//
// An extracted tarball may have its entries at the root (the tgz files we build by hand: docs, logins) or
// inside 'package/' (everything that comes out of `npm publish`). Each manager's install() already tried
// both paths, but RECOVERY looking only at the root left out precisely the registry's packages: a back.js
// that does not fit in the ConfigMap is downloaded from its origin ON EVERY STARTUP, so the extension
// installed correctly and vanished at the first restart. The 'trivy' provider gave it away (a 15.8 MB bundle).

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

// ── /tmp cache of the js downloaded from the origin ─────────────────────────────
//
// A back end that does not fit in the ConfigMap gets downloaded from its origin again. With no cache that
// is a whole tarball per startup (914 KB on the 'trivy' provider) and, if the registry does not answer at
// that moment, the extension does not load. And the cache MUST be invalidated: it does not carry the
// version in its name — whoever reads it at startup only knows the id — so without deleting it an update
// would keep loading the OLD js.

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
