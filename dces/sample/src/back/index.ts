import { IDceBack, IDceBackHost } from '@kwirthmagnify/kwirth-common-back'
import { ISampleDce, createSample } from '../common/SampleDce'

/*
    The back end of the sample DCE.

    A DCE's back.js exports a FACTORY, not an object: the core calls create() once, hands it the host
    (logger, scoped configMaps and secrets, the core's libs) and keeps what it returns in
    `global.__kwirth_dce__['sample']`. A consumer gets it with getDce<ISampleDce>('sample').

    The host's configMaps are used for one thing, so the pattern is visible: how many times this factory
    has run on this Kwirth. It survives restarts, which the counter does not.
*/
const BOOTS_KEY = 'boots'

const dce: IDceBack<ISampleDce> = {
    create: async (host: IDceBackHost): Promise<ISampleDce> => {
        const previous = Number(await host.configMaps.read(BOOTS_KEY, 0)) || 0
        const boots = previous + 1
        await host.configMaps.write(BOOTS_KEY, boots)
        host.logger.info(`sample DCE created (boot #${boots})`)
        return createSample(host.id, Date.now(), boots)
    }
}

export default dce
