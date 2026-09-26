// Auxiliary config for launching the 'capture-*' specs by hand (the default config ignores them on
// purpose: they overwrite the guide's screenshots).
// Usage: playwright test --config playwright.capture.config.ts <spec>
import base from './playwright.config'
export default { ...base, testIgnore: ['**/private/**'] }
