import { IKwirthSettings, ISenderMessage, ISignupRequest } from '@kwirthmagnify/kwirth-common'

/*
    Telling administrators that somebody asked for access (plan: plans/signup, S4). The front end already
    tells them on login; this is for the ones who are not logging in — a request nobody looks at is a
    person locked out.

    ONE message per request. It carries what the admin needs to decide whether to go and look (who, through
    which IdP, why), and where to go: approving is done in the UI, never from the message.
*/
export const buildSignupMessage = (request: ISignupRequest, idpLabel: string): ISenderMessage => {
    const body = [
        `${request.name} (${request.id}) asked for access to Kwirth through ${idpLabel}.`,
        request.comment ? `\nWhy: "${request.comment}"` : undefined,
        `\nReview it in Kwirth: ☰ → User security → Access requests. Until an administrator approves it, they cannot sign in.`
    ].filter(Boolean).join('\n')
    return {
        subject: `Kwirth: new access request from ${request.id}`,
        level: 'info',
        body,
        origin: { source: 'core' },
        metadata: { signup: { id: request.id, idp: request.idp, name: request.name, requestedAt: request.requestedAt } }
    }
}

// the configured (senderId, configName), or undefined when nobody is to be told: half a pair delivers nowhere
export const signupSenderOf = (settings: IKwirthSettings): { senderId: string, configName: string } | undefined => {
    const senderId = settings.signupSenderId ?? ''
    const configName = settings.signupSenderConfigName ?? ''
    return senderId !== '' && configName !== '' ? { senderId, configName } : undefined
}
