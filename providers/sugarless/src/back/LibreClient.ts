import { createHash } from 'crypto'
import {
    EGlucoseUnit, ESugarlessErrorKind, ETrendArrow, IGlucoseSample, ISugarlessConfig, REQUEST_TIMEOUT_MS
} from '../common/Sugarless'
import { parseLibreTimestamp } from '../common/Timestamp'

/*
    Cliente de LibreLinkUp.

    El flujo NO es una peticion: es una sesion. Y por eso este provider existe en vez de ser una
    conexion de http-pull-push (ver el PRD, seccion 3):

      1. POST /llu/auth/login  -> token JWT + id de usuario
      2. accountId = SHA-256(hex) del id de usuario     <- se CALCULA, no se copia
      3. GET  /llu/connections con Authorization: Bearer + Account-Id
      4. un 401 obliga a repetir 1 y 2

    Tres requisitos de la API que solo se descubren chocando con ellos, y que estan cubiertos aqui:
      - la cabecera 'version' la ignora el login pero la exige la lectura (status 920)
      - sin 'Account-Id' la lectura responde 400 RequiredHeaderMissing
      - /llu/connections lista los pacientes que la cuenta SIGUE, no los sensores propios
*/

const PRODUCT = 'llu.android'
const GLOBAL_HOST = 'https://api.libreview.io'

export interface IHttpRequest {
    url: string
    method: 'GET' | 'POST'
    headers: Record<string, string>
    body?: string
    timeoutMs: number
}

export interface IHttpResponse {
    status: number
    body: string
}

export type TFetcher = (request: IHttpRequest) => Promise<IHttpResponse>

/** Error con motivo. El motivo importa: distingue lo que arregla un administrador de lo que se arregla solo. */
export class SugarlessError extends Error {
    readonly kind: ESugarlessErrorKind

    constructor(kind: ESugarlessErrorKind, message: string) {
        super(message)
        this.name = 'SugarlessError'
        this.kind = kind
    }
}

// ── Forma de las respuestas de la API, solo los campos que se usan ──────────────

interface ILluAuthTicket {
    token?: string
}

interface ILluUser {
    id?: string
}

interface ILluLoginData {
    redirect?: boolean
    region?: string
    user?: ILluUser
    authTicket?: ILluAuthTicket
}

interface ILluLoginResponse {
    status?: number
    error?: { message?: string }
    data?: ILluLoginData
}

interface ILluGlucoseMeasurement {
    FactoryTimestamp?: string
    Timestamp?: string
    Value?: number
    ValueInMgPerDl?: number
    GlucoseUnits?: number
    TrendArrow?: number
    isHigh?: boolean
    isLow?: boolean
}

interface ILluConnection {
    patientId?: string
    targetLow?: number
    targetHigh?: number
    uom?: number
    glucoseMeasurement?: ILluGlucoseMeasurement | null
}

/** Con status 920 la API no manda la lista, manda la version minima que exige. */
interface ILluVersionPayload {
    minimumVersion?: string
}

interface ILluConnectionsResponse {
    status?: number
    message?: string
    data?: ILluConnection[] | ILluVersionPayload
}

// ── Resultado de una lectura ───────────────────────────────────────────────────

export interface ILibreReading {
    /** undefined = conexion buena pero sin lectura actual (glucoseMeasurement null). No es un error. */
    sample: IGlucoseSample | undefined
    unit: EGlucoseUnit
    targetLow?: number
    targetHigh?: number
    /** Pacientes seguidos. Cero significa que falta compartir el sensor con esta cuenta. */
    connections: number
    /** Region que se ha acabado usando: la configurada, o la derivada del token. */
    region: string
}

interface ISession {
    token: string
    accountId: string
    region: string
}

// ── Utilidades ────────────────────────────────────────────────────────────────

const hostFor = (region: string): string => region === '' ? GLOBAL_HOST : `https://api-${region}.libreview.io`

const unitFor = (code: number | undefined): EGlucoseUnit => code === 1 ? EGlucoseUnit.MGDL : EGlucoseUnit.MMOLL

/*
    Lee los claims del JWT sin verificar la firma. No es una omision: no somos ni el emisor ni el
    destinatario del token, solo le leemos un dato de enrutado que el propio servidor acaba de
    emitirnos por un canal TLS. Verificar aqui no añadiria ninguna garantia.
*/
const regionFromToken = (token: string): string => {
    try {
        const payload = token.split('.')[1]
        if (!payload) return ''
        const json = Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
        const claims: { region?: string } = JSON.parse(json)
        return typeof claims.region === 'string' ? claims.region : ''
    }
    catch {
        return ''
    }
}

