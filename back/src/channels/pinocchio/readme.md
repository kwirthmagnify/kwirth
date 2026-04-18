# Pinochio build

## Prepare 
We need to add Vercel AI-SDK:

```bash
npm install ai
npm install @ai-sdk/google
```
(we will start integrating Gemini)

Launch prompt
```typescript
import { google } from '@ai-sdk/google'

const result = await generateText({
  // https://ai-sdk.dev/providers/ai-sdk-providers/google-generative-ai
  model: google('gemini-1.5-flash'), // or openai('gpt-5.4'), google('gemini-3-flash'), etc.
  prompt: 'Hello!',
})
```

Models
google('gemini-1.5-flash')
google('gemini-2.0-flash')
google('gemini-3-flash')
openai('gpt-4o-mini')
anthropic('claude-3-haiku-20240307')
groq('llama-3.1-70b-versatile')
groq('mixtral-8x7b-32768')

## Text
```typescript
import { generateText } from 'ai';

const { text } = await generateText({
  model: 'openai/gpt-5.4', // use Vercel AI Gateway
  prompt: 'What is an agent?',
});
```
## Data

```typescript
import { generateText, Output } from 'ai';
import { z } from 'zod';

const { output } = await generateText({
  model: 'openai/gpt-5.4',
  output: Output.object({
    schema: z.object({
      recipe: z.object({
        name: z.string(),
        ingredients: z.array(
          z.object({ name: z.string(), amount: z.string() }),
        ),
        steps: z.array(z.string()),
      }),
    }),
  }),
  prompt: 'Generate a lasagna recipe.',
});
```