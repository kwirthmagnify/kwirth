import React, { FC } from 'react'
import { EChannelRefreshAction, IChannel, IChannelObject, IChannelRequirements, IContentProps, ISetupProps, ENotifyLevel } from '@kwirthmagnify/kwirth-common-front'
import { IChannelMessageAction } from '@kwirthmagnify/kwirth-common-front'
import { EInstanceMessageAction, EInstanceMessageType, ISignalMessage, EInstanceMessageFlow, ESignalMessageLevel, IInstanceMessage, EInstanceConfigView, IExtensionScope } from '@kwirthmagnify/kwirth-common'
import { TrivyIcon } from './TrivyCommon'
import { TrivyTabContent } from './TrivyTabContent'
import { ITrivyData, IAsset, TrivyData } from './TrivyData'
import { ITrivyMessageResponse, ETrivyScope, TRIVY_SCOPES } from '../common/TrivyTypes'

const TrivySetupStub: FC<ISetupProps> = () => React.createElement('div', null, 'Trivy has nothing to configure.')

export class TrivyChannel implements IChannel {
    private setupVisible = false
    SetupDialog: FC<ISetupProps> = TrivySetupStub
    TabContent: FC<IContentProps> = TrivyTabContent
    channelId = 'trivy'

    requirements: IChannelRequirements = {
        accessString: true,
        clusterUrl: true,
        clusterInfo: false,
        exit: false,
        frontChannels: false,
        metrics: false,
        notifier: true,
        notifications: true,
        setup: false,
        settings: false,
        palette: false,
        userSettings: false,
        webSocket: true,
        backChannels: false
    }

    getScope() { return ETrivyScope.USER }
    getScopeCatalog(): IExtensionScope[] { return TRIVY_SCOPES }   // RBAC: scopes que declara Trivy (para el editor de seguridad)
    getChannelIcon(): JSX.Element { return TrivyIcon }
    getSetupVisibility(): boolean { return this.setupVisible }
    setSetupVisibility(visibility: boolean): void { this.setupVisible = visibility }

