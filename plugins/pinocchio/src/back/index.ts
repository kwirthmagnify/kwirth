import { IExtensionImportResult, IInstanceConfig, ISignalMessage, IInstanceMessage, AccessKey, accessKeyDeserialize, EClusterType, BackChannelData, EInstanceMessageType, EInstanceMessageAction, EInstanceMessageFlow, ESignalMessageLevel } from '@kwirthmagnify/kwirth-common'
import { IBackChannelObject } from '@kwirthmagnify/kwirth-common-back'
import { EPinocchioCommand, IAnalysis, IConfigTrigger, IConfigTriggerVersion, IConfigProvider, IPinocchioConfig, IPinocchioMessage, IPinocchioMessageResponse, kindsAvailable, IMessage } from './PinocchioConfig'
import { STORAGE_KEY_PROVIDERS, STORAGE_KEY_LLMS, PROVIDERS_AVAILABLE } from '@kwirthmagnify/kwirth-common-ai'
import { buildModel, loadModels, IToolContext, buildAgentTools, listToolsets, resolveTools } from '@kwirthmagnify/kwirth-common-ai/back'
import { IToolsetConfig } from '@kwirthmagnify/kwirth-common-ai'
import { Request, Response } from 'express'
import { generateText, Output, stepCountIs, z, LanguageModel, ToolSet } from '@kwirthmagnify/kwirth-common-ai/back'

const _ = require('lodash')
const nunjucks = require('nunjucks')

const MAX_ANALYSIS_HISTORY = 50

// basic nunjucks config
nunjucks.configure({ autoescape: true })

interface IInstance {
    instanceId: string
    accessKey: AccessKey
}

interface IEventsProviderEvent {
    type: 'ADDED'|'MODIFIED'|'DELETED'
    obj:any
}

interface IBusinessProviderEvent {
    last: {
        type: 'event',
        timestamp: number,
        event: any
    },
    all: Map<string, Map<string,any[]>>
}

interface IModelInvocation {
    llmProviderId: string
    llmModelId: string
    model: any
    temperature: number
    providerOptions: any
    errorPath: string
    system: string
    prompt: string
    tools: any
    toolContext: IToolContext
}

/** Tope de lo que se vuelca de un resultado de tool en la traza. */
const TRAZA_MAX = 400

/** Con este id se identifica el canal al pedir tools: es el que el admin ve al conceder un toolset. */
const PINOCCHIO_ID = 'pinocchio'

export class PinocchioChannel {
    readonly channelId = 'pinocchio'
    readonly requirements = {
        storage: true,
        providers: ['events', 'business', 'metrics']
    }
    clusterInfo: any
    backChannelObject: IBackChannelObject
    connections: {
        webSocket:WebSocket,
        lastRefresh: number,
        instances: IInstance[]
    }[] = []
    clusterMetrics: any[] = []
    analysis: IAnalysis[] = []
    providers: IConfigProvider[] = []
    pinocchioConfig: IPinocchioConfig = {
        triggers: [],
        llms: []
    }
    private startChannelReady: Promise<void> | null = null
    playgroundTrigger: IConfigTriggerVersion | undefined = undefined
    startTime: number

    constructor (clusterInfo: any, backChannelObject: IBackChannelObject) {
        this.clusterInfo = clusterInfo
        this.backChannelObject = backChannelObject
        this.startTime = Date.now()
    }

    startChannel = () => {
        this.startChannelReady = this._startChannelImpl()
    }

    _startChannelImpl = async () =>  {
        this.clusterInfo.addSubscriber('metrics', this, {})
        this.clusterInfo.addSubscriber('business', this, {
            spaces: [
                { name: 'customers', types: ['status'] },
                { name: 'branches', types: ['status'] },
                { name: 'launch', types: ['immediate'] }
            ]
        })
        this.clusterInfo.addSubscriber('events', this, {
            kinds: kindsAvailable,
            crdInstances: [],
            syncCrdInstances: false
        })
        let provs = await this.backChannelObject.readStorageCommon!(STORAGE_KEY_PROVIDERS, true)
        if (provs) this.providers = provs
        let rawConfig = await this.backChannelObject.readStorage!('pinocchio-config', false)
        let config: IPinocchioConfig | null = null
        if (typeof rawConfig === 'string') {
            try { config = JSON.parse(rawConfig) } catch {}
        } else if (rawConfig) {
            config = rawConfig as IPinocchioConfig
        }
        if (config) this.pinocchioConfig = config
        try {
            const sharedLlms = await this.backChannelObject.readStorageCommon!(STORAGE_KEY_LLMS, false)
            if (sharedLlms?.length) this.pinocchioConfig.llms = sharedLlms
        } catch { /* shared LLMs not yet configured */ }
        loadModels(this.providers, this.backChannelObject)
    }

    getChannelData = (): BackChannelData => {
        return {
            id: 'pinocchio',
            routable: false,
            pauseable: true,
            modifiable: false,
            reconnectable: true,
            metrics: false,
            sources: [ EClusterType.KUBERNETES ],
            endpoints: [],
            websocket: false,
            cluster: true,
            resourced: false
        }
    }

    getChannelScopeLevel = (scope: string): number => {
        return ['', 'none', 'cluster'].indexOf(scope)
    }

    /**
     * El techo de tools de una version, en el modelo del registro.
     *
     * ⚠️ `version.tools` guarda nombres CORTOS ('get_pod_logs'), que es lo que hay persistido en las
     * configuraciones de los clientes. Aqui se traducen a config de toolsets SIN tocar lo guardado: se
     * activan los toolsets que aportan alguna de las elegidas y se apagan el resto de sus tools. Migrar
     * lo persistido a referencias cualificadas es de S5, cuando exista el editor.
     */
    toolsetConfig = (version: IConfigTriggerVersion): IToolsetConfig => {
        if (version.autoTools) return { activeToolsets: listToolsets().map(t => t.id), disabledTools: [] }

        const elegidas = new Set(version.tools ?? [])
        const activeToolsets: string[] = []
        const disabledTools: string[] = []
        for (const toolset of listToolsets()) {
            if (!toolset.tools.some(t => elegidas.has(t.name))) continue
            activeToolsets.push(toolset.id)
            for (const t of toolset.tools) {
                if (!elegidas.has(t.name)) disabledTools.push(`${toolset.id}/${t.name}`)
            }
        }
        return { activeToolsets, disabledTools }
    }

