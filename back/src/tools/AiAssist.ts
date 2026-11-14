import { IConfigAiAssistField, IConfigAiAssistRequest } from '@kwirthmagnify/kwirth-common'
import { isSecretFieldDef } from './ConfigFieldSecrets'

/*
    The AI assistant of the configuration forms: an LLM DRAFTS the value of one field from a request in
    natural language (plans/sender-script/PRD.md, D10/D11).

    What lives here is the part that must be right without a network: which fields may reach the model,
    what the model is told, and how its answer is cleaned. The endpoint (AiConfigApi /assist) only adds
    the model and the call.

    🔴 The model only WRITES TEXT. The call that uses this prompt goes with no tools: it runs nothing,
    connects to nothing and sees the result of nothing. The text lands in the form, unsaved, and a person
    reviews and saves it.
*/

/** A field whose value never reaches an LLM: every 'password', and any field marked 'secret'. */
export const isSecretField = (field: IConfigAiAssistField): boolean => isSecretFieldDef(field)

/** What a request must bring to be served; undefined when it is valid, otherwise the reason. */
export const validateAiAssistRequest = (body: IConfigAiAssistRequest | undefined): string | undefined => {
    if (!body || typeof body !== 'object') return 'missing request body'
    if (typeof body.llmId !== 'string' || body.llmId.trim() === '') return 'missing llmId'
    if (typeof body.fieldName !== 'string' || body.fieldName.trim() === '') return 'missing fieldName'
    if (typeof body.aiInstructions !== 'string' || body.aiInstructions.trim() === '') return 'the field has no aiInstructions'
    if (typeof body.request !== 'string' || body.request.trim() === '') return 'missing request'
    if (!Array.isArray(body.fields)) return 'missing fields'
    return undefined
}

const SYSTEM_BASE = [
    'You write the value of ONE field of a configuration form of a Kwirth extension.',
    'Answer ONLY with the value itself, exactly as it must be stored: no explanation before or after it, no markdown, no code fences.',
    'You cannot run, test or see anything: you only write text, and a person will review it before saving it.',
    'Never invent credentials, hosts or tokens; when the value needs one the request does not give, leave a clearly marked placeholder.',
].join('\n')

/**
 * The system and user prompts for a request.
 *
 * The secret fields are dropped HERE, whatever the front sent: the front already leaves them out, but one
 * filter is a convention and two make it a guarantee. That includes the field being drafted, if it were a
 * secret one: its current value is then not shown to the model either.
 */
export const buildAiAssistPrompt = (req: IConfigAiAssistRequest): { system: string, prompt: string } => {
    const visibles = req.fields.filter(f => !isSecretField(f))
    const target = visibles.find(f => f.name === req.fieldName)
    const others = visibles.filter(f => f.name !== req.fieldName)

    const system = `${SYSTEM_BASE}\n\nWhat this field is and the contract its value must follow:\n${req.aiInstructions.trim()}`

    const lines: string[] = []
    if (others.length > 0) {
        lines.push('The other fields of the form currently hold:')
        for (const f of others) lines.push(`- ${f.label} (${f.name}): ${String(f.value)}`)
        lines.push('')
    }
    const current = target ? String(target.value) : ''
    if (current.trim() !== '') {
        lines.push(`The field "${target?.label ?? req.fieldName}" currently holds this value, which you may use as a starting point:`)
        lines.push(current)
        lines.push('')
    }
    lines.push('What the user wants:')
    lines.push(req.request.trim())

    return { system, prompt: lines.join('\n') }
}

/**
 * The model's answer as a storable value: when it wraps the whole answer in a markdown fence (``` or
 * ```sh …), the fence goes. A fence INSIDE the value is left alone — only one enclosing everything is
 * the model ignoring the instruction.
 */
export const stripFences = (text: string): string => {
    const trimmed = text.trim()
    const match = /^```[^\n]*\n([\s\S]*?)\n?```$/.exec(trimmed)
    return match ? match[1] : trimmed
}
