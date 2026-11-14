import express, { Request, Response } from 'express'
import { ISecrets } from '../tools/ISecrets'
import { IConfigMaps } from '../tools/IConfigMap'
import { ApiKeyApi } from './ApiKeyApi'
import { AuthorizationManagement } from '../tools/AuthorizationManagement'
import { STORAGE_KEY_PROVIDERS, STORAGE_KEY_LLMS, ILlm, ILlmProvider } from '@kwirthmagnify/kwirth-common-ai'
import { EUsageScope, getUsageService, loadModels, usageSubjectForKey, buildModel, generateText, UsageLimitError } from '@kwirthmagnify/kwirth-common-ai/back'
import { IConfigAiAssistRequest, IConfigAiAssistResponse } from '@kwirthmagnify/kwirth-common'
import { ELogComponent, logError, logInfo, logWarning } from '../tools/Logging'
import { buildAiAssistPrompt, stripFences, validateAiAssistRequest } from '../tools/AiAssist'

export class AiConfigApi {
    public router = express.Router()
    private secrets: ISecrets
    private configMaps: IConfigMaps

    constructor(secrets: ISecrets, configMaps: IConfigMaps, apiKeyApi: ApiKeyApi) {
        this.secrets = secrets
        this.configMaps = configMaps

        const authMiddleware = async (req: Request, res: Response, next: express.NextFunction) => {
            if (!(await AuthorizationManagement.validKey(req, res, apiKeyApi))) return
            next()
        }

        this.router.route('/providers')
            .all(authMiddleware)
            .get(async (_req: Request, res: Response) => {
                try {
                    const content = await this.secrets.read('kwirth-store-common-' + STORAGE_KEY_PROVIDERS)
                    if (content && content['data']) {
                        const decoded = Buffer.from(content['data'], 'base64').toString('utf8')
                        res.status(200).json(JSON.parse(decoded))
                    }
                    else {
                        res.status(200).json([])
                    }
                }
                catch (err) {
                    console.error('AiConfigApi: error reading providers', err)
                    res.status(500).json([])
                }
            })
            .post(async (req: Request, res: Response) => {
                try {
                    const base64Data = Buffer.from(JSON.stringify(req.body), 'utf8').toString('base64')
                    await this.secrets.write('kwirth-store-common-' + STORAGE_KEY_PROVIDERS, { data: base64Data })
                    res.status(200).json()
                }
                catch (err) {
                    console.error('AiConfigApi: error writing providers', err)
                    res.status(500).json()
                }
            })

        this.router.post('/loadmodels', authMiddleware, async (req: Request, res: Response) => {
            try {
                const provider: ILlmProvider = req.body
                // The core's logger, not the console: these lines say why a provider came back with no
                // models, and on the console they are outside the log level, the colouring and the buffer
                // the settings control — so nobody sees them where the rest of the logs are read.
                await loadModels([provider], {
                    logInfo: (msg: string) => logInfo(ELogComponent.CORE, msg),
                    logWarning: (msg: string) => logWarning(ELogComponent.CORE, msg),
                    logError: (msg: string) => logError(ELogComponent.CORE, msg)
                })
                res.status(200).json(provider.models ?? [])
            }
            catch (err) {
                console.error('AiConfigApi: error loading models', err)
                res.status(500).json([])
            }
        })

        this.router.post('/assist', authMiddleware, (req: Request, res: Response) => this.assist(req, res))

        this.router.route('/llms')
            .all(authMiddleware)
            .get(async (_req: Request, res: Response) => {
                try {
                    const content = await this.configMaps.read('kwirth-store-common-' + STORAGE_KEY_LLMS)
                    if (content) {
                        res.status(200).json(JSON.parse(content))
                    }
                    else {
                        res.status(200).json([])
                    }
                }
                catch (err) {
                    console.error('AiConfigApi: error reading llms', err)
                    res.status(500).json([])
                }
            })
            .post(async (req: Request, res: Response) => {
                try {
                    await this.configMaps.write('kwirth-store-common-' + STORAGE_KEY_LLMS, JSON.stringify(req.body))
                    res.status(200).json()
                }
                catch (err) {
                    console.error('AiConfigApi: error writing llms', err)
                    res.status(500).json()
                }
            })

        /*
            What each provider and each model has spent in the current day and month, so an admin sets a
            ceiling knowing where he already is instead of guessing.

            It is computed HERE and keyed by name and by id — never by the subject the counters use — so
            that the hash of a key does not travel to a browser, and so the front end never has to know
            that the counters are keyed by key at all.
        */
        this.router.route('/usage')
            .all(authMiddleware)
            .get(async (_req: Request, res: Response) => {
                try {
                    const service = getUsageService()
                    if (!service) { res.status(200).json({ available: false, durable: false, providers: {}, llms: {} }); return }

                    const providers = await this.readProviders()
                    const llms = await this.readLlms()
                    const providerUsage: Record<string, unknown> = {}
                    const llmUsage: Record<string, unknown> = {}

                    for (const p of providers) {
                        if (p.key) providerUsage[p.name] = await service.read(EUsageScope.LLM_KEY, usageSubjectForKey(p.key))
                    }
                    // Only models with their OWN key have a budget of their own; the rest spend the provider's
                    for (const l of llms) {
                        if (!l.useProviderKey && l.key) llmUsage[l.id] = await service.read(EUsageScope.LLM_KEY, usageSubjectForKey(l.key))
                    }
                    res.status(200).json({ available: true, durable: service.durable, providers: providerUsage, llms: llmUsage })
                }
                catch (err) {
                    console.error('AiConfigApi: error reading ai usage', err)
                    res.status(500).json({ available: false, durable: false, providers: {}, llms: {} })
                }
            })
    }

