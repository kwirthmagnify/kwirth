import { IAiToolset, z } from '@kwirthmagnify/kwirth-common-ai/back'
import { EToolEffect, EToolSensitivity } from '@kwirthmagnify/kwirth-common-ai'

/*
    Toolset `playground` — the first packaged `aitoolset`, and the one that validates the machinery end to
    end: build, install, register and invoke (plan: plans/ai-tools/PLAN.md, S1).

    The two tools are toys ON PURPOSE. They do not touch the cluster, they read nothing and they cannot
    spoil anything, so they serve to test the whole route at zero risk. What they do NOT validate is the
    contract: two tools that take a number and give back another say nothing about whether ECapability or
    sensitivity are well conceived — that is what the second validation toolset is for, with real cluster tools.

    They are OWN copies: common-ai has two toy tools with these same names and they are NOT touched. This
    package brings its own, and that is why here they live where they should — in a toolset nobody enables
    in production — instead of mixed in with the catalogue's 43.
*/

const playground: IAiToolset = {
    id: 'playground',
    version: '0.1.0',
    displayName: 'Playground',
    description: 'Harmless toy tools for trying out the AI toolset machinery end to end',
    requires: [],            // no necesita nada del host: ni cluster, ni metricas, ni repos
    tools: [
        {
            name: 'times_two',
            description: 'Multiplies a number by two.',
            effect: EToolEffect.READ,
            sensitivity: EToolSensitivity.PUBLIC,
            inputSchema: z.object({ data: z.number() }),
            execute: async (args: Record<string, unknown>) => (args.data as number) * 2
        },
        {
            name: 'father_of',
            description: 'Returns the name of the father of a person.',
            effect: EToolEffect.READ,
            sensitivity: EToolSensitivity.PUBLIC,
            inputSchema: z.object({ data: z.string().describe('The name of the person whose father you want to discover') }),
            execute: async () => 'Julio'
        }
    ]
}

export default playground
