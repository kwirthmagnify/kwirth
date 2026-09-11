import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LibreClient, SugarlessError } from '../src/back/LibreClient'
import { EGlucoseUnit, ESugarlessErrorKind, ETrendArrow } from '../src/common/Sugarless'
import {
    EXPECTED_ACCOUNT_ID, connection, connectionsEmpty, connectionsOk, connectionsVersionTooOld, isConnections,
    isLogin, loginBadCredentials, loginOk, loginRedirect, makeFetcher, measurement, testConfig
} from './fixtures'

const readOnce = async (respond: Parameters<typeof makeFetcher>[0], config = testConfig()) => {
    const { fetcher, requests } = makeFetcher(respond)
    const client = new LibreClient(config, fetcher)
    const reading = await client.read()
    return { reading, requests }
}

const expectKind = async (promise: Promise<unknown>, kind: ESugarlessErrorKind): Promise<SugarlessError> => {
    try {
        await promise
    }
    catch (err) {
        assert.ok(err instanceof SugarlessError, `expected a SugarlessError, got ${err}`)
        assert.equal(err.kind, kind)
        return err
    }
    throw new Error(`expected the call to fail with kind '${kind}'`)
}

test('logs in and reads a sample, mapping every field', async () => {
    const { reading } = await readOnce(request => {
        if (isLogin(request)) return { status: 200, body: loginOk() }
        return { status: 200, body: connectionsOk() }
    })

    assert.equal(reading.connections, 1)
    assert.equal(reading.unit, EGlucoseUnit.MGDL)
    assert.equal(reading.targetLow, 70)
    assert.equal(reading.targetHigh, 150)
    assert.equal(reading.region, 'eu')

    assert.ok(reading.sample)
    // El timestamp sale del FactoryTimestamp (UTC), no del Timestamp local: 7:19 y no 9:19.
    assert.equal(reading.sample.timestamp, Date.UTC(2026, 6, 4, 7, 19, 21))
    assert.equal(reading.sample.value, 112)
    assert.equal(reading.sample.trend, ETrendArrow.STABLE)
    assert.equal(reading.sample.isHigh, false)
    assert.equal(reading.sample.isLow, false)
})

test('sends product, version, bearer token and the Account-Id hash on the read', async () => {
    const { requests } = await readOnce(request => {
        if (isLogin(request)) return { status: 200, body: loginOk() }
        return { status: 200, body: connectionsOk() }
    }, testConfig({ clientVersion: '4.16.0' }))

    const read = requests.find(isConnections)
    assert.ok(read)
    assert.equal(read.headers['product'], 'llu.android')
    assert.equal(read.headers['version'], '4.16.0')
    assert.match(read.headers['Authorization'], /^Bearer fakeheader\./)
    // Este es el requisito que no se puede expresar con plantillas: el valor se CALCULA.
    assert.equal(read.headers['Account-Id'], EXPECTED_ACCOUNT_ID)
    assert.equal(read.headers['Account-Id'].length, 64)
})

test('posts the credentials to the login endpoint and nowhere else', async () => {
    const { requests } = await readOnce(request => {
        if (isLogin(request)) return { status: 200, body: loginOk() }
        return { status: 200, body: connectionsOk() }
    })

    const login = requests.find(isLogin)
    assert.ok(login)
    assert.equal(login.method, 'POST')
    assert.deepEqual(JSON.parse(login.body!), { email: 'follower@example.com', password: 'secret' })

    const read = requests.find(isConnections)
    assert.equal(read!.method, 'GET')
    assert.equal(read!.body, undefined)
})

test('reuses the session across reads instead of logging in every cycle', async () => {
    const { fetcher, requests } = makeFetcher(request => {
        if (isLogin(request)) return { status: 200, body: loginOk() }
        return { status: 200, body: connectionsOk() }
    })
    const client = new LibreClient(testConfig(), fetcher)

    await client.read()
    await client.read()
    await client.read()

    assert.equal(requests.filter(isLogin).length, 1)
    assert.equal(requests.filter(isConnections).length, 3)
})

test('re-authenticates once on a 401 and retries the read', async () => {
    const { fetcher, requests } = makeFetcher((request, callIndex) => {
        if (isLogin(request)) return { status: 200, body: loginOk() }
        // La primera lectura caduca, la de despues del relogin funciona.
        if (callIndex === 1) return { status: 401, body: { message: 'expired' } }
        return { status: 200, body: connectionsOk() }
    })
    const client = new LibreClient(testConfig(), fetcher)

    const reading = await client.read()
    assert.ok(reading.sample)
    assert.equal(requests.filter(isLogin).length, 2)
    assert.equal(requests.filter(isConnections).length, 2)
})

