import { EInstanceMessageType, EInstanceMessageFlow } from "@kwirthmagnify/kwirth-common"
import { IInstance } from "./index"
import { EOpsCommand, IOpsMessage, IOpsMessageResponse } from "./OpsTypes"

export async function restartPod(clusterInfo: any, podNamespace: string, podName: string): Promise<string> {
    try {
        await clusterInfo.coreApi.deleteNamespacedPod({ name: podName, namespace: podNamespace })
        return `Pod ${podNamespace}/${podName} restarted`
    } catch (err) {
        return `Error restarting pod ${podNamespace}/${podName}: ${err}`
    }
}

export async function execCommandRestart(clusterInfo: any, instance: IInstance, opsMessage: IOpsMessage): Promise<IOpsMessageResponse> {
    let execResponse: IOpsMessageResponse = {
        action: opsMessage.action,
        flow: EInstanceMessageFlow.RESPONSE,
        type: EInstanceMessageType.SIGNAL,
        channel: opsMessage.channel,
        instance: opsMessage.instance,
        command: opsMessage.command,
        id: opsMessage.id,
        namespace: opsMessage.namespace,
        group: opsMessage.group,
        pod: opsMessage.pod,
        container: opsMessage.container,
        msgtype: 'opsmessageresponse'
    }

    switch (opsMessage.command) {
        case EOpsCommand.RESTARTPOD:
            if (!opsMessage.namespace || !opsMessage.pod) {
                execResponse.data = `Namespace and pod must be specified`
                return execResponse
            }
            if (instance.assets.find(a => a.podNamespace === opsMessage.namespace && a.podName === opsMessage.pod)) {
                execResponse.data = await restartPod(clusterInfo, opsMessage.namespace, opsMessage.pod)
                execResponse.type = EInstanceMessageType.DATA
            } else {
                execResponse.data = `Cannot find pod '${opsMessage.namespace}/${opsMessage.pod}'`
                return execResponse
            }
            break
        case EOpsCommand.RESTARTNS:
            if (!opsMessage.namespace) {
                execResponse.data = `Namespace must be specified`
                return execResponse
            }
            execResponse.data = ''
            for (let asset of instance.assets) {
                if (asset.podNamespace === opsMessage.namespace) {
                    try {
                        execResponse.data += (await restartPod(clusterInfo, asset.podNamespace, asset.podName)) + '\n'
                    } catch (err) {
                        execResponse.data += `Error restarting pod ${asset.podNamespace}/${asset.podName}: ${err}\n`
                    }
                }
            }
            execResponse.type = EInstanceMessageType.DATA
            break
        default:
            execResponse.data = `Invalid command '${opsMessage.command}'`
            break
    }
    return execResponse
}