    /**
     * Genera una salida ESTRUCTURADA pudiendo usar tools.
     *
     * ⚠️ No se puede pedir tools y esquema de respuesta en la MISMA llamada: el proveedor de Google manda
     * `responseSchema` junto a las `functionDeclarations`, y entonces la tool se ejecuta, devuelve, y la
     * respuesta estructurada no llega nunca — `AI_NoOutputGeneratedError`. Se destapo al activar `Auto`
     * en un trigger (QA de S3, 2026-09-17); antes ninguna version con tools usaba salida estructurada.
     *
     * El propio Playground de este canal ya sorteaba lo mismo con dos fases. Aqui se hace igual, pero
     * cerrando con el esquema:
     *
     *   fase 1 — CON tools, texto libre: el modelo recoge lo que necesite del cluster
     *   fase 2 — SIN tools, con `Output.object`: redacta el JSON a partir de lo recogido
     *
     * Sin tools se hace UNA sola llamada, como siempre: la segunda fase solo se paga cuando hace falta.
     */
    generateStructured = async <T>(params: {
        model: LanguageModel,
        temperature: number,
        providerOptions: Record<string, unknown>,
        system: string,
        prompt: string,
        tools: ToolSet,
        steps: number,
        schema: z.ZodType<T>
    }): Promise<{ output: T, usage: { inputTokens?: number, outputTokens?: number } }> => {
        const { model, temperature, system, prompt, tools, steps, schema } = params
        const output = Output.object({ schema }) as never
        // El canal construye providerOptions como Record<string, unknown> (lo hace en buildModelInvocation
        // y viene de antes); el SDK pide JSONObject. Un solo casteo aqui, en vez de uno en cada llamada.
        const providerOptions = params.providerOptions as never

        if (Object.keys(tools ?? {}).length === 0) {
            const solo = await generateText({ model, temperature, providerOptions, output, system, prompt })
            return { output: solo.output as T, usage: solo.usage }
        }

        const fase1 = await generateText({ model, temperature, providerOptions, tools, stopWhen: stepCountIs(steps), system, prompt })

        const recogido: string[] = []
        for (const step of fase1.steps) {
            for (const r of (step as unknown as { toolResults?: { toolName: string, output: unknown }[] }).toolResults ?? []) {
                recogido.push(`${r.toolName}: ${JSON.stringify(r.output)}`)
            }
        }
        this.backChannelObject.logTrace?.(`[pinocchio] fase 1: ${fase1.steps.length} paso(s), ${recogido.length} resultado(s) de tool -> fase 2 sin tools`)

        // Lo recogido va al prompt de la fase 2. Si el modelo no llamo a nada pero dijo algo, se usa su
        // texto: tirarlo obligaria a rehacer el analisis desde cero.
        const promptFinal = recogido.length > 0
            ? `${prompt}\n\nInformation gathered from tools:\n${recogido.join('\n')}`
            : (fase1.text ? `${prompt}\n\nPreliminary analysis:\n${fase1.text}` : prompt)

        const fase2 = await generateText({ model, temperature, providerOptions, output, system, prompt: promptFinal })
        return {
            output: fase2.output as T,
            usage: {
                inputTokens: (fase1.usage.inputTokens ?? 0) + (fase2.usage.inputTokens ?? 0),
                outputTokens: (fase1.usage.outputTokens ?? 0) + (fase2.usage.outputTokens ?? 0)
            }
        }
    }