test('gives up after a second 401 instead of hammering the account', async () => {
    const { fetcher, requests } = makeFetcher(request => {
        if (isLogin(request)) return { status: 200, body: loginOk() }
        return { status: 401, body: { message: 'expired' } }
    })
    const client = new LibreClient(testConfig(), fetcher)

    await expectKind(client.read(), ESugarlessErrorKind.AUTH_FAILED)
    assert.equal(requests.filter(isLogin).length, 2)
    assert.equal(requests.filter(isConnections).length, 2)
})

test('reports an expired client version with the minimum the API demands', async () => {
    const { fetcher } = makeFetcher(request => {
        if (isLogin(request)) return { status: 200, body: loginOk() }
        return { status: 403, body: connectionsVersionTooOld('4.20.0') }
    })
    const client = new LibreClient(testConfig({ clientVersion: '4.12.0' }), fetcher)

    const err = await expectKind(client.read(), ESugarlessErrorKind.CLIENT_VERSION)
    assert.match(err.message, /4\.12\.0/)
    assert.match(err.message, /4\.20\.0/)
})

test('reports a wrong region with the region the API points at', async () => {
    const { fetcher } = makeFetcher(() => ({ status: 200, body: loginRedirect('us') }))
    const client = new LibreClient(testConfig({ region: 'eu' }), fetcher)

    const err = await expectKind(client.read(), ESugarlessErrorKind.WRONG_REGION)
    assert.match(err.message, /'us'/)
})

test('reports bad credentials with the message from the API', async () => {
    const { fetcher } = makeFetcher(() => ({ status: 200, body: loginBadCredentials() }))
    const client = new LibreClient(testConfig(), fetcher)

    const err = await expectKind(client.read(), ESugarlessErrorKind.AUTH_FAILED)
    assert.match(err.message, /incorrect username\/password/)
})

test('explains an empty connection list as a missing follower relationship', async () => {
    const { fetcher } = makeFetcher(request => {
        if (isLogin(request)) return { status: 200, body: loginOk() }
        return { status: 200, body: connectionsEmpty() }
    })
    const client = new LibreClient(testConfig(), fetcher)

    const err = await expectKind(client.read(), ESugarlessErrorKind.NO_FOLLOWED_PATIENT)
    assert.match(err.message, /FOLLOWS/)
})

test('does not even try to connect without credentials', async () => {
    const { fetcher, requests } = makeFetcher(() => ({ status: 200, body: loginOk() }))
    const client = new LibreClient(testConfig({ email: '', password: '' }), fetcher)

    await expectKind(client.read(), ESugarlessErrorKind.NOT_CONFIGURED)
    assert.equal(requests.length, 0)
})

test('treats a null glucoseMeasurement as "no reading", not as an error', async () => {
    const { reading } = await readOnce(request => {
        if (isLogin(request)) return { status: 200, body: loginOk() }
        return { status: 200, body: { status: 0, data: [connection({ glucoseMeasurement: null })] } }
    })

    assert.equal(reading.sample, undefined)
    // Lo demas sigue llegando: hay conexion, con su rango objetivo y su unidad.
    assert.equal(reading.connections, 1)
    assert.equal(reading.targetLow, 70)
    assert.equal(reading.unit, EGlucoseUnit.MGDL)
})

test('discards a reading whose timestamp cannot be parsed, without failing the cycle', async () => {
    const { reading } = await readOnce(request => {
        if (isLogin(request)) return { status: 200, body: loginOk() }
        return {
            status: 200,
            body: { status: 0, data: [connection({ glucoseMeasurement: measurement({ FactoryTimestamp: 'garbage' }) })] }
        }
    })

    assert.equal(reading.sample, undefined)
    assert.equal(reading.connections, 1)
})

test('maps uom 0 to mmol/L and keeps the value unconverted', async () => {
    const { reading } = await readOnce(request => {
        if (isLogin(request)) return { status: 200, body: loginOk() }
        return {
            status: 200,
            body: {
                status: 0,
                data: [connection({
                    uom: 0,
                    targetLow: 3.9,
                    targetHigh: 8.3,
                    glucoseMeasurement: measurement({ Value: 6.2, ValueInMgPerDl: 112, GlucoseUnits: 0 })
                })]
            }
        }
    })

    assert.equal(reading.unit, EGlucoseUnit.MMOLL)
    // Se respeta la unidad de la cuenta: 6.2, no los 112 mg/dL.
    assert.equal(reading.sample!.value, 6.2)
    assert.equal(reading.targetLow, 3.9)
})

