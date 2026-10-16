/*
    e2e · deploy/compose end to end, with the REAL scripts, the REAL image and Docker (plan compose, S2 + S3).

        npm run e2e:compose

    It copies deploy/compose to a throw-away folder and drives it the way a user would: install.ps1 on Windows,
    install.sh everywhere else. What it checks is what the deployment promises:
      - 'up --sql' writes .env with a 64-hex MASTERKEY and a database password, and Kwirth becomes healthy;
      - the store is ENCRYPTED: the users file holds no clear text, and the log says so;
      - Postgres is wired: the log names the SQL server;
      - the first login is the default admin, who must change the password;
      - 'up' again keeps the MASTERKEY and the data: the new password works, the old one does not;
      - "Restart Kwirth" answers process-exit and the restart policy brings the container back healthy;
      - 'destroy' asks, refuses anything but 'destroy', and then removes the volumes.

    It does not touch a real Compose deployment: the project is 'kwirth-e2e' (COMPOSE_PROJECT_NAME beats the
    file's 'name:'), on its own port, and everything is removed at the end even if a check fails.

    The image is the published one (E2E_COMPOSE_TAG, default 'develop'): this tests the deployment, and
    whatever the core does inside it is the core's own tests' business.
*/
import { spawnSync } from 'child_process'
import { cpSync, mkdtempSync, readFileSync, rmSync, readdirSync } from 'fs'
import { tmpdir } from 'os'
import { createHash } from 'crypto'
import path from 'path'

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
const composeSource = path.join(here, '..', '..', 'deploy', 'compose')
const PORT = Number(process.env.E2E_COMPOSE_PORT ?? 13893)
const TAG = process.env.E2E_COMPOSE_TAG ?? 'develop'
const PROJECT = 'kwirth-e2e'
const BASE = `http://127.0.0.1:${PORT}`
const isWindows = process.platform === 'win32'

const work = mkdtempSync(path.join(tmpdir(), 'kwirth-e2e-compose-'))
for (const file of readdirSync(composeSource)) {
    if (file === '.env') continue
    cpSync(path.join(composeSource, file), path.join(work, file))
}
const env = { ...process.env, COMPOSE_PROJECT_NAME: PROJECT }