    processChannelMessage(channelObject: IChannelObject, wsEvent: MessageEvent): IChannelMessageAction {
        let action = EChannelRefreshAction.NONE
        let trivyData: ITrivyData = channelObject.data
        let trivyMessageResponse: ITrivyMessageResponse = JSON.parse(wsEvent.data)

        /*
            The workload-level reports seen so far, by `namespace/name`. They are kept because they can
            arrive BEFORE the cards they belong to: a card created later copies them in, so the order the
            cluster sends its reports in stops mattering.
        */
        const workloadKey = (namespace: string, name: string) => `${namespace}/${name}`
        const rememberWorkloadReport = (namespace: string, name: string, resource: string, report: any, kind?: string) => {
            const key = workloadKey(namespace, name)
            const entry = trivyData.workloadReports[key] ?? { kind, reports: {} }
            if (kind) entry.kind = kind
            entry.reports[resource] = report
            trivyData.workloadReports[key] = entry
        }

        const getAsset = (namespace: string, name: string, container: string, create: boolean, kind?: string): IAsset | undefined => {
            let asset = trivyData.assets.find(a => a.namespace === namespace && a.name === name && a.container === container)
            // An asset created by one report learns its kind from a later one that carries it
            if (asset && !asset.kind && kind) asset.kind = kind
            if (!asset && create) {
                const pending = trivyData.workloadReports[workloadKey(namespace, name)]
                asset = {
                    name, namespace, container, kind: kind ?? pending?.kind,
                    unknown: { statusCode: 0, statusMessage: '' },
                    vulnerabilityreports: { report: undefined },
                    configauditreports: { report: undefined },
                    sbomreports: { report: undefined },
                    exposedsecretreports: { report: undefined }
                }
                // what the workload already had, for a card that arrives after its audit did
                for (const [resource, report] of Object.entries(pending?.reports ?? {})) {
                    ;(asset as any)[resource].report = report
                }
                trivyData.assets.push(asset)
            }
            return asset
        }

        switch (trivyMessageResponse.type) {
            case EInstanceMessageType.DATA:
                if (trivyMessageResponse.flow === EInstanceMessageFlow.UNSOLICITED) {
                    switch (trivyMessageResponse.msgsubtype) {
                        case 'add':
                        case 'update': {
                            const known = trivyMessageResponse.data.known
                            const resource = trivyMessageResponse.data.resource
                            /*
                                🔴 A report WITHOUT a container belongs to the workload, not to a card of
                                its own.

                                A ConfigAuditReport is written once per workload, while vulnerabilities
                                and SBOM are written per container. Keyed by container as everything
                                here is, the audit landed on an asset with no container and the same
                                object showed up twice: one card with vulns and SBOM, another with the
                                audit and 'NA' where the container goes.

                                So it is applied to every card of that workload, and remembered for the
                                ones that have not arrived yet — the reports come in no particular order.
                                ⚠️ A workload with several containers shows the same audit figure on each
                                of them, which is true: the audit is of the thing that owns them all.
                            */
                            if (!known.container) {
                                rememberWorkloadReport(known.namespace, known.name, resource, known.report, known.kind)
                                for (const a of trivyData.assets.filter(a => a.namespace === known.namespace && a.name === known.name)) {
                                    ;(a as any)[resource].report = known.report
                                }
                                break
                            }
                            const asset = getAsset(known.namespace, known.name, known.container, true, known.kind)
                            ;(asset as any)[resource].report = known.report
                            break
                        }
                        case 'delete': {
                            const assetDel = getAsset(trivyMessageResponse.data.known.namespace, trivyMessageResponse.data.known.name, trivyMessageResponse.data.known.container, false)
                            if (assetDel) trivyData.assets = trivyData.assets.filter(a => a !== assetDel)
                            break
                        }
                    }
                    trivyData.assets = [...trivyData.assets]
                    action = EChannelRefreshAction.REFRESH
                }
                break
            case EInstanceMessageType.SIGNAL: {
                let signalMessage: ISignalMessage = JSON.parse(wsEvent.data)
                if (signalMessage.flow === EInstanceMessageFlow.RESPONSE) {
                    switch (signalMessage.action) {
                        case EInstanceMessageAction.START:
                            /*
                                A START response can be a REFUSAL. The core answers 'Instance Config
                                accepted' before the channel's addObject has had its say, so a channel
                                that refuses can only report it afterwards — and this branch used to
                                read nothing but `instance`, so the refusal was thrown away and the tab
                                sat there empty with no explanation.
                            */
                            if (signalMessage.level === ESignalMessageLevel.ERROR) {
                                channelObject.notify?.('trivy', ENotifyLevel.ERROR, signalMessage.text ?? 'Trivy could not be started')
                                break
                            }
                            channelObject.instanceId = signalMessage.instance
                            if (!channelObject.data.ri) {
                                channelObject.webSocket!.send(JSON.stringify({
                                    action: EInstanceMessageAction.RI, channel: 'trivy',
                                    flow: EInstanceMessageFlow.REQUEST, type: EInstanceMessageType.SIGNAL,
                                    instance: channelObject.instanceId
                                } as IInstanceMessage))
                            }
                            break
                        case EInstanceMessageAction.RI:
                            trivyData.ri = signalMessage.data
                            break
                    }
                }
                action = EChannelRefreshAction.REFRESH
                break
            }
        }
        return { action }
    }

    async initChannel(channelObject: IChannelObject): Promise<boolean> {
        channelObject.data = new TrivyData()
        return false
    }

    startChannel(channelObject: IChannelObject): boolean {
        const trivyData: ITrivyData = channelObject.data
        trivyData.paused = false
        trivyData.started = true
        trivyData.assets = []
        return true
    }

    pauseChannel(channelObject: IChannelObject): boolean { (channelObject.data as ITrivyData).paused = true; return false }
    continueChannel(channelObject: IChannelObject): boolean { (channelObject.data as ITrivyData).paused = false; return true }
    stopChannel(channelObject: IChannelObject): boolean { const d = channelObject.data as ITrivyData; d.paused = false; d.started = false; return true }
    socketDisconnected(_channelObject: IChannelObject): boolean { return true }
    socketReconnect(_channelObject: IChannelObject): boolean { return false }

    prepareExternalChannel(_view: EInstanceConfigView, _selectedResources: any[], _container: string): { data: any; config: any; instanceConfig: any; formConfig: any } {
        return {
            data: new TrivyData(),
            config: undefined,
            instanceConfig: undefined,
            formConfig: {}
        }
    }
}
