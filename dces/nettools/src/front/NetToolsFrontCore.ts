import { INetToolsFrontCore, IDnsSample, TDnsSampleInput } from '../common/NetToolsFront'
import { createSampleStore } from './samples'

/*
    Everything the front-end instance is, minus what needs a browser.

    It is split from NetToolsFrontImpl.tsx on purpose: the shared history is the part that carries the
    guarantee of the type — one object, one history, every consumer on it — and it must not need React,
    MUI or a DOM to be exercised. The harness builds this and asserts on it; the .tsx next door only
    adds the icon and the dialog on top.

    `now` is a parameter so the harness can pin the timestamps instead of reading the clock.
*/
export const createNetToolsCore = (id: string, now: () => number = () => Date.now()) => {
    const store = createSampleStore()

    const core: INetToolsFrontCore = {
        id,
        // The DCE stamps the time, not the consumer: two consumers with two clocks would draw a line
        // that jumps backwards, and nothing would look broken.
        record: (sample: TDnsSampleInput): void => store.record(sample, now()),
        samples: (): IDnsSample[] => store.samples(),
        clear: (): void => store.clear(),
        subscribe: (listener: () => void): (() => void) => store.subscribe(listener)
    }
    return { core, store }
}