const toTrend = (raw: number | undefined): ETrendArrow => {
    switch (raw) {
        case ETrendArrow.FALLING_FAST:
        case ETrendArrow.FALLING:
        case ETrendArrow.STABLE:
        case ETrendArrow.RISING:
        case ETrendArrow.RISING_FAST:
            return raw
        default:
            // La flecha es decorativa: una desconocida no justifica descartar el valor de glucosa.
            console.log(`[sugarless] Unknown TrendArrow '${raw}', reporting it as stable`)
            return ETrendArrow.STABLE
    }
}

/** Fetcher real. Se inyecta por constructor para que los tests no toquen la red. */
export const httpFetcher: TFetcher = async (request: IHttpRequest): Promise<IHttpResponse> => {
    const response = await fetch(request.url, {
        method: request.method,
        headers: request.headers,
        body: request.body,
        signal: AbortSignal.timeout(request.timeoutMs)
    })
    return {
        status: response.status,
        body: await response.text()
    }
}

// ── Cliente ───────────────────────────────────────────────────────────────────

export class LibreClient {
    private config: ISugarlessConfig
    private fetcher: TFetcher
    private session: ISession | undefined

    constructor(config: ISugarlessConfig, fetcher: TFetcher = httpFetcher) {
        this.config = config
        this.fetcher = fetcher
    }

    /** Olvida la sesion. Se llama al guardar configuracion nueva: otras credenciales, otra sesion. */
    reset = (): void => {
        this.session = undefined
    }

    /*
        Una lectura. Reautentica UNA vez si el token ha caducado, y no mas: si el segundo intento
        tambien da 401 el problema son las credenciales, y reintentar en bucle contra una cuenta de
        verdad es la via rapida a que la bloqueen.
    */
    read = async (): Promise<ILibreReading> => {
        let session = this.session ?? await this.login()

        let response = await this.requestConnections(session)
        if (response.status === 401) {
            this.session = undefined
            session = await this.login()
            response = await this.requestConnections(session)
        }

        return this.interpretConnections(response, session)
    }

