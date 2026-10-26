/*
    S1 of plans/ai-usage-control: counting and cutting around every LLM call.

    What is pinned down here is not "the functions do not blow up", it is the four things that would be
    wrong in a way nobody notices:

      · the ORDER — a ceiling on calls stops the call that would exceed it, one on tokens or cost stops
        the NEXT one, because usage arrives with the answer. Get this backwards and the limit silently
        lets one more through, or blocks one too early;
      · the ONE rule — the call goes out only if NO active ceiling is exceeded, whatever unit;
      · a model nobody built with buildModel is NOT counted against somebody else's budget;
      · the subject of the llmkey axis is a hash: two LLM entries on the same key share one budget, and
        the key itself never leaves buildModel.
*/
import test from 'node:test'
import assert from 'node:assert/strict'
import back from '../dist/back.js'

const { buildModel, generateText, streamText, runWithUsageGuard, setUsageService, UsageLimitError, EUsageScope } = back

/*
    The accounting half is exercised through runWithUsageGuard with a fake call. Letting it fall through
    to generateText would send a real request to the provider on every run: slow, broken offline, and
    outbound traffic from a unit test. The cut path does use generateText, because it throws before
    anything leaves the process.
*/
const answering = (inputTokens, outputTokens) => () => Promise.resolve({ usage: { inputTokens, outputTokens } })

const ZERO = { tokensIn: 0, tokensOut: 0, calls: 0, cost: 0 }

/* A service that records what it was asked, so the order and the amounts can be asserted. */
const fakeService = (daily = ZERO, monthly = ZERO) => {
    const added = []
    const cuts = []
    const reads = []
    return {
        service: {
            durable: true,
            async read(scope, subject) { reads.push({ scope, subject }); return { daily: { ...daily }, monthly: { ...monthly } } },
            async add(scope, subject, amounts) { added.push({ scope, subject, amounts }) },
            onCut(detail) { cuts.push(detail) }
        },
        added, cuts, reads
    }
}

const providerWith = (limits) => ([{ name: 'p', type: 'openai', key: 'KEY-SECRET', models: [], limits }])
const llm = (over = {}) => ({ id: 'l', provider: 'p', model: 'gpt-4o-mini', temperature: 0, useProviderKey: true, key: '', inputCostPerMillion: 1000, outputCostPerMillion: 2000, ...over })

test.afterEach(() => setUsageService(undefined))

test('with no service registered nothing is counted and the call goes through', async () => {
    setUsageService(undefined)
    const model = buildModel(llm(), providerWith(undefined))
    assert.ok(model, 'buildModel must return a model for a known provider type')
})

test('a ceiling on CALLS stops the call that would exceed it, before calling', async () => {
    const limits = { calls: { enabled: true, daily: 10 } }
    const { service, cuts } = fakeService({ ...ZERO, calls: 10 })
    setUsageService(service)
    const model = buildModel(llm(), providerWith(limits))

    await assert.rejects(
        () => generateText({ model, prompt: 'x' }),
        (err) => {
            assert.ok(err instanceof UsageLimitError, 'it must be the typed error, not a generic failure')
            assert.equal(err.detail.unit, 'calls')
            assert.equal(err.detail.period, 'day')
            assert.equal(err.detail.limit, 10)
            assert.equal(err.detail.current, 10)
            assert.equal(err.detail.scope, EUsageScope.LLM_KEY)
            return true
        }
    )
    assert.equal(cuts.length, 1, 'the cut is announced so the core can log it')
})

test('reaching the ceiling cuts: the check is >=, not >', async () => {
    // a ceiling of 10 means the eleventh call does not happen, so at 10 it already has to cut
    const { service } = fakeService({ ...ZERO, calls: 10 })
    setUsageService(service)
    const model = buildModel(llm(), providerWith({ calls: { enabled: true, daily: 10 } }))
    await assert.rejects(() => generateText({ model, prompt: 'x' }), UsageLimitError)
})