test('falls back to ValueInMgPerDl when Value is missing', async () => {
    const { reading } = await readOnce(request => {
        if (isLogin(request)) return { status: 200, body: loginOk() }
        return {
            status: 200,
            body: { status: 0, data: [connection({ glucoseMeasurement: measurement({ Value: undefined }) })] }
        }
    })

    assert.equal(reading.sample!.value, 112)
})

test('reports an unknown trend as stable rather than dropping the reading', async () => {
    const { reading } = await readOnce(request => {
        if (isLogin(request)) return { status: 200, body: loginOk() }
        return {
            status: 200,
            body: { status: 0, data: [connection({ glucoseMeasurement: measurement({ TrendArrow: 99 }) })] }
        }
    })

    assert.equal(reading.sample!.trend, ETrendArrow.STABLE)
    assert.equal(reading.sample!.value, 112)
})

test('derives the region from the token claim when none is configured', async () => {
    const { requests, reading } = await readOnce(request => {
        if (isLogin(request)) return { status: 200, body: loginOk('ap') }
        return { status: 200, body: connectionsOk() }
    }, testConfig({ region: '' }))

    // El login va al host global, que es quien sabe donde vive la cuenta...
    assert.equal(requests.find(isLogin)!.url, 'https://api.libreview.io/llu/auth/login')
    // ...y la lectura ya va al host regional que dice el token.
    assert.equal(requests.find(isConnections)!.url, 'https://api-ap.libreview.io/llu/connections')
    assert.equal(reading.region, 'ap')
})

test('a configured region wins over the token claim', async () => {
    const { requests, reading } = await readOnce(request => {
        if (isLogin(request)) return { status: 200, body: loginOk('ap') }
        return { status: 200, body: connectionsOk() }
    }, testConfig({ region: 'eu' }))

    assert.equal(requests.find(isLogin)!.url, 'https://api-eu.libreview.io/llu/auth/login')
    assert.equal(requests.find(isConnections)!.url, 'https://api-eu.libreview.io/llu/connections')
    assert.equal(reading.region, 'eu')
})

test('surfaces a network failure as such', async () => {
    const { fetcher } = makeFetcher(() => { throw new Error('getaddrinfo ENOTFOUND') })
    const client = new LibreClient(testConfig(), fetcher)

    const err = await expectKind(client.read(), ESugarlessErrorKind.NETWORK)
    assert.match(err.message, /ENOTFOUND/)
})

test('reset forces a fresh login on the next read', async () => {
    const { fetcher, requests } = makeFetcher(request => {
        if (isLogin(request)) return { status: 200, body: loginOk() }
        return { status: 200, body: connectionsOk() }
    })
    const client = new LibreClient(testConfig(), fetcher)

    await client.read()
    client.reset()
    await client.read()

    assert.equal(requests.filter(isLogin).length, 2)
})

test('reports an unexpected HTTP status with its body', async () => {
    const { fetcher } = makeFetcher(request => {
        if (isLogin(request)) return { status: 200, body: loginOk() }
        return { status: 400, body: { message: 'RequiredHeaderMissing' } }
    })
    const client = new LibreClient(testConfig(), fetcher)

    const err = await expectKind(client.read(), ESugarlessErrorKind.UNEXPECTED)
    assert.match(err.message, /RequiredHeaderMissing/)
})

test('a 200 with no token says what is missing instead of just the status', async () => {
    /*
        La API contesta 200 tanto con credenciales malas como cuando pide un paso mas. Un mensaje que
        solo dijera 'HTTP 200' obligaria a adivinar cual de las dos cosas ha pasado.
    */
    const { fetcher } = makeFetcher(() => ({
        status: 200,
        body: { status: 0, data: { step: { type: 'verifyPhone' }, user: { id: 'u1' } } }
    }))
    const client = new LibreClient(testConfig(), fetcher)

    const err = await expectKind(client.read(), ESugarlessErrorKind.AUTH_FAILED)
    assert.match(err.message, /authTicket\.token/)
    assert.match(err.message, /data keys: \[step, user\]/)
})

test('a non JSON answer to the login is reported as such, with a preview', async () => {
    const { fetcher } = makeFetcher(() => ({ status: 200, body: '<html>maintenance</html>' }))
    const client = new LibreClient(testConfig(), fetcher)

    const err = await expectKind(client.read(), ESugarlessErrorKind.AUTH_FAILED)
    assert.match(err.message, /was not JSON/)
    assert.match(err.message, /maintenance/)
})
