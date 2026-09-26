// An extension's guide is served by the core itself, at /core/docs/<type>/<id>, ever since 'docs' became
// an installable extension type. So the URL is DERIVABLE from the cluster and there is nothing to configure.
//
// It lives here, rather than copied into each plugin, because of a real failure: agora asked for it in a
// field on its settings screen, somebody typed it without the `/core`, and its help button spent months
// returning 404 with nobody noticing — because HelpButton, when passed no base, went to a
// `http://localhost:4000` that exists in no cluster. That default is gone: with no base, no button is drawn.
//
// Excubitor repeated the same string by hand in 20 files and iter in 9. Repeating it is not merely ugly:
// it means that when the route changes, thirty places will have to be remembered.

export const docsUrl = (clusterUrl: string | undefined, targetType: string, id: string): string =>
    `${(clusterUrl ?? '').replace(/\/+$/, '')}/core/docs/${targetType}/${id}`

/** Shortcut for the common case: a plugin's guide. */
export const pluginDocsUrl = (clusterUrl: string | undefined, pluginId: string): string =>
    docsUrl(clusterUrl, 'plugin', pluginId)
