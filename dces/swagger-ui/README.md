# @kwirthmagnify/kwirth-dce-swagger-ui

A **DCE** (dynamic core extension) for [Kwirth](https://kwirthmagnify.dev): it brings [Swagger UI](https://swagger.io/tools/swagger-ui/)
to the core once, so any extension with an HTTP API can serve the page to read and try its OpenAPI document — without
each of them bundling its own 1.5 MB copy.

Swagger UI's files travel **inside** this DCE: the page works in a cluster with no way out to the Internet.

## For a consumer

On the back end, from the extension's own router (express):

```ts
import { getDce, hasDce } from '@kwirthmagnify/kwirth-common-back'
import type { ISwaggerUi } from '@kwirthmagnify/kwirth-dce-swagger-ui'

router.use('/v1/docs', (req, res, next) => {
    if (!hasDce('swagger-ui')) { res.status(503).send('Install the swagger-ui DCE'); return }
    getDce<ISwaggerUi>('swagger-ui').handler({ specUrl: '../openapi.json', title: 'My API' })(req, res, next)
})
```

- `handler(options)` answers the page at the path it is mounted on (redirecting to the same path with a trailing
  slash, so the page's own files resolve next to it), and `swagger-ui.css` / `swagger-ui-bundle.js` under it.
  Anything else is passed on with `next()`.
- `specUrl` is where the page fetches the OpenAPI document from: absolute, or relative to the page.
- `swaggerUiVersion` says which Swagger UI is inside.

The package is installed **for its types only** (`dist/index.d.ts`): at run time the consumer gets the instance the
core keeps, through `getDce()`, so there is one Swagger UI in the core whatever the number of consumers. A consumer
may also declare the contract locally and not install the package at all.

## Installing it in Kwirth

From Kwirth's extensions (type *DCE*). As every DCE, it needs the Kwirth back end restarted.

## Licence

Apache-2.0. Swagger UI is Apache-2.0 too; its licence is in `LICENSE-swagger-ui`.
