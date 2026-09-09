# Permisos y acceso

## Los scopes del canal

Pinocchio declara al core sólo **dos** scopes válidos para su canal, en este orden de menor a mayor:

| Scope | Nivel | Significado |
|-------|-------|-------------|
| `none` | 1 | Nivel mínimo. Suficiente para abrir el canal. |
| `cluster` | 2 | Nivel de administración. Cubre todo lo anterior. |

Una clave de acceso concede permiso sobre el canal `pinocchio` con uno de esos dos valores. El canal pide
como scope de instancia `NONE`, así que **cualquiera de los dos basta para abrirlo y usarlo entero**.

Cualquier otro literal en el scope (`view`, `restart`, `filter`, …) es **inválido para este canal**: el core
lo rechaza con un aviso muy visible en el log de autorización:

```
***************** Inexistent scope 'view' on channel 'pinocchio' *****************
```

Si un usuario no consigue abrir el canal, ese log es el primer sitio donde mirar.

## Lo que hay que entender antes de repartir claves

Pinocchio **no tiene permisos granulares**. No hay un scope para "sólo leer los findings" y otro para
"editar triggers". Quien puede abrir el canal, puede hacerlo todo. Esto es lo que "todo" incluye:

**1. Leer los análisis de todos los demás.** Los análisis se guardan en el canal, no por usuario. Cualquiera
que abra el canal recibe de golpe los últimos 50, con los manifiestos y los findings que contengan. Si un
trigger analiza recursos de un namespace sensible, esos datos son visibles para todos los que tengan acceso
al canal.

**2. Borrar los análisis de todos los demás.** El botón **Clear back** vacía la memoria del canal para todo
el mundo, sin confirmación adicional más allá del propio diálogo.

**3. Editar la configuración de IA compartida.** Los diálogos *Provider* y *LLM* escriben en el almacén
**común** de kwirth. Un usuario de Pinocchio puede añadir, modificar o **borrar** los providers y modelos que
usan los demás plugins de IA del clúster.

**4. Ver y cambiar las API keys.** El diálogo de provider tiene un botón de ojo que revela la clave, y un
botón **Export** que descarga todos los providers **con las claves en claro**.

**5. Crear triggers que ejecutan acciones de escritura.** Ver el apartado siguiente.

> **Conclusión operativa: trata el acceso al canal `pinocchio` como un permiso de administración.** No es un
> visor de logs. Concédelo al equipo que gobierna la plataforma, no a los usuarios de aplicación.

## Las tools de escritura y el service account del backend

Este es el punto que más atención merece.

El catálogo de tools incluye acciones que **modifican el clúster**: `add_replica`, `remove_replica`,
`restart_deployment`, `delete_pod`, `add_node`, `remove_node`, `start_node`, `stop_node`. Pinocchio **no
filtra las tools de escritura**: si una versión de trigger las tiene marcadas —o tiene el interruptor
**`Auto`** activado, que entrega el catálogo entero— el modelo puede invocarlas.

Y cuando las invoca, se ejecutan con el **service account del backend de kwirth**, no con los permisos del
usuario que configuró el trigger. Un usuario con el scope mínimo puede, a través de un trigger, provocar
acciones que su propio nivel de acceso no le permitiría hacer directamente.

Tres medidas concretas:

1. **Prohíbe `Auto` en triggers** como norma de equipo. Que las tools se marquen a mano, una a una.
2. **Revisa los triggers como revisarías código.** El diálogo *Import / Export* permite volcarlos a JSON:
   ese fichero se puede versionar y revisar en un pull request.
3. **Ajusta el RBAC del service account del backend** a lo que de verdad necesites. Si en tu instalación
   Pinocchio sólo tiene que auditar, el backend no debería poder escalar deployments ni borrar pods. Ésa es
   la barrera que de verdad detiene el problema, y está fuera del plugin: es el RBAC de kwirth en el clúster.

## Auditoría

Todas las invocaciones de tools quedan como trazas en el log del backend:

```
[pinocchio] tool get_pod_logs {"namespace":"prod","name":"api-gateway-7d9f"}
[pinocchio] tool get_pod_logs response: {...}
```

Además, cada análisis muestra en su cabecera qué LLM lo produjo y cuántos tokens costó, y la traza completa
de la conversación con las tools es visible en las pestañas **IN**/**OUT** del Playground cuando se ejecuta
desde allí.

## Superficie de red

El Playground dispara sus eventos con un `POST {clusterUrl}/provider/business`, autenticado con la clave de
acceso del usuario. Es el mismo endpoint por el que los sistemas externos inyectan eventos de negocio: quien
tenga una clave válida para ese provider puede inyectar eventos y, por tanto, disparar los triggers
`business`. Ténlo en cuenta al repartir claves con acceso al provider `business`.
