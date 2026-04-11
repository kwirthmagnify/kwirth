# Providers
As of Kwirth version 0.5.40, we have converted data sources (the ones we use for extracting data from Kubernetes) into a 'provider'. ths means:

  - Kwirth core can be extended adding new providers.
  - Providers are now standardized, adn can be moved away form Kwirth core (converting them into plugins, for example).

In the first version for the provider subsystem there exist three providers:

  - **[Tick](./providers?id=tick)**. Alerts based on los messages. Log messages are processed at Kwirth core, so you only receive alerts according to your channel config.
  - **[Events](./providers?id=events)**. Real time log streaming from different source objects (a container, a pod, a namespace or a custom mix of any of them).
  - **[Validating](./providers?id=validating)**. Real-time metrics (CPU, memory, I/O, bandwidth...) on a set of objects.

Please follow the links to get specific information on each channel.

## Architecture
+++diagram
+++explanation


## Tick
Tick provider is a demo provider. It does not extract any data from Kubernetes, its main purpose is to serve as a starting point for developers aiming to develop a new provider.

### What for
Tick provider creates a 'tick' every 5 seconds, so channels subscribed to Tick provider will receive an empty-data event every five seconds. That's it.

### Features
Tick provider has no configuration, the interval for the Tick is fixed. The source for ticks (a setInterval in fact) is **unique** for all subscribers, that is, one only source for ticks *for each cluster*.

!> The source is linked to a running instance, not to Kwirth core, so you will have a unique Tick provider for each cluster.

### Use
When initializing a channel or when starting a channel (or any other moment afterwards) you can add yourself as a subscriber to Tick channel, and you will start receiving the ticks every
five seconds.


## Events
Events provider captures all events occurring inside Kubernetes and distribute them into all subscriber according to their subscription preferences. Kubernetes events are:

  - ADDED/MODIFIED/DELETED events, just those ones.
  - Eny Kubernetes object, including CRD's and their CRD instances.

### What for
It is intended to be used by the channels requiring information on what's taking place inside Kubernetes, since this providers captures **all** the activity of the cluster.

### Features
Main features of Events provider are:

  - Capture all ADDED/MODIFIED/DELETED events.
  - Subscribers can set the list of objects they want to subscribe to. For example, `pinocchio` channel is just subscribed to 'Pod' kind events, while `magnify` channel is subscribed to all the kinds the user has selected inf `magnify` front.

### Use
To subscribe `events` thou need to add yourself as a subscriber specifying just two parameters:
{ kinds: magnifyMessage.params!, syncInstances:Boolean(magnifyMessage.params?.includes('CRD Instances'))}
  - **kinds**, an array of Kubernetes kinds you want to subscribe.
  - **syncInstances**, a `boolean` indicating if you want to subscribe to CRD instances (whose CRD may be created after your subscription started).

You typically subscribe this way:

```typescript
this.clusterInfo.addSubscriber(
    'events',
    this,
    {
      kinds: ['Deployment', 'Node', 'Pod'], 
      syncInstances: false
    }
)
```

## Validating
Validating providers receives Kubernetes **validating webhook** calls and send them to all subscribed channels. In the very first version no actions can be taking back to Kubernetes, so all responses form Kwirth to Kubernetes will always be `review: true`, this means Validation providers is only informative for channels.

### What for
You can obtain information about object **before** they are ADDED/DELETED/MODIFIED. In near future channels will be able to answer `validating` channel regarding the review process, stating if the review is accepted or denied.

### Features
Provider sends validating request to all subscribed channels according to the initial configuration:

### Use
Subscribe to provider the usual way in the moment your channel needs it, **but not in the constructor**. The very first moment you can subscribe is the `startChannel` function. You typically subscribe to `validating` provider like this:

```typescript
this.clusterInfo.addSubscriber('validating', this, {
    kinds: ['Pod']
})
```

And you'll receive validating events this way:
```typescript
processProviderEvent(providerId:string, obj:any) : void {
    switch(providerId) {
        case 'validating':
            console.log('Received Validating event')
            break
        case 'tick':
            console.log('TICK')
            break
        case 'events':
            if (obj.type==='ADDED') {
                console.log('Pinocchio: added pod', obj.obj.metadata?.name)
                // Here invoke LLM through Vercel AI-SDK
            }
            break
        default:
            console.log(`Ignored provider event from ${providerId} to channel ${this.getChannelData().id}`)
    }
}
```
