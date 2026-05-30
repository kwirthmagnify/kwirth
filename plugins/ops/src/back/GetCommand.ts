import { EInstanceMessageType, EInstanceMessageFlow } from "@kwirthmagnify/kwirth-common"
import { IOpsMessage, IOpsMessageResponse } from "./OpsTypes"

export async function execCommandDescribe(clusterInfo: any, opsMessage: IOpsMessage): Promise<IOpsMessageResponse> {
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

    if (!opsMessage.namespace) {
        execResponse.data = `Namespace, pod and container must be specified`
        return execResponse
    }

    try {
        if (!opsMessage.pod && !opsMessage.container) {
            execResponse.data = await clusterInfo.coreApi.readNamespace({ name: opsMessage.namespace })
            execResponse.type = EInstanceMessageType.DATA
            return execResponse
        }
        let presp = await clusterInfo.coreApi.readNamespacedPod({ name: opsMessage.pod, namespace: opsMessage.namespace })
        if (!opsMessage.container) {
            execResponse.data = presp
            execResponse.type = EInstanceMessageType.DATA
        } else {
            let cont = presp.spec?.containers.find((c: any) => c.name === opsMessage.container)
            if (cont) {
                execResponse.data = JSON.stringify(cont, null, 2)
                execResponse.type = EInstanceMessageType.DATA
            } else {
                execResponse.data = 'Container not found'
            }
        }
        return execResponse
    } catch (err) {
        console.error('[ops] execCommandDescribe error:', err)
        execResponse.data = 'Cannot read data'
    }
    return execResponse
}
