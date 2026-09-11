import { createHash } from 'crypto'
import { IHttpRequest, IHttpResponse, TFetcher } from '../src/back/LibreClient'
import { ISugarlessConfig, newSugarlessConfig } from '../src/common/Sugarless'

/*
    Fixtures con la FORMA verificada de las respuestas de LibreLinkUp y valores INVENTADOS.

    Los valores reales de la captura que sirvio para fijar el contrato no se transcriben aqui: son
    datos de salud de una persona y este repositorio es publico. Lo que se prueba es la forma, que es
    lo unico que el codigo interpreta.
*/

export const USER_ID = 'user-0000-1111-2222'
export const EXPECTED_ACCOUNT_ID = createHash('sha256').update(USER_ID).digest('hex')

/** JWT de mentira: solo interesa el payload, que es de donde el cliente saca la region. */
export const tokenWithRegion = (region: string): string => {
    const payload = Buffer.from(JSON.stringify({ region, units: 1 }), 'utf8').toString('base64')
    return `fakeheader.${payload}.fakesignature`
}

export const loginOk = (region = 'eu') => ({
    status: 0,
    data: {
        user: { id: USER_ID },
        authTicket: { token: tokenWithRegion(region) }
    }
})

/** La region equivocada no llega como 3xx: llega como 200 con 'redirect' en el cuerpo. */
export const loginRedirect = (region = 'eu') => ({
    status: 0,
    data: { redirect: true, region }
})

export const loginBadCredentials = () => ({
    status: 2,
    error: { message: 'incorrect username/password' }
})

export const measurement = (overrides: Record<string, unknown> = {}) => ({
    FactoryTimestamp: '7/4/2026 7:19:21 AM',
    Timestamp: '7/4/2026 9:19:21 AM',
    type: 1,
    ValueInMgPerDl: 112,
    Value: 112,
    GlucoseUnits: 1,
    TrendArrow: 3,
    TrendMessage: null,
    MeasurementColor: 1,
    isHigh: false,
    isLow: false,
    ...overrides
})

export const connection = (overrides: Record<string, unknown> = {}) => ({
    patientId: 'patient-0000',
    country: 'ES',
    status: 2,
    targetLow: 70,
    targetHigh: 150,
    uom: 1,
    glucoseMeasurement: measurement(),
    ...overrides
})

export const connectionsOk = (overrides: Record<string, unknown> = {}) => ({
    status: 0,
    data: [connection(overrides)]
})

/** Login correcto y lista vacia: la cuenta no sigue a nadie. */
export const connectionsEmpty = () => ({ status: 0, data: [] })

/** Version de cliente caducada: 403 con status 920 y el minimo exigido. */
export const connectionsVersionTooOld = (minimumVersion = '4.16.0') => ({
    status: 920,
    data: { minimumVersion }
})

export const testConfig = (overrides: Partial<ISugarlessConfig> = {}): ISugarlessConfig => ({
    ...newSugarlessConfig(),
    email: 'follower@example.com',
    password: 'secret',
    ...overrides
})

export interface IFakeResponse {
    status: number
    body: unknown
}

export interface IFakeFetcher {
    fetcher: TFetcher
    requests: IHttpRequest[]
}

/*
    Fetcher de mentira: ninguna prueba toca la red. 'respond' recibe la peticion y el indice de la
    llamada, que es lo que permite montar escenarios con estado (por ejemplo, un 401 en la primera
    lectura y un 200 en la de despues del relogin).
*/
export const makeFetcher = (respond: (request: IHttpRequest, callIndex: number) => IFakeResponse): IFakeFetcher => {
    const requests: IHttpRequest[] = []

    const fetcher: TFetcher = async (request: IHttpRequest): Promise<IHttpResponse> => {
        const callIndex = requests.length
        requests.push(request)
        const answer = respond(request, callIndex)
        return {
            status: answer.status,
            body: typeof answer.body === 'string' ? answer.body : JSON.stringify(answer.body)
        }
    }

    return { fetcher, requests }
}

export const isLogin = (request: IHttpRequest): boolean => request.url.endsWith('/llu/auth/login')
export const isConnections = (request: IHttpRequest): boolean => request.url.endsWith('/llu/connections')