    buildModelInvocation = async (trigger: IConfigTrigger, version: IConfigTriggerVersion, event: IEventsProviderEvent|IBusinessProviderEvent|unknown) : Promise<IModelInvocation|undefined> => {
        let prompt
        let llm = this.pinocchioConfig.llms.find(l => l.id === version.llm)
        if (!llm) {
            this.broadcastError(`Cannot find LLM with id '${version.llm}'`)
            return undefined
        }
        const model = buildModel(llm, this.providers)
        if (!model) {
            this.broadcastError(`Cannot build model for LLM '${version.llm}' (provider: ${llm.provider})`)
            return undefined
        }
        switch(trigger.trigger) {
            case 'business':
                let businessEvent = event as IBusinessProviderEvent
                let nunjucksObj:any = {}
                for (let spaceType of version.spaces) {
                    let [space, type] = spaceType.split('.')
                    let spaceData = businessEvent.all.get(space)
                    if (spaceData) {
                        let typeData = spaceData.get(type)
                        if (typeData) {
                            nunjucksObj[space] = {}
                            nunjucksObj[space][type] = {}
                        }
                    }
                }
                prompt = nunjucks.renderString(version.prompt, {})
                break
            case 'artifact':
                let eventsEvent = event as IEventsProviderEvent
                switch(version.promptType) {
                    case 'artifact':
                        prompt = JSON.stringify(eventsEvent.obj)
                        break
                    case 'jinja':
                        prompt = nunjucks.renderString(version.prompt, eventsEvent.obj)
                        break
                }
                break
            default:
                this.backChannelObject.logWarning?.(`[pinocchio] received invalid trigger type: '${trigger.trigger}'`)
                return undefined
        }

        let system = version.system
        let temperature = llm.temperature
        if (temperature<0) temperature=0
        if (temperature>1) temperature=1
        const toolContext: IToolContext = {
            origin: 'Pinocchio',
            nodes: await this.clusterInfo.getNodes(),
            clusterInfo: this.clusterInfo,
            clusterMetrics: this.clusterMetrics,
            trace: (toolName, args) => this.backChannelObject.logTrace?.(`[pinocchio] tool ${toolName} ${JSON.stringify(args)}`)
        }
        // Las tools ya no se cogen de common-ai: salen del REGISTRO de toolsets (plan S2/S3). Pinocchio
        // dice que quiere y el core resuelve precedencia, apagadas y capacidades.
        //
        // `autoTools` sigue significando lo mismo que hasta ahora —partir de todo lo disponible— solo que
        // "todo" es ahora "todos los toolsets instalados", no las 43 compiladas dentro del core.
        const techo = this.toolsetConfig(version)
        const tools = buildAgentTools(techo, toolContext, {
            // Lo que antes hacia un lambda envolviendo cada execute. La traza ahora lleva la referencia
            // CUALIFICADA: con precedencia, el nombre corto no dice que codigo corrio.
            observe: (invocation, outcome) => {
                // El resultado se RECORTA en la traza: un get_*_yaml vuelca el manifest entero con sus
                // managedFields y deja el log inservible. Al modelo le llega completo; aqui solo el
                // principio, que es para lo que sirve una traza — ver que se llamo y que devolvio algo.
                const bruto = outcome.ok ? JSON.stringify(outcome.result) : `ERROR ${outcome.error}`
                const detalle = bruto.length > TRAZA_MAX ? `${bruto.slice(0, TRAZA_MAX)}… (${bruto.length} chars)` : bruto
                this.backChannelObject.logTrace?.(`[pinocchio] tool ${invocation.ref} (${outcome.ms}ms) ${detalle}`)
            }
        // ⚠️ El ultimo argumento es QUIEN pide. Sin el, la resolucion no filtra por concesion y el plugin
        // se serviria toolsets que el admin no le ha concedido. No es cosmetico: es el techo.
        }, PINOCCHIO_ID)

        // Traza de diagnostico: sin esto, "el modelo no llamo a ninguna tool" y "no le ofrecimos
        // ninguna" se ven exactamente igual — que es justo lo que despisto en el QA de S3.
        // Con el trigger y la version delante no hay que adivinar CUAL de las versiones habilitadas es la
        // que se esta resolviendo, que es lo que confundio el QA: varias versiones, y solo una tocada.
        // Lo NEGADO se traza igual de alto que lo concedido: "no me lo han concedido" y "no esta
        // instalado" son las dos causas de que un agente responda peor, y sin decirlo no hay forma de
        // distinguirlas desde fuera.
        const resolucion = resolveTools(techo, PINOCCHIO_ID)
        const pegas = [
            resolucion.notGranted.length ? `SIN CONCEDER [${resolucion.notGranted.join(', ')}]` : '',
            resolucion.missing.length ? `SIN INSTALAR [${resolucion.missing.join(', ')}]` : ''
        ].filter(Boolean).join(' ')
        this.backChannelObject.logTrace?.(`[pinocchio] ${trigger.id}/${version.id}: auto=${!!version.autoTools} marcadas=${version.tools?.length ?? 0} -> ${Object.keys(tools).length} tools ofrecidas ${pegas || `[${techo.activeToolsets.join(', ') || 'ninguno'}]`}`)

        let providerOptions: Record<string, unknown> = {}
        let errorPath = ''
        switch (llm.provider) {
            case 'google':
                providerOptions = { google: { structuredOutputs: true } }
                errorPath = 'lastError.data.error.message'
                break
            case 'groq':
                providerOptions = { groq: { structuredOutputs: true } }
                break
            case 'mistral':
                providerOptions = { mistral: { strictJsonSchema: true, structuredOutputs: true } }
                break
            default:
                providerOptions = { openai: {} }
        }

        return {
            llmProviderId: llm.provider,
            llmModelId: llm.model,
            model,
            providerOptions,
            errorPath,
            temperature,
            tools,
            toolContext,
            prompt,
            system
        }
    }

