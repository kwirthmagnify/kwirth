/*
    `IBackChannelRequirements.optionalProviders` (kwirth-common 0.5.97): providers a channel USES when they are installed
    and runs without when they are not. Born from Excubitor: declaring `trivy` / `events` as required showed every
    install in a Kwirth without Kubernetes (Docker, ECS) in red — "Required provider 'trivy' not registered".

    Pinned on the source of the core, because both rules live in its startup (index.ts):
    · an optional provider is STARTED like a required one when it is installed — optional means "runs without it",
      not "does not need it here" (left out of the start, Trivy would stop working where there IS Kubernetes);
    · a missing optional provider is said as INFO when the plugin is installed, never as an error.
*/
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SRC = readFileSync(join(process.cwd(), 'src/index.ts'), 'utf8')

test('optionalProviders: started at boot like the required ones', () => {
    assert.match(SRC, /current\.requirements\.providers\.includes\(provId\) \|\| \(current\.requirements\.optionalProviders \?\? \[\]\)\.includes\(provId\)/)
})

test('optionalProviders: on a hot install, started if installed, and a missing one is INFO, not an error', () => {
    assert.match(SRC, /for \(const provId of \[\.\.\.channelInstance\.requirements\.providers, \.\.\.optional\]\)/)
    assert.match(SRC, /else if \(optional\.has\(provId\)\) \{\s*logInfo\(ELogComponent\.CORE, `Optional provider '\$\{provId\}' is not installed here/)
})

test('optionalProviders: a missing optional provider raises no startup warning (only `providers` are checked)', () => {
    assert.match(SRC, /channel\.requirements\.providers\.map\(targetId => \(\{ consumerId: channelId, targetId \}\)\)/)
})
