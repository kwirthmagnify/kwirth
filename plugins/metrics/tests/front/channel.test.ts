import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EInstanceConfigView, EInstanceMessageAction, EInstanceMessageFlow, EInstanceMessageType, ESignalMessageLevel } from '@kwirthmagnify/kwirth-common'
import { EChannelRefreshAction, IChannelObject } from '@kwirthmagnify/kwirth-common-front'
import { MetricsChannel } from '../../src/front/MetricsChannel'
import { IMetricsData } from '../../src/front/MetricsData'
import { EMetricsConfigMode } from '../../src/common/MetricsTypes'

/*
    The front end of the channel, without React: what an embedder receives (prepareExternalChannel) and
    how incoming messages land in the channel's data (processChannelMessage).
*/

const newChannelObject = async (channel: MetricsChannel): Promise<IChannelObject> => {
    const channelObject = {} as IChannelObject
    await channel.initChannel(channelObject)
    channel.startChannel(channelObject)
    return channelObject
}

const event = (message: Record<string, unknown>) => ({ data: JSON.stringify(message) }) as MessageEvent

const dataMessage = (timestamp: number, value: number) => event({
    type: EInstanceMessageType.DATA,
    timestamp,
    assets: [{ assetName: 'web-1', values: [{ metricName: 'kwirth_container_cpu_percentage', metricValue: value }] }]
})

test('prepareExternalChannel hands an embedder the six basic metrics, aggregated and compact', () => {
    // This is what Magnify used to build by hand with the channel's types
    const setup = new MetricsChannel().prepareExternalChannel(EInstanceConfigView.NAMESPACE, [], '')
    assert.deepEqual(setup.instanceConfig, {
        mode: EMetricsConfigMode.STREAM,
        aggregate: true,
        interval: 15,
        metrics: ['kwirth_container_cpu_percentage', 'kwirth_container_memory_percentage', 'kwirth_container_transmit_mbps', 'kwirth_container_receive_mbps', 'kwirth_container_write_mbps', 'kwirth_container_read_mbps']
    })
    assert.equal(setup.config.compact, true)
    assert.equal(setup.config.depth, 50)
    assert.deepEqual(setup.data.assetMetricsValues, [])
    assert.deepEqual(setup.data.events, [])
})

test('prepareExternalChannel returns fresh objects every time: two embedded windows do not share state', () => {
    const channel = new MetricsChannel()
    const a = channel.prepareExternalChannel(EInstanceConfigView.POD, [], '')
    const b = channel.prepareExternalChannel(EInstanceConfigView.POD, [], '')
    a.instanceConfig.metrics.push('x')
    a.data.assetMetricsValues.push({} as never)
    assert.equal(b.instanceConfig.metrics.includes('x'), false)
    assert.equal(b.data.assetMetricsValues.length, 0)
})

test('the initial sample (timestamp 0) replaces the first one instead of being appended', async () => {
    const channel = new MetricsChannel()
    const channelObject = await newChannelObject(channel)
    const data = channelObject.data as IMetricsData

    channel.processChannelMessage(channelObject, dataMessage(0, 1))
    channel.processChannelMessage(channelObject, dataMessage(0, 2))
    assert.equal(data.assetMetricsValues.length, 1)
    assert.equal(data.assetMetricsValues[0].assets[0].values[0].metricValue, 2)
    // and it gets a real timestamp, so it can be drawn on the time axis
    assert.notEqual(data.assetMetricsValues[0].timestamp, 0)
})

test('samples beyond the configured depth push the oldest out', async () => {
    const channel = new MetricsChannel()
    const channelObject = await newChannelObject(channel)
    channelObject.config.depth = 3
    for (let i = 1; i <= 5; i++) channel.processChannelMessage(channelObject, dataMessage(i, i))
    const values = (channelObject.data as IMetricsData).assetMetricsValues.map(s => s.assets[0].values[0].metricValue)
    assert.deepEqual(values, [3, 4, 5])
})

test('while paused, samples are stored but the tab is not refreshed', async () => {
    const channel = new MetricsChannel()
    const channelObject = await newChannelObject(channel)
    channel.pauseChannel(channelObject)
    const action = channel.processChannelMessage(channelObject, dataMessage(1, 1))
    assert.equal(action.action, EChannelRefreshAction.NONE)
    assert.equal((channelObject.data as IMetricsData).assetMetricsValues.length, 1)

    channel.continueChannel(channelObject)
    assert.equal(channel.processChannelMessage(channelObject, dataMessage(2, 2)).action, EChannelRefreshAction.REFRESH)
})

test('an error signal from the back end is kept as an event and refreshes the tab', async () => {
    const channel = new MetricsChannel()
    const channelObject = await newChannelObject(channel)
    const action = channel.processChannelMessage(channelObject, event({
        type: EInstanceMessageType.SIGNAL, flow: EInstanceMessageFlow.RESPONSE, action: EInstanceMessageAction.NONE,
        level: ESignalMessageLevel.ERROR, text: 'Insufficient scope for STREAM'
    }))
    assert.equal(action.action, EChannelRefreshAction.REFRESH)
    assert.deepEqual((channelObject.data as IMetricsData).events.map(e => e.text), ['Insufficient scope for STREAM'])
})

test('the START response gives the channel object its instance id', async () => {
    const channel = new MetricsChannel()
    const channelObject = await newChannelObject(channel)
    channel.processChannelMessage(channelObject, event({
        type: EInstanceMessageType.SIGNAL, flow: EInstanceMessageFlow.RESPONSE, action: EInstanceMessageAction.START, instance: 'abc'
    }))
    assert.equal(channelObject.instanceId, 'abc')
})
