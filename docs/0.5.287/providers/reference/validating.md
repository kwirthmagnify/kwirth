# Validating
The Validating provider receives Kubernetes **validating webhook** calls and sends them to all subscribed channels. In the very first version no actions can be taken back to Kubernetes, so all responses from Kwirth to Kubernetes will always be `review: true`; this means the Validating provider is only informative for channels.

## What for
You can obtain information about objects **before** they are ADDED/DELETED/MODIFIED. In the near future, channels will be able to answer the `validating` webhook regarding the review process, stating if the review is accepted or denied.

## Features
The provider sends validating requests to all subscribed channels according to the initial configuration.

## Use
Subscribe to the provider the usual way at the moment your channel needs it, **but not in the constructor**. The very first moment you can subscribe is the `startChannel` function. You typically subscribe to the `validating` provider like this:

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
                console.log('Added pod', obj.obj.metadata?.name)
                // Here invoke LLM through Vercel AI-SDK
            }
            break
        default:
            console.log(`Ignored provider event from ${providerId} to channel ${this.getChannelData().id}`)
    }
}
```