    private requestConnections = async (session: ISession): Promise<IHttpResponse> => {
        const url = `${hostFor(session.region)}/llu/connections`
        try {
            return await this.fetcher({
                url,
                method: 'GET',
                headers: {
                    'product': PRODUCT,
                    'version': this.config.clientVersion,
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.token}`,
                    'Account-Id': session.accountId
                },
                timeoutMs: REQUEST_TIMEOUT_MS
            })
        }
        catch (err) {
            throw new SugarlessError(ESugarlessErrorKind.NETWORK, `Could not reach ${url}: ${err instanceof Error ? err.message : String(err)}`)
        }
    }

    private interpretConnections = (response: IHttpResponse, session: ISession): ILibreReading => {
        const body = this.parseJson<ILluConnectionsResponse>(response.body)

        // La version caducada llega como 403 con status 920 y la version minima que exige la API.
        if (body?.status === 920) {
            const minimum = (body.data as ILluVersionPayload | undefined)?.minimumVersion ?? 'a newer one'
            throw new SugarlessError(
                ESugarlessErrorKind.CLIENT_VERSION,
                `Client version '${this.config.clientVersion}' is too old: the API requires at least '${minimum}'. Set it in the provider configuration.`
            )
        }

        if (response.status === 401) {
            throw new SugarlessError(ESugarlessErrorKind.AUTH_FAILED, 'The API rejected the session token twice; check the credentials')
        }

        if (response.status !== 200) {
            const detail = body?.message ?? response.body.slice(0, 200)
            throw new SugarlessError(ESugarlessErrorKind.UNEXPECTED, `Reading glucose failed with HTTP ${response.status}: ${detail}`)
        }

        if (!Array.isArray(body?.data)) {
            throw new SugarlessError(ESugarlessErrorKind.UNEXPECTED, `Unexpected answer from the API: ${response.body.slice(0, 200)}`)
        }

        const connections = body.data
        if (connections.length === 0) {
            throw new SugarlessError(
                ESugarlessErrorKind.NO_FOLLOWED_PATIENT,
                'This account does not follow any patient. LibreLinkUp reports the patients an account FOLLOWS, so the sensor must be shared with it first (invite a follower from the patient LibreLink app and accept it in LibreLinkUp).'
            )
        }

        const connection = connections[0]
        const unit = unitFor(connection.uom)

        return {
            sample: this.toSample(connection.glucoseMeasurement),
            unit,
            targetLow: connection.targetLow,
            targetHigh: connection.targetHigh,
            connections: connections.length,
            region: session.region
        }
    }

    /*
        glucoseMeasurement puede llegar null con la conexion perfectamente establecida: LibreLinkUp no
        lee el sensor, lee lo que la app del paciente ha subido a la nube. Devolver undefined (y no
        lanzar) es lo que permite distinguir 'sin dato ahora' de 'algo va mal'.
    */
    private toSample = (measurement: ILluGlucoseMeasurement | null | undefined): IGlucoseSample | undefined => {
        if (!measurement) return undefined

        const timestamp = parseLibreTimestamp(measurement.FactoryTimestamp)
        if (timestamp === undefined) {
            console.log(`[sugarless] Unparseable FactoryTimestamp '${measurement.FactoryTimestamp}', reading discarded`)
            return undefined
        }

        const value = measurement.Value ?? measurement.ValueInMgPerDl
        if (typeof value !== 'number' || !Number.isFinite(value)) {
            console.log('[sugarless] Reading without a numeric value, discarded')
            return undefined
        }

        return {
            timestamp,
            value,
            trend: toTrend(measurement.TrendArrow),
            isHigh: measurement.isHigh === true,
            isLow: measurement.isLow === true
        }
    }

    /*
        Autentica y deja la sesion lista. El 'accountId' es SHA-256 del id de usuario: la API lo exige
        como cabecera y su valor se computa, no se copia de la respuesta.
    */
    private login = async (): Promise<ISession> => {
        const email = (this.config.email ?? '').trim()
        if (email === '' || (this.config.password ?? '') === '') {
            throw new SugarlessError(ESugarlessErrorKind.NOT_CONFIGURED, 'No credentials configured')
        }

        // Para el login se usa la region configurada si la hay; si no, el host global, que es quien
        // sabe decir donde vive la cuenta.
        const loginHost = hostFor((this.config.region ?? '').trim())
        const url = `${loginHost}/llu/auth/login`

        let response: IHttpResponse
        try {
            response = await this.fetcher({
                url,
                method: 'POST',
                headers: {
                    'product': PRODUCT,
                    'version': this.config.clientVersion,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email, password: this.config.password }),
                timeoutMs: REQUEST_TIMEOUT_MS
            })
        }
        catch (err) {
            throw new SugarlessError(ESugarlessErrorKind.NETWORK, `Could not reach ${url}: ${err instanceof Error ? err.message : String(err)}`)
        }

        const body = this.parseJson<ILluLoginResponse>(response.body)

        /*
            El aviso de region equivocada NO llega como un 3xx: llega como un 200 cuyo cuerpo dice
            'redirect' y en que region vive la cuenta. Se reporta en vez de seguirlo, porque con la
            region correcta puesta (o derivada del token) este caso no vuelve a darse.
        */
        if (body?.data?.redirect === true) {
            const region = body.data.region ?? 'unknown'
            throw new SugarlessError(
                ESugarlessErrorKind.WRONG_REGION,
                `Wrong region: the API says this account lives in '${region}'. Set that value in the provider configuration, or leave the region empty to derive it automatically.`
            )
        }

        if (body?.status === 920) {
            const minimum = 'a newer one'
            throw new SugarlessError(
                ESugarlessErrorKind.CLIENT_VERSION,
                `Client version '${this.config.clientVersion}' is too old: the API requires at least '${minimum}'.`
            )
        }

        const token = body?.data?.authTicket?.token
        const userId = body?.data?.user?.id
        if (!token || !userId) {
            const detail = body?.error?.message ?? `HTTP ${response.status}`
            throw new SugarlessError(ESugarlessErrorKind.AUTH_FAILED, `Login failed: ${detail}`)
        }

        // La region configurada manda; si esta vacia, se deriva del claim del token.
        const configured = (this.config.region ?? '').trim()
        const session: ISession = {
            token,
            accountId: createHash('sha256').update(userId).digest('hex'),
            region: configured !== '' ? configured : regionFromToken(token)
        }
        this.session = session
        return session
    }

    private parseJson = <T>(text: string): T | undefined => {
        try {
            return JSON.parse(text) as T
        }
        catch {
            return undefined
        }
    }
}
