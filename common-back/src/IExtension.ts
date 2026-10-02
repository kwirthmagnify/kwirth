import { IExtensionExportOptions, IExtensionImportResult } from '@kwirthmagnify/kwirth-common'
// Type-only, so the cycle with IProvider.ts (which extends IExtension) costs nothing at runtime.
import type { IProviderAccess } from './IProvider'

/*
    What is common to EVERY Kwirth extension, whatever its type.

    Until now there was nothing common: a channel does not resemble a provider, nor a sender an IdP, and
    every family has a contract of its own. This is the first thing that crosses all eleven — and it is
    born of a very concrete need: the core has to be able to ask the same thing of any extension without
    knowing what it is.

    THE METHODS ARE OPTIONAL, and that is not half-heartedness: it is what allows portability to be
    delivered without republishing in one go every extension already out there — the seven paid ones
    included. An already published extension goes on working the same without being touched; it joins in
    when its turn comes, in its own version cycle. What is optional is ADOPTING it, not complying with it:
    whoever implements one, implements both.

    And optional does NOT mean the core makes up for the absence. There is no fallback: were the core to
    copy on its own account the keys it knows of a plugin, it would produce a file that LOOKS like it
    carries it and that reaches the destination without half of its configuration. A declared gap is
    better than a deception.

    See `plans/config-portability/PRD.md`.
*/
/**
 * What an extension writes its log with. The core builds it knowing who the extension is, so the
 * line comes out identified — '[prov] [ERROR  ] [longhorn] ...' — and the extension only writes the
 * message.
 *
 * It lives here, and not next to one family's contract, because the need is the same for all of
 * them: before this, anything that was not a channel had only `console.log`, which comes out with no
 * timestamp, no level and no component, and turns a failure into something that reads like a routine
 * trace.
 *
 * Three levels and no more. An `info` nobody can filter out is what buries a log, and a failure that
 * goes out as `info` is a failure nobody sees.
 */
export interface IExtensionLogger {
    info(message: unknown): void
    warning(message: unknown): void
    error(message: unknown): void
}

/**
 * What an extension needs from the rest of the core. The same shape for every family: the `providers`
 * list a channel or a provider already declares, now available to all eleven.
 */
export interface IExtensionRequirements {
    /** Ids of the providers this extension consumes (never a pluvider 'plugin:<name>' id). */
    providers?: string[]
}

export interface IExtension {
    /**
     * The providers this extension CONSUMES. The core instantiates them even if no channel asks for
     * them, the same way it does for a channel's or a provider's requirements. The dependency stays
     * SOFT: one that is not installed is a warning, and the consumer must survive its absence.
     *
     * OPTIONAL: an extension that consumes nothing leaves it out, and an older core ignores it.
     */
    requirements?: IExtensionRequirements
    /**
     * Called by the core once EVERY provider is registered and started, with an access already bound
     * to this extension's identity. This is where an extension subscribes to the providers it consumes —
     * never from its own start hook, because whether a producer exists at that point depends on the
     * startup order, which the author cannot see.
     *
     * Any family may implement it: a sender that emails through SES reaching the cloud accounts, a
     * homepage showing the state of an account, an IdP reading Cognito or B2C. Whoever subscribes MUST
     * unsubscribe in its own stop hook, or the producer goes on handing events to a dead instance.
     *
     * OPTIONAL: an extension that consumes nothing leaves it out, and an older core never calls it.
     */
    onProvidersReady?(access: IProviderAccess): void | Promise<void>

    /*
        Returns this extension's configuration, ready to travel to another Kwirth.

        Whoever implements it decides WHAT COUNTS AS its configuration, which is precisely what the core
        cannot know: in a plugin's own Postgres its rules (configuration) live alongside its history
        (data). The latter must NOT leave here.

        With `includeCredentials` false, the secret fields are returned EMPTY — they are not omitted —:
        the destination needs to be able to say which ones have to be filled in.
    */
    exportConfig?(options: IExtensionExportOptions): Promise<unknown>

    /*
        Receives what `exportConfig` produced — possibly in ANOTHER Kwirth, and possibly edited by hand,
        because the file is text and that is desirable — and decides what to do with it: what it accepts,
        what it discards, what it replaces and what it keeps of what it already had. The core has no say.

        Two obligations on whoever implements it:
          - VALIDATE. What arrives is not to be trusted: neither the format, nor that the resources it
            references exist in this cluster (users, namespaces, cluster uids from somewhere else).
          - BE IDEMPOTENT. Importing what one exported oneself must change nothing.

        The result is the only thing the core can tell about the content in the final report.
    */
    importConfig?(config: unknown): Promise<IExtensionImportResult>
}
