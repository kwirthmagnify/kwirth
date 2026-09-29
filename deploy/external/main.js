const { cac } = require('cac')
const { VERSION } = require('./version.js')
const cli = cac('kwirth-external')

function startApp(options) {
    if (options.command) process.env.COMMAND = options.command
    process.env.CONTEXT = options.context // (this option is not like electron (multiple contexts), this option connects a Kwirth External to a Kubernetes cluster, just one)
    process.env.ROOTPATH = options.rootpath
    process.env.MASTERKEY = options.masterkey
    process.env.FORWARD = options.forward
    process.env.PORT = options.port
    process.env.FRONT = options.front
    process.env.METRICSINTERVAL = options.metricsinterval
    process.env.CHANNEL_LOG = options.channellog
    process.env.CHANNEL_METRICS = options.channelmetrics
    process.env.CHANNEL_ALERT = options.channelalert
    process.env.CHANNEL_ECHO = options.channelecho
    process.env.CHANNEL_TRIVY = options.trivy
    process.env.CHANNEL_MAGNIFY = options.magnify
    process.env.CHANNEL_PINOCCHIO = options.pinocchio

    require('./bundle.js')
}

// CLI config
cli
  .option('-c, --context <string>', 'Context to load', { default: '' })
  .option('-k, --apiKey', 'Context to load', { default: false })
  .option('-p, --port <number>', 'Server port', { default: 3883 })
  .option('-r, --rootpath <string>', 'Root path', { default: '' })
  .option('-k, --masterkey <string>', 'Master key', { default: 'Kwirth4Ever' })
  .option('-t, --front', 'Enable front SPA serving  <--- DEFAULT IS FALSE', { default: false })
  .option('-f, --forward', 'FORWARD feature', { default: false })
  .option('-i, --metricsinterval <number>', 'Seconds between metrics', { default: 15 })
  .option('-cl, --channellog', 'Channel LOG', { default: true })
  .option('-cm, --channelmetrics', 'Channel METRICS', { default: true })
  .option('-ca, --channelalert', 'Channel ALERT', { default: true })
  .option('-ce, --channelecho', 'Channel ECHO', { default: true })
  .option('-co, --channelops', 'Channel OPS', { default: true })
  .option('-ct, --channeltrivy', 'Channel TRIVY', { default: true })
  .option('-cy, --channelmagnify', 'Channel MAGNIFY', { default: true })
  .option('-cp, --channelpinocchio', 'Channel PINOCCHIO', { default: true })

cli.version(VERSION)
cli.help()

cli.command('start', 'Start server')
    .action((options) => {
        startApp(options)
    })

cli.command('', 'Do nothing')
    .action((options) => {
        //cli.help()
    })

cli.command('apikey', 'Create an API Key')
    .action((options) => {
        startApp({...options, command: 'APIKEY'})
    })

try {
    const parsed = cli.parse(process.argv, { run: false });
    if (parsed.options.version) process.exit(0)
    cli.runMatchedCommand();

}
catch (err) {
    console.error(`\n❌ Error: ${err.message}`)
    console.log('\nAvailable options:')
    cli.outputHelp()
    process.exit(1)
}