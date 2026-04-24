# test 1
```typescript
    model: google('gemini-2.5-flash'),
    providerOptions: {
        google: {
            structuredOutputs: true,
        } satisfies GoogleLanguageModelOptions,
    },
    output: Output.object({
        schema: z.object({
            name: z.string(),
            age: z.number(),
            contact: z.union([
                z.object({
                    type: z.literal('email'),
                    value: z.string(),
                }),
                z.object({
                    type: z.literal('phone'),
                    value: z.string(),
                }),
            ]),
        }),
    }),
    prompt: 'Generate an example person for testing.',
});
```

# test 2
```typescript
const { output } = await generateText({
    model: google('gemini-2.5-flash'),
    providerOptions: {
        google: {
            structuredOutputs: true,
        } satisfies GoogleLanguageModelOptions,
    },
    output: Output.object({
        schema: z.object({
            findings: z.array(
                z.object({
                    description: z.string().min(1),
                    level: z.enum(['low', 'medium', 'high', 'critical']),
                })
            )
        }),
    }),
    system: 'You are a kubernetes admin expert, and you are in charge of deploying only workload that are secure. Generate a security analysis for this pod following the schema',
    prompt: JSON.stringify(event.obj),
});
```