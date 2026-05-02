import { tool } from "ai"
import z from "zod"

const toolset = {
    times_two: tool({
        description: 'This function returns a number times two, that is, it multiplies entry data by 2 and gives back a result',
        inputSchema: z.object ({
            data: z.number().describe('The number we want to be multiplied')
        }),
        execute: async ({data}) => {
            return data * 2
        }
    }),

    father_of: tool({
        description: 'This function answers with the name of the father of a person',
        inputSchema: z.object ({
            data: z.string().describe('The name of the person whose father you want to discover')
        }),
        execute: async ({data}) => {
            return 'Julio'
        }
    })
} as const

type ToolName = keyof typeof toolset
export const getToolByName = (name: string) => {
    return toolset[name as ToolName]
}