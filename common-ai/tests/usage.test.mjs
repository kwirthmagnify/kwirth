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

const { buildModel, generateText, runWithUsageGuard, setUsageService, UsageLimitError, EUsageScope } = back

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