test('a disabled ceiling does not cut, and its numbers are kept', async () => {
    const limits = { calls: { enabled: false, daily: 1 } }
    const { service, reads, added } = fakeService({ ...ZERO, calls: 9999 })
    setUsageService(service)
    const model = buildModel(llm(), providerWith(limits))

    await runWithUsageGuard({ model }, answering(10, 20))
    assert.equal(reads.length, 1, 'it still reads the counters: disabled is not the same as not configured')
    assert.equal(added.length, 1, 'and it keeps counting, which is what makes turning it back on meaningful')
})

test('what was spent is added AFTER answering, because that is when usage exists', async () => {
    const { service, added } = fakeService()
    setUsageService(service)
    const model = buildModel(llm(), providerWith({ calls: { enabled: true, daily: 100 } }))

    await runWithUsageGuard({ model }, answering(1500, 500))
    assert.equal(added.length, 1)
    assert.equal(added[0].amounts.tokensIn, 1500)
    assert.equal(added[0].amounts.tokensOut, 500)
    assert.equal(added[0].amounts.calls, 1)
})

test('the cost is accumulated with the price of the LLM that was used', async () => {
    const { service, added } = fakeService()
    setUsageService(service)
    // 1000 €/M in, 2000 €/M out → 1M in and 0.5M out = 1000 + 1000
    const model = buildModel(llm(), providerWith({ calls: { enabled: true, daily: 100 } }))

    await runWithUsageGuard({ model }, answering(1_000_000, 500_000))
    assert.equal(added[0].amounts.cost, 2000)
})

test('a response with no usage counts as a call and adds no tokens', async () => {
    const { service, added } = fakeService()
    setUsageService(service)
    const model = buildModel(llm(), providerWith({ calls: { enabled: true, daily: 100 } }))

    await runWithUsageGuard({ model }, () => Promise.resolve({}))
    assert.equal(added[0].amounts.calls, 1, 'the call happened, whatever the provider chose to report')
    assert.equal(added[0].amounts.tokensIn, 0)
    assert.equal(added[0].amounts.cost, 0)
})

test('nothing is added when the call was cut: a call that did not happen costs nothing', async () => {
    const { service, added } = fakeService({ ...ZERO, calls: 5 })
    setUsageService(service)
    const model = buildModel(llm(), providerWith({ calls: { enabled: true, daily: 5 } }))

    await assert.rejects(() => runWithUsageGuard({ model }, answering(10, 10)), UsageLimitError)
    assert.equal(added.length, 0)
})

test('the ONE rule: whichever unit is passed first cuts, not only the first configured', async () => {
    // calls is fine, cost is not: the cut has to be the cost one
    const limits = {
        calls: { enabled: true, monthly: 1000 },
        cost: { enabled: true, monthly: 50 }
    }
    const { service } = fakeService(ZERO, { ...ZERO, calls: 3, cost: 50 })
    setUsageService(service)
    const model = buildModel(llm(), providerWith(limits))

    await assert.rejects(
        () => generateText({ model, prompt: 'x' }),
        (err) => { assert.equal(err.detail.unit, 'cost'); assert.equal(err.detail.period, 'month'); return true }
    )
})

test('the daily ceiling is checked before the monthly one, and says which it was', async () => {
    const limits = { tokensIn: { enabled: true, daily: 100, monthly: 100000 } }
    const { service } = fakeService({ ...ZERO, tokensIn: 100 }, { ...ZERO, tokensIn: 100 })
    setUsageService(service)
    const model = buildModel(llm(), providerWith(limits))

    await assert.rejects(
        () => generateText({ model, prompt: 'x' }),
        (err) => { assert.equal(err.detail.period, 'day'); return true }
    )
})

test('a model not built by buildModel is not counted against anybody', async () => {
    const { service, reads, added } = fakeService()
    setUsageService(service)

    // an object that never went through buildModel: it has no origin
    await runWithUsageGuard({ model: { fake: true } }, answering(99, 99))
    assert.equal(reads.length, 0, 'nothing is read')
    assert.equal(added.length, 0, 'and above all nothing is charged to a budget that is not its own')
})

