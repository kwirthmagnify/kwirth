export enum ELogComponent {
    AUTH = 'auth',
    CORE = 'core',
    PROVIDER = 'provider',
    CHANNEL = 'channel',
    STORAGE = 'storage'
}

//const ENABLED_COMPONENTS: (ELogComponent | '*')[] = ['*']
const ENABLED_COMPONENTS: (ELogComponent | '*')[] = [ ELogComponent.CHANNEL, ELogComponent.CORE, ELogComponent.PROVIDER ]

const colors = {
  reset: '\x1b[0m',
  info: '\x1b[36m',
  trace: '\x1b[32m',
  warning: '\x1b[33m',
  error: '\x1b[31m',
  component: '\x1b[35m',
  gray: '\x1b[90m'
} as const

const logGeneric = (
        level: 'trace' | 'info' | 'warn' | 'error',
        color: string,
        component: ELogComponent,
        message: unknown
    ): void => {

    const isEnabled = ENABLED_COMPONENTS.includes('*') || ENABLED_COMPONENTS.includes(component)

    if (!isEnabled && level !== 'error') return

    const timestamp = new Date().toLocaleTimeString()
    const label = level.toUpperCase()
    
    const formattedMessage = typeof message === 'object' 
        ? `\n${JSON.stringify(message, null, 2)}` 
        : message

    const output = `${colors.gray}[${timestamp}]${colors.reset} ` +
                    `${colors.component}[${component}]${colors.reset} ` +
                    `${color}[${label}] ` +
                    `${formattedMessage}${colors.reset}`

    if (level === 'error') {
        console.error(output)
    }
    else {
        console.log(output)
    }
}

export const logTrace = (message: unknown): void => {
    logGeneric('trace', colors.trace, ELogComponent.CORE, message)
}

export const logInfo = (component: ELogComponent, message: unknown): void => {
    logGeneric('info', colors.info, component, message)
}

export const logWarning = (component: ELogComponent, message: unknown): void => {
    logGeneric('warn', colors.warning, component, message)
}

export const logError = (component: ELogComponent, message: unknown): void => {
    logGeneric('error', colors.error, component, message)
}