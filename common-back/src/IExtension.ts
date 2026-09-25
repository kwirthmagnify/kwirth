import { IExtensionExportOptions, IExtensionImportResult } from '@kwirthmagnify/kwirth-common'

/*
    Lo comun a TODA extension de Kwirth, sea del tipo que sea.

    Hasta ahora no habia nada comun: un canal no se parece a un provider, ni un sender a un IdP, y cada
    familia tiene su propio contrato. Esto es lo primero que cruza las once — y nace por una necesidad
    muy concreta: el core necesita poder pedirle lo mismo a cualquier extension sin saber que es.

    LOS METODOS SON OPCIONALES, y eso no es tibieza: es lo que permite entregar la portabilidad sin
    republicar de golpe todas las extensiones que ya hay ahi fuera —los siete de pago incluidos—. Una
    extension ya publicada sigue funcionando igual sin tocarla; se suma cuando le toque, en su propio
    ciclo de version. Lo opcional es ADOPTARLO, no cumplirlo: quien implementa uno, implementa los dos.

    Y opcional NO significa que el core supla la ausencia. No hay fallback: si el core copiase por su
    cuenta las claves que conoce de un plugin, produciria un fichero que PARECE llevarlo y que llega al
    destino sin la mitad de su configuracion. Un hueco declarado es mejor que un engaño.

    Ver `plans/config-portability/PRD.md`.
*/
/**
 * What an extension writes its log with. The core builds it knowing who the extension is, so the
 * line comes out identified — '[prov] [ERRO] [longhorn] ...' — and the extension only writes the
 * message.
 *
 * It lives here, and not next to one family's contract, because the need is the same for all of
 * them: before this, anything that was not a channel had only `console.log`, which comes out with no
 * timestamp, no level and no component, and turns a failure into something that reads like a routine
 * trace.
 *
 * Three levels and no more. An `info` nobody can filter out is what buries a log, and a failure that
 * goes out as `info` is a failure nobody sees.
 */
export interface IExtensionLogger {
    info(message: unknown): void
    warning(message: unknown): void
    error(message: unknown): void
}

export interface IExtension {
    /*
        Devuelve la configuracion de esta extension, lista para viajar a otro Kwirth.

        Quien la implementa decide QUE ES configuracion suya, que es justo lo que el core no puede
        saber: en el mismo Postgres de un plugin conviven sus reglas (configuracion) y su histórico
        (datos). Lo segundo NO debe salir de aqui.

        Con `includeCredentials` en false, los campos secreto se devuelven VACIOS —no se omiten—: el
        destino necesita poder decir cuales hay que rellenar.
    */
    exportConfig?(options: IExtensionExportOptions): Promise<unknown>

    /*
        Recibe lo que produjo `exportConfig` —posiblemente en OTRO Kwirth, y posiblemente editado a
        mano, porque el fichero es texto y eso es deseable— y decide que hacer con ello: que acepta,
        que descarta, que reemplaza y que conserva de lo que ya tenia. El core no opina.

        Dos obligaciones de quien lo implementa:
          - VALIDAR. Lo que llega no es de fiar: ni el formato, ni que los recursos que referencia
            existan en este cluster (usuarios, namespaces, uids de cluster de otro sitio).
          - SER IDEMPOTENTE. Importar lo que uno mismo exporto no debe cambiar nada.

        El resultado es lo unico que el core puede contar del contenido en el informe final.
    */
    importConfig?(config: unknown): Promise<IExtensionImportResult>
}