test('the subject is a hash: the key never reaches the counters', async () => {
    const { service, reads } = fakeService()
    setUsageService(service)
    const model = buildModel(llm(), providerWith({ calls: { enabled: true, daily: 999999 } }))

    await runWithUsageGuard({ model }, answering(1, 1))
    assert.equal(reads.length, 1)
    assert.notEqual(reads[0].subject, 'KEY-SECRET')
    assert.match(reads[0].subject, /^[0-9a-f]{32}$/, 'a sha256 prefix, not the key')
})

test('two LLM entries on the same provider key share one budget', async () => {
    const { service, reads } = fakeService()
    setUsageService(service)
    const providers = providerWith({ calls: { enabled: true, daily: 999999 } })
    const a = buildModel(llm({ id: 'a', model: 'gpt-4o' }), providers)
    const b = buildModel(llm({ id: 'b', model: 'gpt-4o-mini' }), providers)

    await runWithUsageGuard({ model: a }, answering(1, 1))
    await runWithUsageGuard({ model: b }, answering(1, 1))
    assert.equal(reads.length, 2)
    assert.equal(reads[0].subject, reads[1].subject, 'same key, same subject: the provider bills them as one')
})

test('a model with its OWN key does not share the budget of the provider key', async () => {
    const { service, reads } = fakeService()
    setUsageService(service)
    const providers = providerWith({ calls: { enabled: true, daily: 999999 } })
    const shared = buildModel(llm(), providers)
    const own = buildModel(llm({ useProviderKey: false, key: 'ANOTHER-KEY', limits: { calls: { enabled: true, daily: 5 } } }), providers)

    await runWithUsageGuard({ model: shared }, answering(1, 1))
    await runWithUsageGuard({ model: own }, answering(1, 1))
    assert.notEqual(reads[0].subject, reads[1].subject, 'different keys are different budgets')
})

/*
    🔴 The bookkeeping must never be what breaks the feature.

    Both halves of the guard used to be plain awaits on a database sitting in the critical path of every
    AI call. Measured on 2026-10-14 against a sick `core-ai-usage` pool: the call burned its caller's
    whole 120 s budget and the ticket was opened with no resolution guidance, for nothing. The counters
    are worth having; they are not worth the feature.
*/
test('if the counters cannot be READ the call still goes out (fail open, limits unenforced)', async () => {
    const providers = providerWith({ calls: { enabled: true, daily: 1 } })
    const model = buildModel(llm(), providers)
    setUsageService({
        durable: true,
        async read() { throw new Error('Connection ended unexpectedly') },
        async add() {}
    })
    // Hay un tope de 1 llamada/día: si la lectura se tragara el error y devolviera 0, esto pasaría por
    // otra razón. Lo que se prueba es que con la lectura ROTA la llamada sale igual.
    const r = await runWithUsageGuard({ model }, answering(3, 4))
    assert.deepEqual(r.usage, { inputTokens: 3, outputTokens: 4 })
})

test('if the counters HANG the call is not held hostage', async () => {
    const model = buildModel(llm(), providerWith({ calls: { enabled: true, daily: 999 } }))
    setUsageService({
        durable: true,
        read: () => new Promise(() => {}),   // no contesta JAMÁS: es el caso que costó los 120 s
        async add() {}
    })
    const started = Date.now()
    const r = await runWithUsageGuard({ model }, answering(1, 1))
    const ms = Date.now() - started
    assert.ok(r, 'la llamada se hizo')
    assert.ok(ms < 8000, `esperó ${ms} ms: la lectura tiene que rendirse sola, no bloquear`)
})

