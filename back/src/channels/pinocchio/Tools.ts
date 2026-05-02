import { tool } from "ai"
import z from "zod"
import { INodeInfo } from "../../model/ClusterInfo"
import { mapToJson } from "../../tools/Utils"

export interface IToolContext {
    origin: string
    nodes: Map<string, INodeInfo>
}

export const createTools = (context: IToolContext) => {
    console.log('context.nodes***************', context.nodes)
    return {
        get_node_data: tool({
            description: 'Gives information about all the the nodes that are running and they are part of a Kubernetes cluster, it is just configuration, not workload',
            inputSchema: z.object({
            }),
            execute: async () => {
                console.log(mapToJson (context.nodes))
                return mapToJson (context.nodes)
            }
        }),

        times_two: tool({
            description: 'Multiplies by two',
            inputSchema: z.object({
                data: z.number()
            }),
            execute: async ({ data }) => {
                return data * 2
            }
        }),

        father_of: tool({
            description: 'This function answers with the name of the father of a person',
            inputSchema: z.object ({
                data: z.string().describe('The name of the person whose father you want to discover')
            }),
            execute: async ({data}) => {
                console.log(`Buscando padre para: ${data}, desde el origen: ${context.origin}`)
                return 'Julio'
            }
        })
    } as const
}

export const getToolByName = (name: string, context: IToolContext) => {
    const tools = createTools(context)
    return tools[name as keyof typeof tools]
}