    /*
        POST /assist — an LLM drafts the value of one field of a configuration form (IConfigFieldDef with
        'aiInstructions'). The gate is the same as the one editing an extension's configuration: whoever
        can write the field can ask for it to be drafted.

        🔴 Called with NO tools: the model writes text and nothing else. The wrapped generateText counts
        the call against the key's ceilings like any other LLM call in Kwirth; a ceiling reached is a 429,
        so the dialog can say exactly that instead of "it failed".
    */
    private async assist(req: Request, res: Response): Promise<void> {
        const body = req.body as IConfigAiAssistRequest | undefined
        const invalid = validateAiAssistRequest(body)
        if (invalid || !body) { res.status(400).json({ error: invalid }); return }

        const llm = (await this.readLlms()).find(l => l.id === body.llmId)
        if (!llm) { res.status(404).json({ error: `LLM '${body.llmId}' is not configured` }); return }
        const model = buildModel(llm, await this.readProviders())
        if (!model) { res.status(400).json({ error: `LLM '${body.llmId}' cannot be used: its provider or key is missing` }); return }

        try {
            const { system, prompt } = buildAiAssistPrompt(body)
            const result = await generateText({ model, system, prompt })
            const answer: IConfigAiAssistResponse = { text: stripFences(result.text) }
            res.status(200).json(answer)
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            if (err instanceof UsageLimitError) { res.status(429).json({ error: msg }); return }
            logError(ELogComponent.CORE, `AiConfigApi: the AI assistant failed for field '${body.fieldName}': ${msg}`)
            res.status(502).json({ error: msg })
        }
    }

    private async readProviders(): Promise<ILlmProvider[]> {
        const content = await this.secrets.read('kwirth-store-common-' + STORAGE_KEY_PROVIDERS)
        if (!content || !content['data']) return []
        return JSON.parse(Buffer.from(content['data'], 'base64').toString('utf8')) as ILlmProvider[]
    }

    private async readLlms(): Promise<ILlm[]> {
        const content = await this.configMaps.read('kwirth-store-common-' + STORAGE_KEY_LLMS)
        return content ? JSON.parse(content) as ILlm[] : []
    }
}
