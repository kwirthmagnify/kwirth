import { IAiToolset, z } from '@kwirthmagnify/kwirth-common-ai/back'
import { EToolEffect, EToolSensitivity } from '@kwirthmagnify/kwirth-common-ai'

/*
    Toolset `playground` — el primer `aitoolset` empaquetado, y el que valida la maquinaria de punta a
    punta: construir, instalar, registrar e invocar (plan: plans/ai-tools/PLAN.md, S1).

    Las dos tools son de juguete A PROPOSITO. No tocan el cluster, no leen nada y no pueden estropear
    nada, asi que sirven para probar el camino entero con riesgo cero. Lo que NO valida es el contrato:
    dos tools que reciben un numero y devuelven otro no dicen nada sobre si ECapability o la sensibilidad
    estan bien planteados — para eso esta el segundo toolset de validacion, con tools de cluster de verdad.

    Son copias PROPIAS: en common-ai hay dos tools de juguete con estos mismos nombres y NO se tocan. Este
    paquete trae las suyas, y por eso aqui viven donde deben —en un toolset que nadie activa en produccion—
    en vez de mezcladas con las 43 del catalogo.
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
