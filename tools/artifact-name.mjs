/*  El único sitio del que sale el nombre de un artefacto de Kwirth.
 *
 *  Formato (PRD iria/plans/artifact-naming/PRD.md):
 *
 *      paquete npm   @<scope>/kwirth-<type>-<id>              @iriaoperae/kwirth-plugin-excubitor
 *      tarball       <scope>-kwirth-<type>-<id>-<version>.tgz iriaoperae-kwirth-plugin-excubitor-0.2.63.tgz
 *
 *  Antes esto vivía interpolado dentro de cada uno de los siete scaffolders. Coincidían porque se fueron
 *  alineando a mano uno por uno, que es exactamente la forma en que acabaron desalineados la vez anterior:
 *  el tipo `login` llegó a generar un nombre que no usaba ningún login del repo.
 *
 *  🔴 El `kwirth-` del medio NO es redundante, aunque lo pareciera. Se llegó a quitar, y se revirtió: el
 *  scope dice de QUIÉN es el paquete, no de qué ECOSISTEMA. Un scope de Kwirth y solo de Kwirth
 *  (@kwirthmagnify, @iriaoperae) es la excepción, no la norma: el marketplace es abierto, así que un
 *  tercero publica desde su propio scope, donde conviven sus paquetes de otros productos. @jfvilas, sin ir
 *  más lejos, publica para Grafana, para Backstage y para Kwirth. Y hay algo peor que la ambigüedad:
 *  `@scope/plugin-<id>` es LA convención de Backstage (@backstage/plugin-catalog), así que sin el
 *  `kwirth-` un plugin nuestro no es que no diga de qué es — es que parece de otro producto, y dos
 *  `plugin-foo` de ecosistemas distintos no podrían convivir en el mismo scope.
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

/** El nombre del paquete npm: '@iriaoperae/kwirth-plugin-excubitor'. */
export const artifactName = (publisher, type, id) => `@${scopeOf(publisher)}/kwirth-${type}-${id}`

/** El nombre del tarball: 'iriaoperae-kwirth-plugin-excubitor-0.2.63.tgz', igual que lo haría `npm pack`. */
export const tarballName = (publisher, type, id, version) => `${scopeOf(publisher)}-kwirth-${type}-${id}-${version}.tgz`
