import { IOpsMessage, IOpsMessageResponse, EInstanceMessageType, EInstanceMessageFlow } from "@kwirthmagnify/kwirth-common"
import { ClusterInfo } from "../../model/ClusterInfo"

export async function execCommandDescribe(clusterInfo: ClusterInfo, opsMessage:IOpsMessage): Promise<IOpsMessageResponse> {
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
    
    if (opsMessage.namespace==='' || !opsMessage.namespace) {
        execResponse.data = `Namespace, pod and container must be specified (formats 'ns', 'ns/pod' or 'ns/pod/container')`
        return execResponse
    }

    try {
        if ((opsMessage.pod==='' || !opsMessage.pod) && (opsMessage.container==='' || !opsMessage.container)) {
            let nsresp = await clusterInfo.coreApi.readNamespace({ name: opsMessage.namespace })
            execResponse.data = nsresp
            execResponse.type = EInstanceMessageType.DATA
            return execResponse
        }

        let presp = await clusterInfo.coreApi.readNamespacedPod({ name:opsMessage.pod, namespace:opsMessage.namespace })
        if (opsMessage.container==='' || !opsMessage.container) {
            execResponse.data = presp
            execResponse.type = EInstanceMessageType.DATA
        }
        else {
            let cont = presp.spec?.containers.find(container => container.name === opsMessage.container)
            if (cont) {
                execResponse.data = JSON.stringify(cont,null,2)
                execResponse.type = EInstanceMessageType.DATA
            }
            else {
                execResponse.data = 'Container not found'
            }
        }
        return execResponse
    }
    catch (err) {
        console.log(err)
        execResponse.data = 'Cannot read data'
    }
    return execResponse
}