    async processProviderEvent(providerId:string, event: IEventsProviderEvent|IBusinessProviderEvent|any) : Promise<void> {
        switch(providerId) {
            case 'business':
                let businessEvent = event as IBusinessProviderEvent
                this.backChannelObject.logInfo?.(`[pinocchio] business event: ${JSON.stringify(event)}`)

                if (this.playgroundTrigger) {
                    const lastEvt = businessEvent.last?.event
                    if (lastEvt?.space === 'launch' && lastEvt?.type === 'immediate') {
                        const payload = typeof lastEvt.data === 'string' ? lastEvt.data : JSON.stringify(lastEvt.data ?? '')
                        const triggerType: 'business' | 'artifact' = lastEvt.triggerType === 'artifact' ? 'artifact' : 'business'
                        await this.executePlayground(payload, triggerType, lastEvt.kind)
                        break
                    }
                }

                for (let t of this.pinocchioConfig.triggers.filter(t => t.trigger === 'business')) {
                  for (let version of t.versions.filter(v => v.enabled)) {
                    try {
                        let {llmModelId, llmProviderId, model, temperature, providerOptions, errorPath, system, prompt, tools, toolContext} = await this.buildModelInvocation(t, version, businessEvent) || {}
                        if (!model) return

                        this.broadcastMessage(`Received business event ${JSON.stringify(businessEvent.last.event)}`)
                        const { output } = await this.generateStructured({
                            model,
                            temperature: temperature ?? 0,
                            providerOptions: providerOptions ?? {},
                            tools: tools ?? {},
                            steps: version.steps || 15,
                            schema: z.object({
                                response: z.string().describe('response to the question'),
                            }),
                            system: "Use the tools provided to find information, and once you have the data, format your final response strictly as a JSON object according to the schema.",
                            prompt: prompt||'Hi AI, how are you?',
                        })
                        this.broadcastMessage(JSON.stringify(output.response))
                    }
                    catch (err:any) {
                        let message = `Pinocchio analysis ended in error when processing 'business' while analyzing`
                        this.backChannelObject.logError?.(`${message}: ${err}`)
                        this.broadcastMessage(message)
                        this.broadcastMessage(JSON.stringify(err))
                    }
                  }
                }
                break
            case 'metrics':
                let metricsEvent = event as any
                this.clusterMetrics.push(metricsEvent)
                if (this.clusterMetrics.length>100) this.clusterMetrics.shift()
                break
            case 'events':
                let eventsEvent = event as IEventsProviderEvent
                try {
                    //if (eventsEvent.type!=='MODIFIED') this.backChannelObject.logInfo?.(`[pinocchio] k8s event: ${eventsEvent.type} ${eventsEvent.obj.kind}/${eventsEvent.obj.metadata?.name} — triggers: ${this.pinocchioConfig.triggers?.length ?? 0}`)
                    for (let t of this.pinocchioConfig.triggers.filter(t => t.trigger === 'artifact' && t.kind === eventsEvent.obj.kind && (!t.k8sEvent || t.k8sEvent === eventsEvent.type))) {
                      for (let version of t.versions.filter(v => v.enabled)) {
                        this.backChannelObject.logInfo?.(`[pinocchio] ${eventsEvent.type} ${eventsEvent.obj.kind} ${eventsEvent.obj.metadata?.name}`)
                        if (eventsEvent.type === 'ADDED' && eventsEvent.obj?.metadata?.creationTimestamp) {
                                let creationTs = Date.parse(eventsEvent.obj?.metadata?.creationTimestamp)
                                if (creationTs<this.startTime) {
                                    this.backChannelObject.logWarning?.(`[pinocchio] bypass object analysis, creation timestamp is previous for object ${eventsEvent.obj?.metadata?.name} and kind ${t.kind} for LLM ${version.llm}`)
                                    continue
                                }
                            }

                            let {llmModelId, llmProviderId, model, temperature, providerOptions, errorPath, system, prompt, tools, toolContext} = await this.buildModelInvocation(t, version, eventsEvent) || {}
                            if (!model) return

                            try {
                                const { output, usage } = await this.generateStructured({
                                    model,
                                    temperature: temperature ?? 0,
                                    providerOptions: providerOptions ?? {},
                                    tools: tools ?? {},
                                    steps: version.steps || 15,
                                    schema: z.object({
                                            resource: z.object({
                                                kind:z.string(),
                                                name:z.string(),
                                                namespace:z.string(),
                                                images: z.array(z.string()),
                                            }),
                                            pss_current: z.enum(["privileged", "baseline", "restricted", "undefined"]),
                                            pss_target: z.enum(["privileged", "baseline", "restricted", "undefined"]),
                                            score_summary: z.object({
                                                critical: z.number(),
                                                high: z.number(),
                                                medium: z.number(),
                                                low: z.number()
                                            }),
                                            global_risk:  z.enum(['low', 'medium', 'high', 'critical']),
                                            controls_passed: z.array(z.string()),
                                            not_visible: z.array(z.string()),
                                            next_steps: z.array(z.string()),
                                            report: z.string().min(1),
                                            findings: z.array(
                                                z.object({
                                                    control_id: z.string(),
                                                    control_name: z.string(),
                                                    category: z.enum(["privileges" , "identity" , "network" , "filesystem" , "supply_chain" , "resources" , "secrets" , "general" , "platform"]),
                                                    level: z.enum(['low', 'medium', 'high', 'critical']),
                                                    confidence: z.enum(['low', 'medium', 'high']),
                                                    evidence: z.string(),
                                                    impact: z.string(),
                                                    remediation: z.string(),
                                                    references: z.array(z.string()),
                                                    risk_score: z.number(),
                                                    description: z.string().min(1),
                                                })
                                            ),
                                            hardened_yaml: z.string().min(1)
                                    }),
                                    system: system||'You are a very polite AI system',
                                    prompt: prompt||'Hi AI, how are you?',
                                })

                                let analysis:IAnalysis = {
                                    text: `${eventsEvent.type} ${eventsEvent.obj.kind} '${eventsEvent.obj.metadata.name}' in namespace '${eventsEvent.obj.metadata.namespace}' [LLM:${llmProviderId}/${llmModelId}, IN:${usage.inputTokens}, OUT:${usage.outputTokens}]`,
                                    findings: output.findings,
                                    resource: output.resource,
                                    pss_current: output.pss_current,
                                    pss_target: output.pss_target,
                                    score_summary: output.score_summary,
                                    global_risk: output.global_risk,
                                    controls_passed: output.controls_passed,
                                    not_visible: output.not_visible,
                                    next_steps: output.next_steps,
                                    ...(output.report? {report: output.report}:{}),
                                    ...(output.hardened_yaml? {hardened_yaml: output.hardened_yaml}:{}),
                                    timestamp: Date.now(),
                                    usage: {
                                        input: usage.inputTokens,
                                        output: usage.outputTokens
                                    },
                                    pod: eventsEvent.obj
                                }
                                this.analysis.push(analysis)
                                if (this.analysis.length > MAX_ANALYSIS_HISTORY) this.analysis.shift()
                                this.broadcastAnalysis(analysis)
                            }
                            catch (err:any) {
                                let message = `Pinocchio analysis ended in error while processing 'events' when analyzing '${eventsEvent.obj.metadata.name}' in namespace '${eventsEvent.obj.metadata.namespace}' [Kind:${eventsEvent.obj.kind}]`
                                this.backChannelObject.logError?.(`${message}: ${err}`)
                                try {
                                    let msg = _.get(err, errorPath)
                                }
                                catch {}
                                let an:IAnalysis = {
                                    findings: [
                                        { description: message, level: 'critical'},
                                        { description: JSON.stringify(err), level: 'critical'}
                                    ],
                                    timestamp: Date.now()
                                }
                                this.broadcastAnalysis(an)
                            }
                          }
                        }
                    }
                    catch (err) {
                        this.backChannelObject.logError?.(`[pinocchio] error in processProviderEvent: ${err}`)
                    }
                break
            default:
                this.backChannelObject.logWarning?.(`[pinocchio] ignored provider event from '${providerId}'`)
        }
    }