test('recording the usage does NOT delay the answer', async () => {
    // La respuesta ya está producida: esperar al apunte solo añade el tiempo de la base a lo que el
    // usuario percibe, y si la base está mal, lo añade entero.
    const model = buildModel(llm(), providerWith({ calls: { enabled: true, daily: 999 } }))
    let addStarted = false
    setUsageService({
        durable: true,
        async read() { return { daily: { ...ZERO }, monthly: { ...ZERO } } },
        add: () => { addStarted = true; return new Promise(() => {}) }   // no termina nunca
    })
    const started = Date.now()
    await runWithUsageGuard({ model }, answering(1, 1))
    assert.ok(Date.now() - started < 2000, 'la respuesta no espera al apunte')
    assert.equal(addStarted, true, 'pero el apunte SÍ se intenta')
})

/*
    streamText (added for the vllm channel): same counters as generateText, split around the stream
    because the caller needs the result object immediately. What has to be pinned:

      · the result comes back BEFORE the stream is consumed — awaiting the guard's shape here would
        deliver it only after the stream is over, which is not streaming any more;
      · the usage is recorded when the stream ENDS (the SDK reports it with the finish part);
      · a ceiling cuts BEFORE the stream starts, like generateText's.

    The model is real (buildModel, so it has an origin) but its doStream is replaced by a fake: the
    full SDK stream machinery runs offline, with no outbound traffic.
*/
const fakeDoStream = (inputTokens, outputTokens) => async () => ({
    stream: new ReadableStream({
        start(controller) {
            controller.enqueue({ type: 'stream-start', warnings: [] })
            controller.enqueue({ type: 'text-start', id: 't' })
            controller.enqueue({ type: 'text-delta', id: 't', delta: 'hello' })
            controller.enqueue({ type: 'text-end', id: 't' })
            controller.enqueue({ type: 'finish', usage: { inputTokens: { total: inputTokens }, outputTokens: { total: outputTokens } }, finishReason: 'stop' })
            controller.close()
        }
    })
})

const waitFor = async (cond, label) => {
    for (let i = 0; i < 100; i++) {
        if (cond()) return
        await new Promise(r => setTimeout(r, 10))
    }
    assert.fail(`${label}: no ocurrió en 1 s`)
}

test('streamText hands the result back immediately, before the stream is consumed', async () => {
    const { service } = fakeService()
    setUsageService(service)
    const model = buildModel(llm(), providerWith(undefined))
    model.doStream = fakeDoStream(10, 5)

    const result = streamText({ model, prompt: 'x' })
    assert.ok(result && typeof result.then === 'function', 'es una promesa del objeto resultado, no del stream consumido')
    const r = await result
    assert.ok(r.textStream, 'el objeto resultado llega con su textStream intacto')

    let text = ''
    for await (const delta of r.textStream) text += delta
    assert.equal(text, 'hello', 'el stream pasa tal cual')
})

test('streamText records the usage when the stream ends, not before', async () => {
    const { service, added } = fakeService()
    setUsageService(service)
    const model = buildModel(llm(), providerWith(undefined))
    model.doStream = fakeDoStream(10, 5)

    const r = await streamText({ model, prompt: 'x' })
    assert.equal(added.length, 0, 'nada se apunta antes de que el stream termine')
    for await (const _delta of r.textStream) { /* consumir */ }
    await waitFor(() => added.length === 1, 'el apunte tras el finish')
    assert.equal(added[0].amounts.tokensIn, 10)
    assert.equal(added[0].amounts.tokensOut, 5)
    assert.equal(added[0].amounts.calls, 1)
})

test('a ceiling on CALLS cuts a stream before it starts', async () => {
    const { service, cuts } = fakeService({ ...ZERO, calls: 10 })
    setUsageService(service)
    const model = buildModel(llm(), providerWith({ calls: { enabled: true, daily: 10 } }))
    model.doStream = fakeDoStream(1, 1)

    await assert.rejects(() => streamText({ model, prompt: 'x' }), UsageLimitError)
    assert.equal(cuts.length, 1, 'the cut is announced so the core can log it')
})

