# Mezclar ficheros de configuración — PLAN

> **ESTADO — implementado, pendiente de QA (2026-11-19).** Pasos 1-5 hechos; falta la captura de la
> guía. `kwirth-common@0.5.92` publicado. Cuelga de [PRD.md](PRD.md) (validado 2026-11-19), que manda
> sobre el qué y el porqué; aquí está el cómo. El usuario pidió **un stream**: es casi todo front.

## Lo que ya existe y se reutiliza

| pieza | dónde | qué aporta |
|---|---|---|
| El formato | `common/src/ConfigBundle.ts` | `IConfigBundle`, `CONFIG_BUNDLE_KIND`, `CONFIG_BUNDLE_FORMAT_VERSION` (2), `bundleEntryKey` |
| Validar un fichero | `validateBundle` (estaba en `back/src/tools/ConfigBundleManager.ts`) | rechaza lo que no es de Kwirth o no se sabe leer |
| Leer el formato 1 | `normalizeEntry` (ídem) | las dos partes de una entrada, sea cual sea la versión |
| La configuración actual | `GET /core/config-bundle/export?credentials=` | la fuente *This Kwirth* es exactamente este export |
| El diálogo | `front/src/components/settings/SettingsKwirth.tsx` | las pestañas de *Kwirth settings*, con su enum `ESettingsKwirthTab` |

## Decisión técnica: la mezcla vive en el navegador, el motor en `common`

Mezclar no toca este Kwirth y los ficheros ya están en el navegador: mandarlos al back y de vuelta no
aporta nada. Para que siga habiendo **una sola** implementación del formato:

- `validateBundle` y `normalizeEntry` **se mueven** de `ConfigBundleManager.ts` a
  `common/src/ConfigBundle.ts`; el back las importa de `kwirth-common` y se borran las copias locales.
- El motor de mezcla es **puro** y vive en `common/src/ConfigBundleMerge.ts`, probado con el harness de
  `common` (`npm test`).

Sin endpoints nuevos. La fuente *This Kwirth* usa el export que ya existe (clave válida + scope admin).

## Tipos nuevos (en `common`, a validar)

```ts
export enum EConfigMergeItemKind { SETTING, MARKETPLACE, PACKAGE_REGISTRY, TRUSTED_PROXY,
    LOGIN_IP_ALLOWED, LOG_LEVEL, AI_PROVIDER, AI_MODEL, EXTENSION }
export interface IConfigMergeSource { name: string; bundle: IConfigBundle }     // ya validado
export interface IConfigMergeValue { sourceIndex: number; value: unknown }
export interface IConfigMergeDifference { key: string; kind: EConfigMergeItemKind; label: string; values: IConfigMergeValue[] }
export interface IConfigMergeAnalysis { merged: Partial<Record<EConfigMergeItemKind, number>>; differences: IConfigMergeDifference[]; warnings: string[] }
export type TConfigMergeChoices = Record<string, number>                        // difference key → sourceIndex

analyzeMerge(sources): IConfigMergeAnalysis
buildMerged(sources, choices, kwirthVersion, exportedAt): IConfigBundle        // lanza si falta una elección
```

## El stream

1. **common**: mover `validateBundle`/`normalizeEntry`; tipos y motor; tests (una fuente, idénticas,
   cada tipo en los tres casos, igualdad sin orden de claves, formato 1 + 2, elección que falta o que no
   existe, `includesCredentials`, aviso de modelo sin proveedor, contenedores vacíos); publicar
   `kwirth-common`.
2. **back**: importar de `kwirth-common`, borrar las copias, ajustar los imports del test; tests verdes.
3. **front**: valor `PORTABILITY` en `ESettingsKwirthTab` y la pestaña:
   - **Fuentes**: *Add files*, *Add this Kwirth* + *Include credentials*; tabla con nombre, fecha,
     versión, credenciales, entradas y quitar. Un fichero inválido se rechaza con el motivo.
   - **Diferencias**: tabla ordenable y de columnas ajustables, ancho fijo; un selector por fila; atajo
     total / pendientes. **Rehecho tras el QA (2026-11-19)**: fuentes en lista numerada con el
     **orden de mezcla** (↑/↓), y cada diferencia dice **qué campo** difiere con una opción por fuente;
     fuera la tabla con una columna por fuente y el atajo. Y un secreto vaciado por un export sin
     credenciales (`''`, campo ausente, notas `schemaKnown`/`omitted`) **no es diferencia**
     (`kwirth-common@0.5.94`).
   - **Resumen** de lo que entra solo y avisos.
   - **Download merged file**, deshabilitado sin fuentes o con pendientes.
4. **e2e** con dos ficheros de prueba (sin secretos reales); no destructivo.
5. **Docs**: sección *Portability* en la guía; changelog; índice de planes. CL9.