    async endpointRequest(endpoint:string, req: Request, res: Response) : Promise<void> {
    }

    async websocketRequest(newWebSocket:WebSocket) : Promise<void> {
    }

    containsAsset = (webSocket:WebSocket, podNamespace:string, podName:string, containerName:string): boolean => {
        return false
    }

    containsInstance = (instanceId: string): boolean => {
        return this.connections.some(socket => socket.instances.find(i => i.instanceId === instanceId))
    }

    /*
        ── Portabilidad de configuracion (IExtension) ──────────────────────────────────────────────

        Lo que pinocchio guarda son TRES cosas distintas, y solo una es configuracion portable:

          · SI viaja   los triggers: lo que alguien ha compuesto —sus versiones, prompts, acciones y
                       tools—, y lo que duele rehacer a mano en otro Kwirth.
          · NO viaja   los LLMs: aunque `IPinocchioConfig` los lleve dentro, su origen real es el
                       almacen COMUN (`STORAGE_KEY_LLMS`), que comparten varias extensiones y que
                       `startChannel` vuelve a leer al arrancar. No son de pinocchio: los exporta el
                       core como entrada propia del bundle.
          · NO viaja   el playground: es un banco de pruebas, el borrador de quien esta trasteando
                       aqui. Replicarlo en otro cluster no tiene ningun sentido.

        Los triggers no llevan credenciales propias —`llm` es una referencia—, asi que
        `includeCredentials` no cambia lo que sale.
    */
    exportConfig = async (): Promise<unknown> => {
        const raw = await this.backChannelObject.readStorage!('pinocchio-config', false)
        const config = (typeof raw === 'string' ? JSON.parse(raw) : raw) as IPinocchioConfig | null
        return { triggers: config?.triggers ?? [] }
    }

    importConfig = async (data: unknown): Promise<IExtensionImportResult> => {
        const warnings: string[] = []

        // Puede venir de otro Kwirth y puede haberse editado a mano: nada se da por bueno.
        const entrantes = (data as { triggers?: unknown })?.triggers
        if (!Array.isArray(entrantes)) return { applied: 0, skipped: 0, warnings: ['no triggers array in the imported data'] }

        const raw = await this.backChannelObject.readStorage!('pinocchio-config', false)
        const config = ((typeof raw === 'string' ? JSON.parse(raw) : raw) ?? { triggers: [], llms: [] }) as IPinocchioConfig
        const actuales = config.triggers ?? []
        // Los LLMs que hay AQUI, para avisar de los triggers que apuntan a uno que no existe.
        const llmsDisponibles = new Set((config.llms ?? []).map(l => l.id))

        let applied = 0
        let skipped = 0
        for (const cruda of entrantes) {
            const trigger = cruda as IConfigTrigger
            if (!trigger || typeof trigger.id !== 'string' || !Array.isArray(trigger.versions)) {
                skipped++
                warnings.push('a trigger without id or versions was discarded')
                continue
            }
            for (const v of trigger.versions) {
                if (v.llm && !llmsDisponibles.has(v.llm)) {
                    warnings.push(`trigger '${trigger.id}' version '${v.id}' references LLM '${v.llm}', which is not configured here`)
                }
            }
            // Upsert por id: de aqui sale la idempotencia que exige el contrato.
            const idx = actuales.findIndex(t => t.id === trigger.id)
            if (idx >= 0) actuales[idx] = trigger
            else actuales.push(trigger)
            applied++
        }

        // Se reescribe SOLO la parte de triggers: los llms y el playground que hubiera se quedan como estaban.
        await this.backChannelObject.writeStorage!('pinocchio-config', false, { ...config, triggers: actuales })
        this.pinocchioConfig = { ...this.pinocchioConfig, triggers: actuales }
        return { applied, skipped, warnings }
    }

