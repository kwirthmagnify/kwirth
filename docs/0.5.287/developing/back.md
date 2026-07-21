# Back Channel development

The channel system has been designed to allow **an ordered evolution of Kwirth core** and, at the same time, to serve as a basis for other developers to create their own channels, that is, their own real-time data-streaming services for Kubernetes.

Creating a channel involves the following processes:

  1. Design your channel.
  2. Implement the back channel interface.
  3. Configure your Kwirth.

## The channel interface

When you create a new channel, the first thing you should do is to review the interface you must implement for your channel to be integrable with Kwirth:

```typescript
interface IChannel {
    getChannelData(): BackChannelData
    getChannelScopeLevel(scope:string) : number

    endpointRequest(endpoint:string,req:Request, res:Response, accessKey?:AccessKey) : void
    websocketRequest(newWebSocket:WebSocket, instanceId:string, instanceConfig:IInstanceConfig) : void

    processObjectEvent(type:string, obj:any) : void

    addObject (webSocket:WebSocket, instanceConfig:IInstanceConfig, podNamespace:string, podName:string, containerName:string) : Promise<boolean>
    deleteObject (webSocket:WebSocket, instanceConfig:IInstanceConfig, podNamespace:string, podName:string, containerName:string) : Promise<boolean>
    
    pauseContinueInstance (webSocket: WebSocket, instanceConfig: IInstanceConfig, action:EInstanceMessageAction) : void
    modifyInstance (webSocket: WebSocket, instanceConfig: IInstanceConfig) : void
    containsInstance (instanceId:string) : boolean
    containsAsset (webSocket: WebSocket, podNamespace:string, podName:string, containerName:string) : boolean
    stopInstance (webSocket:WebSocket, instanceConfig:IInstanceConfig) : void
    removeInstance (webSocket:WebSocket, instanceId:string) : void

    processCommand (webSocket:WebSocket, instanceMessage:IInstanceMessage, podNamespace?:string, podName?:string, containerName?:string) : Promise<boolean>

    containsConnection (webSocket:WebSocket) : boolean
    removeConnection (webSocket:WebSocket) : void
    refreshConnection (webSocket:WebSocket) : boolean
    updateConnection (webSocket:WebSocket, instanceId:string) : boolean
}
```

And this is a short explanation on each function:

  - `getChannelData`. The back channel must implement this function to inform Kwirth core which capabilities does it support. This refers to things like 'pausing', 'reconnecting', source support (Kubernetes, MesOS, Docker...), routing, metrics, etc.
  - `getChannelScopeLevel`. Your channel may need to offer different scope levels to your users. For example, in the metrics channel the clients can just do SNAPSHOT (obtaining a set of metrics and its values) or do STREAM (that is, obtaining metrics through a stream of data implemented as an instance inside a WebSocket). This function returns an id that Kwirth core uses for deciding if a specific user has an Access Key with a scope for performing the function he requested.
  - `endpointRequest`. If your channel will receive HTTP requests from your clients once the channel is started you need to provide this function implementation. When a connected client performs an HTTP POST to your channel, the Kwirth request processor will send you the request by means of this function. See a working example in Trivy channel or Fileman channel.
  - `websocketRequest`. If your channel will receive WebSocket connection requests from your clients once the channel is started, you need to provide this function implementation. See a working example in Magnify channel.
  - `processObjectEvent`. If your channel is subscribed to Kubernetes cluster events, the Kwirth request processor will send you all ADDED/MODIFIED/DELETED events of all the Kubernetes objects in the cluster.
  - `addObject`. Whenever a new object is detected that fulfills the conditions of a Kwirth instance, the Kwirth request processor will invoke this function sending you the proper information.
  - `deleteObject`. Conversely, if an object disappears, you will be notified by means of this function.
  - `pauseContinueInstance`. This function will be invoked when the client connected to the channel wants to pause receiving data (but not stopping the instance) or continue receiving data if the instance has been previously paused.
  - `modifyInstance`. Modify instance (if enabled for your channel) will be invoked if the connected client wants to make some changes on instance configuration.
  - `containsInstance`. This function provides Kwirth core with the ability to discover which type of channel a WebSocket belongs to.
  - `containsAsset`. This function provides Kwirth core with the ability to discover if a channel instance has already received information about a specific asset (an asset is in fact an object uniquely identified by 'namespace/pod/container' names).
  - `stopInstance`. stopInstance is invoked when the client wants to stop an instance.
  - `removeInstance`. Kwirth core may invoke your channel's removeInstance function for helping your channel keep healthy information on your clients.
  - `processCommand`. If your channel provides a COMMAND interface, all commands sent from clients will be sent to your channel by the Kwirth request processor with the needed data about the asset and the command.
  - `containsConnection`. The channel should return true/false indicating if it contains a specific connection (identified by its WebSocket).
  - `removeConnection`. When a WebSocket is closed, Kwirth core will invoke this function for your channel to perform cleaning functions. The connection is identified by the WebSocket.
  - `refreshConnection`. Kwirth core informs channels when a front client sends a "ping", for back channels to know if clients are still alive. The connection is identified by the WebSocket.
  - `updateConnection`. If your channel supports reconnect actions, this is the function call your channel will receive when a client connects an existing instance with a new WebSocket.

