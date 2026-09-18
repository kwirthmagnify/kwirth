# Events
Events provider captures all events occurring inside Kubernetes and distributes them to all subscribers according to their subscription preferences. Kubernetes events are:

  - ADDED/MODIFIED/DELETED events, just those ones.
  - Any Kubernetes object, including CRDs and their CRD instances.

## What for
It is intended to be used by the channels requiring information on what's taking place inside Kubernetes, since this provider captures **all** the activity of the cluster.

## Features
Main features of Events provider are:

  - Capture all ADDED/MODIFIED/DELETED events.
  - Subscribers can set the list of objects they want to subscribe to. For example, the `pinocchio` channel is just subscribed to 'Pod' kind events, while the `magnify` channel is subscribed to all the kinds the user has selected in the `magnify` front.

## Use
To subscribe to `events` you need to add yourself as a subscriber specifying just two parameters:

  - **kinds**, an array of Kubernetes kinds you want to subscribe to.
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