    processCommand = async (webSocket:WebSocket, instanceMessage:IInstanceMessage) : Promise<boolean> => {
        if (instanceMessage.flow === EInstanceMessageFlow.IMMEDIATE) {
            return false
        }
        else {
            let instance = this.getInstance(webSocket, instanceMessage.instance)
            if (!instance) {
                this.sendSignalMessage(webSocket, instanceMessage.action, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instanceMessage.instance, `Instance not found`)
                this.backChannelObject.logWarning?.(`[pinocchio] instance ${instanceMessage.instance} not found`)
                return false
            }
            let pinocchioMessage = instanceMessage as IPinocchioMessage
            switch(pinocchioMessage.command) {
                case EPinocchioCommand.PROVIDERSAVAILABLE:
                    let msgProvidersAvailable:IPinocchioMessageResponse = {
                        msgtype: 'pinocchiomessageresponse',
                        channel: 'pinocchio',
                        action: EInstanceMessageAction.COMMAND,
                        flow: EInstanceMessageFlow.RESPONSE,
                        type: EInstanceMessageType.DATA,
                        instance: instance.instanceId,
                        providersAvailable: PROVIDERS_AVAILABLE
                    }
                    webSocket.send(JSON.stringify(msgProvidersAvailable))
                    break
                case EPinocchioCommand.TOOLSAVAILABLE:
                    let msgToolsAvailable:IPinocchioMessageResponse = {
                        msgtype: 'pinocchiomessageresponse',
                        channel: 'pinocchio',
                        action: EInstanceMessageAction.COMMAND,
                        flow: EInstanceMessageFlow.RESPONSE,
                        type: EInstanceMessageType.DATA,
                        instance: instance.instanceId,
                        // Del registro, ya resueltas y filtradas por lo CONCEDIDO: ofrecer una tool que
                        // luego no se va a poder usar es peor que no ofrecerla — el usuario la marca, se
                        // va tan tranquilo, y el agente nunca la llama.
                        // Y si dos toolsets traen el mismo nombre, se ofrece la que de verdad correria.
                        toolsAvailable: resolveTools({ activeToolsets: listToolsets().map(t => t.id), disabledTools: [] }, PINOCCHIO_ID)
                            .effective.map(e => ({ name: e.name, description: e.tool.description, effect: e.tool.effect }))
                    }
                    webSocket.send(JSON.stringify(msgToolsAvailable))
                    break
                case EPinocchioCommand.PROVIDERSGET:
                    this.executeProvidersGet()
                    break
                case EPinocchioCommand.CONFIGGET:
                    this.executeConfigGet()
                    break
                case EPinocchioCommand.CONFIGSET:
                    let config:IPinocchioConfig = pinocchioMessage.data as IPinocchioConfig
                    this.pinocchioConfig = config
                    await this.backChannelObject.writeStorage!('pinocchio-config', false, config)
                    if (config.llms?.length) await this.backChannelObject.writeStorageCommon!(STORAGE_KEY_LLMS, false, config.llms)
                    this.executeConfigGet()
                    this.sendSignalMessage(webSocket, EInstanceMessageAction.COMMAND, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.INFO, instance.instanceId, 'Config updated')
                    break
                case EPinocchioCommand.PROVIDERSSET:
                    let provs:IConfigProvider[] = pinocchioMessage.data as IConfigProvider[]
                    this.providers = provs
                    await this.backChannelObject.writeStorageCommon!(STORAGE_KEY_PROVIDERS, true, provs)
                    await loadModels(this.providers, this.backChannelObject)
                    this.executeProvidersGet()
                    this.sendSignalMessage(webSocket, EInstanceMessageAction.COMMAND, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.INFO, instance.instanceId, 'Providers updated')
                    break
                case EPinocchioCommand.PLAYGROUNDSET:
                    this.playgroundTrigger = pinocchioMessage.data as IConfigTriggerVersion
                    this.sendSignalMessage(webSocket, EInstanceMessageAction.COMMAND, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.INFO, instance.instanceId, 'Playground config applied')
                    break
                case EPinocchioCommand.CLEARBACK:
                    this.analysis = []
                    this.sendSignalMessage(webSocket, EInstanceMessageAction.COMMAND, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.INFO, instance.instanceId, 'Back analyses cleared')
                    break
            }
            return true
        }
    }

    executePlayground = async (payload: string, triggerType: 'business' | 'artifact' = 'business', kind?: string) => {
        if (!this.playgroundTrigger) {
            this.broadcastMessage('Sandbox: no config applied yet — click "Apply Config" first')
            return
        }

        let version: IConfigTriggerVersion
        let dummyTrigger: IConfigTrigger
        let fakeEvent: IEventsProviderEvent | IBusinessProviderEvent

        if (triggerType === 'artifact') {
            let obj: any = {}
            try { obj = JSON.parse(payload) } catch { obj = { raw: payload } }
            if (kind && !obj.kind) obj.kind = kind
            const promptType = this.playgroundTrigger.prompt ? 'jinja' : 'artifact'
            version = { ...this.playgroundTrigger, promptType }
            dummyTrigger = { id: 'playground', trigger: 'artifact', versions: [] }
            fakeEvent = { type: 'ADDED', obj }
        } else {
            version = { ...this.playgroundTrigger, prompt: payload, promptType: 'jinja' }
            dummyTrigger = { id: 'playground', trigger: 'business', versions: [] }
            fakeEvent = { last: { type: 'event', timestamp: Date.now(), event: {} }, all: new Map() }
        }

        try {
            const invocation = await this.buildModelInvocation(dummyTrigger, version, fakeEvent)
            if (!invocation) return
            const { model, temperature, providerOptions, tools, toolContext, prompt: effectivePrompt } = invocation

            this.broadcastPlaygroundMessage(`[Playground] type: ${triggerType}`)
            this.broadcastPlaygroundMessage(`[Playground] llm: ${version.llm}`)
            this.broadcastPlaygroundMessage(`[Playground] system: ${version.system || '(none)'}`)
            this.broadcastPlaygroundMessage(`[Playground] prompt: ${effectivePrompt}`)
            this.broadcastPlaygroundMessage(`[Playground] tools: ${version.tools.join(', ') || '(none)'}`)

            let activeTools = tools
            if (version.autoTools && Object.keys(tools).length > 0) {
                const toolListStr = Object.keys(tools).join(', ')
                const { text: selectionText } = await generateText({
                    model,
                    temperature,
                    providerOptions,
                    system: 'You are a planning assistant. Given a task and a list of available tools, respond with ONLY a comma-separated list of the tool names needed. No explanation, no punctuation beyond commas.',
                    prompt: `Task: ${effectivePrompt}\n\nAvailable tools: ${toolListStr}`
                })
                const selectedNames = selectionText.split(',').map(s => s.trim()).filter(n => n in tools)
                this.broadcastPlaygroundMessage(`[Auto tools] selected: ${selectedNames.join(', ') || '(none)'}`)
                activeTools = Object.fromEntries(selectedNames.map(n => [n, tools[n]]))
            }

            const { text: phase1Text, usage: usage1, steps } = await generateText({
                model,
                temperature,
                stopWhen: stepCountIs(version.steps || 15),
                tools: activeTools,
                providerOptions,
                system: version.system || 'You are a helpful assistant.',
                prompt: effectivePrompt
            })

            const toolLines: string[] = []
            for (const step of steps) {
                const s = step as unknown as { toolCalls: unknown[]; toolResults: unknown[] }
                for (const toolCall of (s.toolCalls ?? [])) {
                    const tc = toolCall as { toolName: string; input: unknown }
                    this.broadcastPlaygroundMessage(`[Tool call] ${tc.toolName}(${JSON.stringify(tc.input)})`)
                }
                for (const toolResult of (s.toolResults ?? [])) {
                    const tr = toolResult as { toolName: string; output: unknown }
                    this.broadcastPlaygroundMessage(`[Tool result] ${tr.toolName}: ${JSON.stringify(tr.output)}`)
                    toolLines.push(`${tr.toolName}: ${JSON.stringify(tr.output)}`)
                }
            }

            let finalResponse = phase1Text
            let totalIn = usage1.inputTokens ?? 0
            let totalOut = usage1.outputTokens ?? 0

            if (!finalResponse && toolLines.length > 0) {
                const summaryPrompt = `${effectivePrompt}\n\nInformation gathered from tools:\n${toolLines.join('\n')}\n\nPlease provide a comprehensive answer based on the above data.`
                const { text: phase2Text, usage: usage2 } = await generateText({
                    model,
                    temperature,
                    providerOptions,
                    system: version.system || 'You are a helpful assistant.',
                    prompt: summaryPrompt
                })
                finalResponse = phase2Text
                totalIn += usage2.inputTokens ?? 0
                totalOut += usage2.outputTokens ?? 0
            }

            this.broadcastPlaygroundMessage(`[Playground] response: ${finalResponse || '(empty)'}`, 'llm')
            this.broadcastPlaygroundMessage(`[Playground] tokens: ${totalIn} in / ${totalOut} out — ${steps.length} step(s)`, 'llm')
        }
        catch (err: any) {
            this.broadcastPlaygroundMessage(`[Sandbox error] ${err.message ?? String(err)}`)
        }
    }