Please be aware of the difference that exists between an instance and the real communications transport (a WebSocket). When a client starts an instance, a WebSocket must be created and connected previously. And remember, **a WebSocket can carry multiple instances of the same channel**.

## Available data structures

The main data structure you will face when working with channels (aside from some basic data stored in strings or numbers) is **InstanceConfig**, which is the structure that contains all the data related to an instance.

InstanceConfig is declared like this:

```typescript
export interface IInstanceConfig extends IInstanceMessage {
    objects: EInstanceConfigObject
    accessKey: string
    scope: string
    view: EInstanceConfigView
    namespace: string
    group: string
    pod: string
    container: string
    data?: any
}
```

And is an extension of InstanceMessage, which is declared like this:

```typescript
export interface IInstanceMessage {
    action: EInstanceMessageAction
    flow: EInstanceMessageFlow
    type: EInstanceMessageType
    channel: string
    instance: string
}
```

So, these are all the properties included in a 'start instance' message (an instance config message):

 - `channel`. It is the id of the channel ('log', 'metrics', 'alert', or your own).
 - `objects`. It points to the type of Kubernetes object your channel will manage: 'pods' and 'events' are the only ones starting with Kwirth 0.3.160.
 - `action`. The action the client is requesting or the server is answering, for example: 'start', 'stop', 'pause'...
 - `flow`. Indicates the direction of the message: 'request' flows from client to server and 'response' flows back.
 - `instance`. Is the id of the instance the client or the server are working with by using this specific instance config.
 - `accessKey`. As we have explained, this is a string containing the access key the client has obtained previously.
 - `scope`. This is the scope the client is requesting.
 - `view`. This indicates at which level the instance will be working. Only values allowed are: 'container', 'pod', 'group', 'namespace'.
 - `namespace`. Is a comma-separated list of namespaces (or blank).
 - `group`. Is a comma-separated list of groups (a group can be a deployment, replica set, a daemon set and a stateful set) (or blank).
 - `pod`. Is a comma-separated list of pod names (or blank).
 - `container`. Is a comma-separated list of container names (or blank).
 - `type`. The type of message being sent ('signal' or 'data').
 - `data`. This is a generic holder for your channel specific data.

This structure (and some others), as well as some 'enums', are included in the [**@kwirthmagnify/kwirth-common**](https://www.npmjs.com/package/@kwirthmagnify/kwirth-common) package.

## Sample implementation

For a simple implementation of a channel, please review [echo Back Channel](https://github.com/kwirthmagnify/kwirth/tree/master/back/src/channels/echo) on GitHub. This is a reference implementation that you can use as a starter pack for channel development.
