import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LoginRateLimiter } from '../../src/tools/LoginRateLimiter'

/*
    A5 of plans/auth-hardening: the login endpoints cap FAILED attempts per key (ip + user). The semaphore
    that was there only serialised requests, it did not slow a brute-force down.
*/

test('allows attempts until the cap, then blocks', () => {
    const rl = new LoginRateLimiter(3, 60_000, 60_000)
    assert.equal(rl.retryAfterMs('k'), 0)
    rl.fail('k')
    rl.fail('k')
    assert.equal(rl.retryAfterMs('k'), 0)   // 2 failures, still under cap of 3
    rl.fail('k')                            // 3rd failure hits the cap
    assert.ok(rl.retryAfterMs('k') > 0)
})

test('a success clears the failures', () => {
    const rl = new LoginRateLimiter(3, 60_000, 60_000)
    rl.fail('k')
    rl.fail('k')
    rl.success('k')
    rl.fail('k')
    assert.equal(rl.retryAfterMs('k'), 0)   // the two earlier failures no longer count
})

test('keys are independent', () => {
    const rl = new LoginRateLimiter(2, 60_000, 60_000)
    rl.fail('a'); rl.fail('a')
    assert.ok(rl.retryAfterMs('a') > 0)
    assert.equal(rl.retryAfterMs('b'), 0)
})

test('the window elapsing resets the counter', async () => {
    const rl = new LoginRateLimiter(2, 30, 30)   // 30ms window and block
    rl.fail('k'); rl.fail('k')
    assert.ok(rl.retryAfterMs('k') > 0)
    await new Promise(r => setTimeout(r, 50))
    assert.equal(rl.retryAfterMs('k'), 0)        // block elapsed, key is free again
})

test('retryAfterMs never exceeds the block duration', () => {
    const rl = new LoginRateLimiter(1, 60_000, 5_000)
    rl.fail('k')
    const ms = rl.retryAfterMs('k')
    assert.ok(ms > 0 && ms <= 5_000)
})