    addObject = async (webSocket: WebSocket, instanceConfig: IInstanceConfig, podNamespace: string, podName: string, containerName: string): Promise<boolean> => {
        this.backChannelObject.logInfo?.(`[pinocchio] start instance ${instanceConfig.instance} ${podNamespace}/${podName}/${containerName} (view: ${instanceConfig.view})`)

        let socket = this.connections.find(s => s.webSocket === webSocket)
        if (!socket) {
            let len = this.connections.push( {webSocket:webSocket, lastRefresh: Date.now(), instances:[]} )
            socket = this.connections[len-1]
        }

        let instances = socket.instances
        let instance = instances.find(i => i.instanceId === instanceConfig.instance)
        if (!instance) {
            instance = {
                accessKey: accessKeyDeserialize(instanceConfig.accessKey),
                instanceId: instanceConfig.instance
            }
            instances.push(instance)
        }
        this.sendMessage(webSocket, instance, {timestamp:Date.now(), text: 'Pinocchio session accepted'})
        this.sendBatch(webSocket, instance)
        return true
    }

    deleteObject = async (webSocket:WebSocket, instanceConfig:IInstanceConfig, podNamespace:string, podName:string, containerName:string) : Promise<boolean> => {
        return true
    }

    pauseContinueInstance = (webSocket: WebSocket, instanceConfig: IInstanceConfig, action: EInstanceMessageAction): void => {
    }

    modifyInstance = (webSocket:WebSocket, instanceConfig: IInstanceConfig): void => {
    }

    stopInstance = (webSocket: WebSocket, instanceConfig: IInstanceConfig): void => {
        let instance = this.getInstance(webSocket, instanceConfig.instance)
        if (instance) {
            this.removeInstance(webSocket, instanceConfig.instance)
            this.sendSignalMessage(webSocket,EInstanceMessageAction.STOP, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.INFO, instanceConfig.instance, 'Pinocchio instance stopped')
        }
        else {
            this.sendSignalMessage(webSocket,EInstanceMessageAction.STOP, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instanceConfig.instance, `Pinocchio instance not found`)
        }
    }

    removeInstance = (webSocket: WebSocket, instanceId: string): void => {
        let socket = this.connections.find(s => s.webSocket === webSocket)
        if (socket) {
            let instances = socket.instances
            if (instances) {
                let pos = instances.findIndex(t => t.instanceId === instanceId)
                if (pos>=0) {
                    instances.splice(pos,1)
                }
                else {
                    this.backChannelObject.logWarning?.(`[pinocchio] instance ${instanceId} not found, cannot delete`)
                }
            }
            else {
                this.backChannelObject.logWarning?.('[pinocchio] there are no instances on websocket')
            }
        }
        else {
            this.backChannelObject.logWarning?.('[pinocchio] websocket not found on removeInstance')
        }
    }

    containsConnection = (webSocket:WebSocket): boolean => {
        return Boolean (this.connections.find(s => s.webSocket === webSocket))
    }

    removeConnection = (webSocket: WebSocket): void => {
        let socket = this.connections.find(s => s.webSocket === webSocket)
        if (socket) {
            for (let instance of socket.instances) {
                this.removeInstance (webSocket, instance.instanceId)
            }
            let pos = this.connections.findIndex(s => s.webSocket === webSocket)
            this.connections.splice(pos,1)
        }
        else {
            this.backChannelObject.logWarning?.('[pinocchio] websocket not found for removeConnection')
        }
    }

    refreshConnection = (webSocket: WebSocket): boolean => {
        let socket = this.connections.find(s => s.webSocket === webSocket)
        if (socket) {
            socket.lastRefresh = Date.now()
            return true
        }
        else {
            this.backChannelObject.logWarning?.('[pinocchio] websocket not found on refreshConnection')
            return false
        }
    }

    updateConnection = (newWebSocket: WebSocket, instanceId: string): boolean => {
        for (let entry of this.connections) {
            let exists = entry.instances.find(i => i.instanceId === instanceId)
            if (exists) {
                entry.webSocket = newWebSocket
                return true
            }
        }
        return false
    }

    // *************************************************************************************
    // PRIVATE
    // *************************************************************************************

