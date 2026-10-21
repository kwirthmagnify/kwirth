/*  El único sitio del que sale el nombre de un artefacto de Kwirth.
 *
 *  Formato (PRD iria/plans/artifact-naming/PRD.md):
 *
 *      paquete npm   @<scope>/<type>-<id>              @iriaoperae/plugin-excubitor
 *      tarball       <scope>-<type>-<id>-<version>.tgz iriaoperae-plugin-excubitor-0.2.63.tgz
 *
 *  Antes esto vivía interpolado dentro de cada uno de los siete scaffolders. Coincidían porque se fueron
 *  alineando a mano uno por uno, que es exactamente la forma en que acabaron desalineados la vez anterior:
 *  el `kwirth-` del medio sobrevivió en unos y no en otros, y el tipo `login` llegó a generar un nombre
 *  que no usaba ningún login del repo.
 *
 *  🔴 El scope NO se escribe nunca: sale del `publisher` del package.json. Hay tres casas y dos son
 *  públicas (@kwirthmagnify y @jfvilas en npm, @iriaoperae en el Nexus privado), así que un literal aquí
 *  es, antes o después, un artefacto de pago anunciándose como OSS.
 *
 *  ⚠️ Los `build.mjs` de los artefactos ya publicados viven en OTROS repos y no pueden importar esto, así
 *  que ahí la derivación sigue siendo inline a partir de `publisher`. Este módulo es para los scaffolders,
 *  que sí comparten repo.
 */

/** '@iriaoperae' → 'iriaoperae'. Lo que npm pone delante del tarball. */
export const scopeOf = (publisher) => {
    if (typeof publisher !== 'string' || !publisher.startsWith('@')) {
        throw new Error(`publisher must be an npm scope starting with '@', got '${publisher}'`)
    }
    return publisher.slice(1)
}

/** El nombre del paquete npm: '@iriaoperae/plugin-excubitor'. */
export const artifactName = (publisher, type, id) => `@${scopeOf(publisher)}/${type}-${id}`

/** El nombre del tarball: 'iriaoperae-plugin-excubitor-0.2.63.tgz', igual que lo haría `npm pack`. */
export const tarballName = (publisher, type, id, version) => `${scopeOf(publisher)}-${type}-${id}-${version}.tgz`
