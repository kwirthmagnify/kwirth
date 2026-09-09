import { test } from 'node:test'
import assert from 'node:assert/strict'
import { matchRegistry, basicHeader, bearerHeader, authHeader } from '../../src/tools/PackageRegistries'
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