    executeConfigGet = async () => {
        if (this.startChannelReady) await this.startChannelReady
        try {
            const rawConfig = await this.backChannelObject.readStorage!('pinocchio-config', false)
            let config: IPinocchioConfig | null = null
            if (typeof rawConfig === 'string') {
                try { config = JSON.parse(rawConfig) } catch {}
            } else if (rawConfig) {
                config = rawConfig as IPinocchioConfig
            }
            if (config) this.pinocchioConfig = config
        } catch (err) { this.backChannelObject.logWarning?.(`[pinocchio] error reading config from storage: ${err}`) }
        try {
            const sharedLlms = await this.backChannelObject.readStorageCommon!(STORAGE_KEY_LLMS, false)
            if (sharedLlms?.length) this.pinocchioConfig.llms = sharedLlms
        } catch (err) { this.backChannelObject.logWarning?.(`[pinocchio] error reading shared LLMs: ${err}`) }
        for (let connection of this.connections) {
            for (let instance of connection.instances) {
                let msgConfig:IPinocchioMessageResponse = {
                    msgtype: 'pinocchiomessageresponse',
                    channel: 'pinocchio',
                    action: EInstanceMessageAction.COMMAND,
                    flow: EInstanceMessageFlow.RESPONSE,
                    type: EInstanceMessageType.DATA,
                    instance: instance.instanceId,
                    config: this.pinocchioConfig
                }
                connection.webSocket.send(JSON.stringify(msgConfig))
            }
        }
    }

    executeProvidersGet = async () => {
        try {
            const freshProviders = await this.backChannelObject.readStorageCommon!(STORAGE_KEY_PROVIDERS, true)
            if (freshProviders?.length) {
                this.providers = freshProviders
                await loadModels(this.providers, this.backChannelObject)
            }
        } catch { /* ignore */ }
        for (let connection of this.connections) {
            for (let instance of connection.instances) {
                let msgProviders:IPinocchioMessageResponse = {
                    msgtype: 'pinocchiomessageresponse',
                    channel: 'pinocchio',
                    action: EInstanceMessageAction.COMMAND,
                    flow: EInstanceMessageFlow.RESPONSE,
                    type: EInstanceMessageType.DATA,
                    instance: instance.instanceId,
                    providers: this.providers
                }
                connection.webSocket.send(JSON.stringify(msgProviders))
            }
        }
    }

    private broadcastAnalysis = (analysis:IAnalysis) => {
        for (let connection of this.connections) {
            for (let instance of connection.instances) {
                this.sendAnalysis(connection.webSocket, instance, analysis)
            }
        }
    }

    private broadcastMessage = (text:string, role?: 'llm') => {
        for (let connection of this.connections) {
            for (let instance of connection.instances) {
                this.sendMessage(connection.webSocket, instance, {timestamp:Date.now(), text, role})
            }
        }
    }

    private broadcastPlaygroundMessage = (text:string, role?: 'llm') => {
        for (let connection of this.connections) {
            for (let instance of connection.instances) {
                this.sendMessage(connection.webSocket, instance, {timestamp:Date.now(), text, role, playground: true})
            }
        }
    }

    private broadcastError = (text:string) => {
        for (let connection of this.connections) {
            for (let instance of connection.instances) {
                this.sendSignalError(connection.webSocket, instance, text)
            }
        }
    }

    private sendAnalysis = (ws:WebSocket, instance:IInstance, analysis:IAnalysis) => {
        let msg:IPinocchioMessageResponse = {
            msgtype: 'pinocchiomessageresponse',
            channel: 'pinocchio',
            action: EInstanceMessageAction.NONE,
            flow: EInstanceMessageFlow.UNSOLICITED,
            type: EInstanceMessageType.DATA,
            instance: instance.instanceId,
            analysis
        }
        ws.send(JSON.stringify(msg))
    }

    private sendMessage = (ws:WebSocket, instance:IInstance, message:IMessage) => {
        let msg:IPinocchioMessageResponse = {
            msgtype: 'pinocchiomessageresponse',
            channel: 'pinocchio',
            action: EInstanceMessageAction.NONE,
            flow: EInstanceMessageFlow.UNSOLICITED,
            type: EInstanceMessageType.DATA,
            instance: instance.instanceId,
            message
        }
        ws.send(JSON.stringify(msg))
    }

    private sendBatch = (ws:WebSocket, instance:IInstance) => {
        let msg:IPinocchioMessageResponse = {
            msgtype: 'pinocchiomessageresponse',
            channel: 'pinocchio',
            action: EInstanceMessageAction.NONE,
            flow: EInstanceMessageFlow.UNSOLICITED,
            type: EInstanceMessageType.DATA,
            instance: instance.instanceId,
            analysis:{
                findings: [],
                timestamp: 0
            }
        }
        for (let an of this.analysis) {
            msg.analysis = an
            ws.send(JSON.stringify(msg))
        }
    }

    private sendSignalMessage = (ws:WebSocket, action:EInstanceMessageAction, flow: EInstanceMessageFlow, level: ESignalMessageLevel, instanceId:string, text:string): void => {
        var resp:ISignalMessage = {
            action,
            flow,
            channel: 'pinocchio',
            instance: instanceId,
            type: EInstanceMessageType.SIGNAL,
            text,
            level
        }
        ws.send(JSON.stringify(resp))
    }

    private sendSignalError = (ws:WebSocket, instance:IInstance, text:string): void => {
        var errorMessage:ISignalMessage = {
            action: EInstanceMessageAction.NONE,
            flow: EInstanceMessageFlow.RESPONSE,
            channel: 'pinocchio',
            instance: instance.instanceId,
            type: EInstanceMessageType.SIGNAL,
            level: ESignalMessageLevel.ERROR,
            text
        }
        ws.send(JSON.stringify(errorMessage))
    }

    getInstance(webSocket:WebSocket, instanceId: string) : IInstance | undefined{
        let socket = this.connections.find(entry => entry.webSocket === webSocket)
        if (socket) {
            let instances = socket.instances
            if (instances) {
                let instanceIndex = instances.findIndex(t => t.instanceId === instanceId)
                if (instanceIndex>=0) return instances[instanceIndex]
                this.backChannelObject.logWarning?.('[pinocchio] instance not found')
            }
            else {
                this.backChannelObject.logWarning?.('[pinocchio] there are no instances on websocket')
            }
        }
        else {
            this.backChannelObject.logWarning?.('[pinocchio] websocket not found in getInstance')
        }
        return undefined
    }
}

export default PinocchioChannel
