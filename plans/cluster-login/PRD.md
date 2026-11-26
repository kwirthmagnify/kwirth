# Clusters con conexión «login» — PRD

> **ESTADO — PRD validado** (2026-11-26). El cómo y en qué orden, en [PLAN.md](PLAN.md).

## El problema

Hoy una entrada de la lista de clusters se conecta de dos maneras: **directa** (la URL del Kwirth remoto) o
**enrutada** (a través de un router instalado: `bridge` o `ianus`). En las dos, la entrada lleva **guardada una
access key** del Kwirth remoto: quien la da de alta tiene que conseguirla antes (crearla en el remoto, copiarla,
pegarla) y desde ese momento **todos los accesos a ese cluster van con esa key**, la del usuario que la creó.

Eso no sirve cuando:

- quien usa el cluster **tiene usuario propio en el remoto** y debe entrar con él —con sus permisos, no con los de
  una key compartida—;
- no se quiere dejar una key permanente guardada en la lista;
- el usuario que ha iniciado sesión en este Kwirth (`admin`, por ejemplo) **no es el mismo** que tiene que usar en
  el remoto (`operador-prod`).

## Qué se quiere

Separar en cada entrada dos cosas que hoy van juntas (D1):

- **Conectividad**: cómo se llega al remoto — **directa** o a través de un **router** (`bridge`, `ianus`).
- **Credenciales**: con qué se entra — una **access key** fija (lo de hoy) o **login**.

Con credenciales **login**, la entrada se da de alta **sin access key**. Cuando el usuario la quiere usar, el front
le **pide usuario y contraseña del Kwirth remoto**, hace login contra él (por la conectividad que tenga la entrada:
directa o por su router) y se **guarda la key** que el remoto devuelve; a partir de ahí se usa como cualquier otra.

🔴 **El usuario del remoto es independiente del de este Kwirth.** Se puede haber entrado aquí como `admin` y
entrar al remoto como cualquier otro usuario suyo: lo que manda en el remoto es su login, con sus permisos.

## Cómo funciona (lo que ya hay y se aprovecha)

- **Login del remoto**: `POST <url>/login` con `{ user, password }` (la contraseña viaja como sha256, igual que el
  login propio del front). Devuelve una **access key que caduca a las 24 h**. Aplica las protecciones del remoto:
  rate limit, filtro de IPs de login, y rechaza a los usuarios de IdP.
- **CORS**: el back ya admite peticiones del navegador desde otro origen, así que el front puede llamar al login
  del remoto directamente (igual que hoy llama a su `/config/info` en las entradas directas).
- **La lista de clusters** se guarda en el back de este Kwirth, por usuario (`/store/<user>/clusters/list`).

## Decisiones tomadas

| # | decisión | elegido |
|---|---|---|
| D1 | Modelo | **Conectividad y credenciales son dos cosas**: *conectividad* (directa / router) y *credenciales* (key fija / login), combinables. Un cluster detrás de un bridge o de Ianus también puede ir con login (2026-11-26) |
| D2 | Dónde se guarda la key obtenida | En la **lista de clusters del usuario** (back de este Kwirth), como las demás: sirve desde cualquier navegador hasta que caduca (2026-11-26) |
| D4 | Alcance del diálogo | **Solo login y obtención de la key**. No se fuerza ni se gestiona nada más del usuario remoto: si el remoto exige cambiar la contraseña (primer login, contesta 201 sin key), el diálogo lo dice y el usuario la cambia entrando en ese Kwirth (2026-11-26) |
| D6 | Usuarios de SSO (IdP) en el remoto | **V2**. En la V1 su `/login` los rechaza y el diálogo lo dice (2026-11-26) |
| D5 | Key caducada (24 h) o rechazada | Se vuelve a pedir **al usarla**, y el diálogo **dice que la sesión en ese cluster ha caducado** (no un login "en blanco" sin explicación) (2026-11-26) |

## Reglas

1. **Alta**: en *Manage clusters*, la entrada elige **conectividad** (Direct o un router) y **credenciales**
   (*API key* o *Login*). Con *Login* el campo *API Key* queda deshabilitado (visible, no oculto) y vacío. *TEST*
   comprueba que el remoto responde por esa conectividad (sin credenciales).
2. **Al usarla sin key**: el front abre el diálogo de login del remoto —usuario y contraseña, con el nombre y la
   URL del cluster a la vista— y, al entrar, guarda la key y continúa con lo que el usuario estaba haciendo.
3. **Key caducada o rechazada (401/403)**: el mismo diálogo, con el aviso de que **la sesión en ese cluster ha
   caducado** (D5).
4. **Primer login**: si el remoto exige cambiar la contraseña, el diálogo lo dice —que entre en ese Kwirth a
   cambiarla— y no hace nada más (D4).
5. **La contraseña no se guarda nunca**: solo la key que devuelve el remoto.
6. **En la lista y en el selector se ve con qué usuario se ha entrado** al remoto (`prod · as operador-prod`), y
   hay una acción **Sign out** que borra la key guardada: la siguiente vez vuelve a pedir credenciales (y se puede
   entrar con otro usuario).
7. **Errores con su motivo**: credenciales incorrectas, demasiados intentos (429, con el tiempo de espera), IP no
   permitida, usuario de IdP (D6), cambio de contraseña pendiente (D4), remoto inalcanzable.

## V2

- **Usuarios de SSO del remoto** (D6): el Kwirth remoto solo admite entrar con un proveedor de identidad (Entra ID,
  GitHub…), sus usuarios no tienen contraseña en Kwirth y su `/login` los rechaza. Soportarlo = abrir el login del
  IdP del remoto en una ventana emergente y recoger la key al volver.

## Fuera de alcance

- Login por SSO/IdP en el remoto (V2, D6).
- Cambiar la contraseña del usuario remoto o cualquier otra gestión suya (D4).
- Guardar contraseñas o "recordar credenciales".
- Renovar la key en segundo plano.