const results = []
const check = (name, ok, detail = '') => {
    results.push({ name, ok })
    console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const run = (command, args, input) => spawnSync(command, args, { cwd: work, env, encoding: 'utf8', input, timeout: 600_000 })
const install = (args, input) => isWindows
    ? run('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(work, 'install.ps1'), ...args], input)
    : run('sh', [path.join(work, 'install.sh'), ...args], input)
// The PowerShell script takes -Sql, -Tag, -Port; the shell one --sql, --tag, --port.
const flag = (name) => isWindows ? `-${name[0].toUpperCase()}${name.slice(1)}` : `--${name}`

const readEnv = () => Object.fromEntries(readFileSync(path.join(work, '.env'), 'utf8').split('\n').filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const sha = (text) => createHash('sha256').update(text).digest('hex')
const compose = (...args) => run('docker', ['compose', ...args])
const containerId = () => compose('ps', '-q', 'kwirth').stdout.trim()
const inspect = (format) => run('docker', ['inspect', '--format', format, containerId()]).stdout.trim()

/*
    A container reported healthy is healthy INSIDE: on Docker Desktop the port forwarding on the host can still
    be a few seconds behind, and a request in that gap fails at the socket. That is retried; an HTTP answer,
    whatever its status, is not.
*/
const request = async (url, options = {}) => {
    let lastError
    for (let attempt = 0; attempt < 10; attempt++) {
        try {
            return await fetch(url, options)
        }
        catch (err) {
            lastError = err
            await new Promise(r => setTimeout(r, 2000))
        }
    }
    throw new Error(`${url}: ${lastError?.cause?.code ?? lastError}`)
}

const login = async (password) => {
    const res = await request(`${BASE}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user: 'admin', password: sha(password) }) })
    const text = await res.text()
    return { status: res.status, body: text ? JSON.parse(text) : undefined }
}

const waitHealthy = async (timeoutMs) => {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
        if (inspect('{{if .State.Health}}{{.State.Health.Status}}{{end}}') === 'healthy') return true
        await new Promise(r => setTimeout(r, 3000))
    }
    return false
}

try {
    // ── install ──────────────────────────────────────────────────────────────────────────────────────────
    const up = install(['up', flag('sql'), flag('tag'), TAG, flag('port'), String(PORT)])
    check('install up --sql ends healthy and prints the URL', up.status === 0 && up.stdout.includes(`Kwirth is up:  http://127.0.0.1:${PORT}`), up.status === 0 ? '' : (up.stdout + up.stderr).slice(-600))

    const first = readEnv()
    check('.env holds a 64-hex MASTERKEY', /^[0-9a-f]{64}$/.test(first.MASTERKEY ?? ''))
    check('.env holds a database password', /^[0-9a-f]{64}$/.test(first.KWIRTH_SQL_PASSWORD ?? ''))
    check('.env remembers the add-on in COMPOSE_FILE', first.COMPOSE_FILE === 'docker-compose.yml,docker-compose.sql.yml', first.COMPOSE_FILE)

    // ── what Kwirth says about itself ──────────────────────────────────────────────────────────────────────
    const log = compose('logs', 'kwirth').stdout
    check('the store is encrypted files at /data', log.includes("Store: encrypted files at '/data' (KWIRTH_STORE)"))
    check('the SQL server is the compose Postgres', log.includes('SQL server kwirth@postgres:5432'))
    const users = run('docker', ['exec', containerId(), 'cat', '/data/secrets/kwirth-users']).stdout
    check('the users file holds no clear text', users.length > 0 && !users.includes('Nicklaus') && !users.includes('"password"'))

    // ── first login, password change ───────────────────────────────────────────────────────────────────────
    const firstLogin = await login('password')
    check('first login is the default admin, asked to change the password (201)', firstLogin.status === 201, String(firstLogin.status))
    const changed = await request(`${BASE}/login/password`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user: 'admin', password: sha('password'), newpassword: sha('e2e-compose-1') }) })
    check('the password can be changed', changed.status === 200, String(changed.status))

    // ── recreate: the data and the key survive ─────────────────────────────────────────────────────────────
    compose('down')
    const again = install(['up'])
    check('install up again ends healthy', again.status === 0, again.status === 0 ? '' : (again.stdout + again.stderr).slice(-600))
    const second = readEnv()
    check('the MASTERKEY is not replaced', second.MASTERKEY === first.MASTERKEY)
    check('the add-on is still there without repeating it', compose('ps', '--services').stdout.includes('postgres'))
    const newLogin = await login('e2e-compose-1')
    check('the new password still works after down/up', newLogin.status === 200, String(newLogin.status))
    check('the old password no longer does', (await login('password')).status === 401)

    // ── Restart Kwirth ─────────────────────────────────────────────────────────────────────────────────────
    const ak = newLogin.body.accessKey
    const restartsBefore = Number(inspect('{{.RestartCount}}'))
    const restart = await request(`${BASE}/managekwirth/restart`, { headers: { Authorization: `Bearer ${ak.id}|${ak.type}|${ak.resources}` } })
    const restartBody = await restart.json()
    check('Restart Kwirth answers process-exit', restart.status === 200 && restartBody.method === 'process-exit', JSON.stringify(restartBody))
    await new Promise(r => setTimeout(r, 5000))
    const healthyAgain = await waitHealthy(180_000)
    check('the restart policy brings it back healthy', healthyAgain && Number(inspect('{{.RestartCount}}')) === restartsBefore + 1, `restarts ${restartsBefore} → ${inspect('{{.RestartCount}}')}`)

    // ── destroy ────────────────────────────────────────────────────────────────────────────────────────────
    const refused = install(['destroy'], 'no\n')
    check('destroy refuses anything but "destroy"', refused.status !== 0 && containerId() !== '')
    const destroyed = install(['destroy'], 'destroy\n')
    const volumesLeft = run('docker', ['volume', 'ls', '-q', '--filter', `name=${PROJECT}_`]).stdout.trim()
    check('destroy removes the containers and the volumes', destroyed.status === 0 && volumesLeft === '', volumesLeft)
}
catch (err) {
    check('the run itself', false, String(err))
}
finally {
    compose('down', '-v', '--remove-orphans')
    rmSync(work, { recursive: true, force: true })
}

const failed = results.filter(r => !r.ok).length
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed === 0 ? 0 : 1)