/*
    ── The model-first fallback ──────────────────────────────────────────────────────────────────────
    Spec change of 2026-10-26: prices and limits are editable on EVERY model, borrowed key or not, with
    the provider's as the default. The reason is one the previous rule could not express: within one
    provider —and on one key— each model costs a different amount, so the price was never a property of
    the key.

    What is pinned down here is the fallback itself, in the three ways it can go wrong silently:
      · a 0 is a STATED price (free, self-hosted) and must not fall through to the provider's;
      · an emptied limits object must inherit again, not turn into 'no limit';
      · and the borrowed key no longer decides who the limits belong to.
*/
test('a model with no price of its own is charged at the provider price', async () => {
    const { service, added } = fakeService()
    setUsageService(service)
    const providers = [{ name: 'p', type: 'openai', key: 'KEY-SECRET', models: [], inputCostPerMillion: 1000, outputCostPerMillion: 2000 }]
    const model = buildModel(llm({ inputCostPerMillion: undefined, outputCostPerMillion: undefined }), providers)

    await runWithUsageGuard({ model }, answering(1_000_000, 1_000_000))
    assert.equal(added[0].amounts.cost, 3000, 'it must cost what the provider charges, not 0')
})

test('a price of 0 on the model is a STATED price and does not inherit the provider one', async () => {
    const { service, added } = fakeService()
    setUsageService(service)
    const providers = [{ name: 'p', type: 'openai', key: 'KEY-SECRET', models: [], inputCostPerMillion: 1000, outputCostPerMillion: 2000 }]
    const model = buildModel(llm({ inputCostPerMillion: 0, outputCostPerMillion: 0 }), providers)

    await runWithUsageGuard({ model }, answering(1_000_000, 1_000_000))
    assert.equal(added[0].amounts.cost, 0, 'a free model stays free: 0 is not "unset"')
})

test("the model's own price wins over the provider's", async () => {
    const { service, added } = fakeService()
    setUsageService(service)
    const providers = [{ name: 'p', type: 'openai', key: 'KEY-SECRET', models: [], inputCostPerMillion: 1, outputCostPerMillion: 1 }]
    const model = buildModel(llm({ inputCostPerMillion: 1000, outputCostPerMillion: 2000 }), providers)

    await runWithUsageGuard({ model }, answering(1_000_000, 1_000_000))
    assert.equal(added[0].amounts.cost, 3000)
})

test('a model on a BORROWED key can now have its own ceiling, and it cuts', async () => {
    const { service, cuts } = fakeService({ ...ZERO, calls: 7 })
    setUsageService(service)
    const providers = providerWith({ calls: { enabled: true, daily: 100 } })
    const model = buildModel(llm({ useProviderKey: true, limits: { calls: { enabled: true, daily: 5 } } }), providers)

    await assert.rejects(() => generateText({ model, prompt: 'x' }), UsageLimitError)
    assert.equal(cuts[0].limit, 5, "the model's ceiling applies, not the provider's 100")
})

test('a model that states no limits inherits the provider ones, borrowed key or not', async () => {
    const { service, cuts } = fakeService({ ...ZERO, calls: 10 })
    setUsageService(service)
    const providers = providerWith({ calls: { enabled: true, daily: 10 } })
    const model = buildModel(llm({ useProviderKey: false, key: 'OWN-KEY', limits: undefined }), providers)

    await assert.rejects(() => generateText({ model, prompt: 'x' }), UsageLimitError)
    assert.equal(cuts[0].limit, 10, "an own key no longer means 'no provider limits'")
})

/*  The emptied-out object is what the dialog leaves behind when the admin clears the fields: it exists,
    it just states nothing. Treating it as 'own limits' would turn a cleared form into no limit at all —
    the opposite of what clearing a field asks for. */
test('an EMPTIED limits object inherits, instead of silently meaning unlimited', async () => {
    const { service, cuts } = fakeService({ ...ZERO, calls: 10 })
    setUsageService(service)
    const providers = providerWith({ calls: { enabled: true, daily: 10 } })
    const model = buildModel(llm({ limits: { calls: { enabled: true } } }), providers)

    await assert.rejects(() => generateText({ model, prompt: 'x' }), UsageLimitError)
    assert.equal(cuts[0].limit, 10, 'emptied means inherit, not unlimited')
})
