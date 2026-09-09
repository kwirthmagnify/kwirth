/*
    Contrato COMUN de configuracion de extensiones.

    Toda extension que publique un formulario de configuracion (senders, webhooks, conectores IdP,
    logins y providers) describe sus campos con ESTE tipo. Antes cada familia tenia el suyo, casi
    identico pero divergente: provider decia 'string' donde el resto decia 'text', solo el tenia
    'default', solo sender y webhook tenian 'common', y su definicion ni siquiera vivia aqui (estaba
    dentro del core, en back/src/tools/ProviderManager.ts).

    OJO: no confundir TConfigFieldType (el tipo de UN CAMPO del formulario) con EExtensionType (el
    tipo de la extension: provider, sender, plugin...), que vive en kwirth-common y es lo que declara
    el package.json del artefacto.
*/

/*
    Tipo de un campo del formulario de configuracion.

    ES UNA UNION DE STRINGS Y NO UN ENUM, A PROPOSITO. No lo conviertas en enum: se probo y se
    revirtio con estas medidas sobre el bundle de senders/console:

        union de strings ..............      3.509 bytes
        enum importado del root .......  15.849.494 bytes   (x4.500)
        enum desde su propio modulo ...      4.790 bytes

    El motivo es que un artefacto solo importa TIPOS de este paquete, y TypeScript los borra al
    compilar, asi que hoy no arrastra ni un byte de kwirth-common-back. Un enum es un VALOR en
    runtime: en cuanto se usa, esbuild tiene que bundlear dist/index.js entero, que reexporta
    KubernetesTools (-> @kubernetes/client-node) y oidc/oauth2 (-> openid-client). Publicar ESM con
    sideEffects:false tampoco lo salva, se probo. Mientras el root de este paquete siga siendo
    pesado, cualquier VALOR que se exporte aqui y usen los artefactos tiene ese coste.

    Lo que hoy pinta el front para cada valor:
      'text'      campo de texto. Es el comportamiento por defecto cuando 'type' se omite.
      'number'    campo numerico.
      'boolean'   switch. Los gestores de sender, webhook, idp y provider lo pintan; el de login no.
      'password'  campo enmascarado con ojo de visibilidad.
      'select'    desplegable alimentado por 'options'. Los gestores de sender, webhook y login lo
                  pintan; los de idp y provider no.
      'json'      area de texto libre para JSON. NINGUN gestor lo pinta todavia: hoy cae a campo de
                  texto. Declararlo es valido, pero no esperes editor estructurado.
*/
export type TConfigFieldType = 'text' | 'number' | 'boolean' | 'password' | 'select' | 'json'

/*
    Un campo del formulario de configuracion de una extension.

    'type' es OPCIONAL a proposito: omitirlo equivale a 'text', que es como estan escritos hoy 25 de
    los 64 campos de los artefactos publicados.
*/
export interface IConfigFieldDef {
    /** Clave con la que el valor se guarda en la configuracion. */
    name: string
    /** Etiqueta que ve el usuario en el formulario. */
    label: string
    /** Ausente = 'text'. */
    type?: TConfigFieldType
    required?: boolean
    /** Valores admitidos cuando 'type' es 'select'. Ignorado en el resto. */
    options?: string[]
    /*
        Etiquetas a mostrar para cada 'options', posicion a posicion; si falta una, se pinta el valor
        crudo. Sirve para desplegables cuyo valor no es presentable tal cual (p.ej. el sender 'timed'
        guarda 'Europe/Madrid' pero muestra 'Europe/Madrid (UTC+2)').
    */
    labels?: string[]
    /** Valor con el que se precarga el campo mientras no haya nada guardado. */
    default?: string | number | boolean
    /** El campo es comun a TODAS las configuraciones de la extension, no propio de cada una. */
    common?: boolean
}

/*
    Descripcion de la extension como nodo de un grafo (el editor de flujos de senders y webhooks).
    'icon' es el nombre de un icono de kwirthicons, no un import de @mui/icons.
*/
export interface IExtensionNodeMeta {
    label: string
    icon?: string
    description?: string
}
