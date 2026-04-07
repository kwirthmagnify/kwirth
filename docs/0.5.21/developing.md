# Developing channels
On the very first versions of Kwirth all its capabilities were implemented inside Kwirth core. That is, log streaming or the ability to restart pods or deployments were in fact TypeScript modules co-developed and integrated into Kwirth core, they were built next to it, creating one only piece which contains the core backend features (connection to kubernetes cluster, managing security, serving as a storage system for profiles, etc.), the Kwirh capabilities (log streaming, cluster basic operations) and serving the front application (the React module).

Channel development has been taken outside of Kwirth core, so Kwirth features can be increased independently from Kwirth core evolution.

## Back Channel development
The channel system has been designed to allow **an ordered evolution of Kwirth core** and, at the same time, to serve as a basis for other developers to create its own channels, that is, its own real-time data-streaming services for Kubernetes.

Creating a channel involves the following processes:

  1. Design your channel.
  2. Implement the back channel interface.
  3. Configure your Kwirth.

### The channel interface
When you create a new channel, the first thing you should do is to review the interface you must implement for your channel to be integrable with Kwirth. This is how the channel system has been defined for the 0.3.160 version of Kwirth:

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
  - `getChannelScopeLevel`. Your channel may need to offer different scope levels to your users. For example, in metrics channel the clients can just do SNAPSHOT (obtaining a set of metrics and its values) or do STREAM (that is, obtaining metrics through a stream of data implemented as an instance inside a web socket). This function returns an id that Kwirth core uses for deciding if a specific user has an Access Key with a scope for performing the fucntion he requested. For example, if the user has an access key for getting SNAPSHOT (value 1) and requests a metrics STREAM (value 2), Kwirth will deny the request.
  - `endpointRequest`. If your channel will recieve HTTP requests from your clients once the channel is started you need to provide this function implementtion. When a connected client performs an HTTP POST to your channel, for example, the Kwirth request processor will send your the request by means of this function. See a working example in Trivy channel or Fileman channel.
  - `websocketRequest`. If your channel will recieve WebSocket connection requests from your clients once the channel is started, you need to provide this function implementtion. When a connected client performs an WebSocket CONNECT to your channel, the Kwirth request processor will send your the request by means of this function. See a working example in Magnify channel.
  - `processObjectEvent`. If your channls is subscribed to Kubernetes cluster events, Kwirth request processor will send you all ADDED/MODIFIED/DELETED events of all the Kubernetes objects in the cluster.
  - `addObject`. Whenever a new object is detected that fulfills the conditions of a Kwirth instance (for example, a new pod appears for a channel started with VIEW configured for the namespace where the pod belongs to), the Kwirth request processor will invoke this function sending you the proper information.
  - `deleteObject`. Conversely, if an object disappears, you will be notified by means of this function.
  - `pauseContinueInstance`. This funciton will be invoked when the client connected to the channel wants to pause receiving data (but not stopping the instance) or continue receiving data if instance has been previously paused.
  - `modifyInstance`. Modify instance (if enabled for your channel) will be invoked if the connected client wants to make some changes on instance configuration.
  - `containsInstance`. This fucntion provides Kwirth core with the ability to discover which type of channel a web socket belongs to.
  - `containsAsset`. This fucntion provides Kwirth core with the ability to discover if a channel instance has already received information aboud a specific asset (an asset is infact an object uniquely identified by 'namespace/pod/cnotainer' names).
  - `stopInstance`. stopInstance is invoked when the client wants to stop an instance.
  - `removeInstance`. Kwirth core may invoke your channel removeInstance function for helping your channel keep healthy information on your clients.
  - `processCommand`. If your channel provides COMMAND interface, all commands send from clients will be send to your channel by the Kwrith request processor adding needed data about the asset and the command.
  - `containsConnection`, the channel should return true/false indicating if it contains a specific connection (identified by its websocket).
  - `removeConnection`. When a web socket is closed, due to an error, a client request to close a socket or whatever, Kwirth core will invoke this function for your channel to perform cleaning functions (removeConnection would typically remove all instances of the web socket). The connection is identified by thw websocket.
  - `refreshConnection`, Kwirth core informs channels when a front client sends a "ping", ofr back channels to kwnow if clients are still alive (or to know last time client was alive). The connection is identified by thw websocket.
  - `updateConnection`. If your channel supports reconnect actions, this is the function call your channel will receive when a client connets an exiting instance with a new web socket. The connection is identified by thw websocket.

Please be aware of the difference that exists between an instance and the real communications transport (a web socket). When a client starts an intance, a web socket must be created and connected previously. And remember, **a web socket can carry multiple instances of the same channel**.

### Available data structures
The main data structure you will face when working with channels (aside form some basic data stored in strings or numbers) is **InstanceConfig**, which is the structure that contains all the data related to an instance.

InstanceConfig is declared like this:
```typescript
export interface IInstanceConfig extends IInstanceMessage{
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

So, these are all the properties included in an 'start instance' message (an instance config message):

 - `channel`. It is the id of the channel ('log', 'metrics', 'alert', or your own).
 - `objects`. It points to the type of kubernetes object your channel will manage: 'pods' and 'events' are the only ones starting with Kwirth 0.3.160.
 - `action`. The action the client is requesting or the server is answering, for exmaple: 'start', 'stop', 'pause'...
 - `flow`. Indicates the direction of the message: 'request' flows from client to server and 'response' flows back.
 - `instance`. Is the id of the instance the client or the server are working with by using this specific instance config.
 - `accessKey`. As we have explained, this is a string contianing the access key the client has obtained previously.
 - `scope`. This is the scope the client is requesting.
 - `view`. This indicates at which level the instance will be working. Only values allowed are: 'container', 'pod', 'group', 'namespace'.
 - `namespace`. Is a comma-separated list of namespaces (or blank).
 - `group`.  Is a comma-separated list of groups (a group can be a deployment, replica set, a daemon set and a stateful set) (or blank).
 - `pod`.  Is a comma-separated list of pod names (or blank).
 - `container`.  Is a comma-separated list of container names (or blank).
 - `type`. The type fo message being sent ('signal' or 'data').
 - `data`. This is a generic holder for your channel specific data.

This strucutre (and some others), as well as some 'enums', are included in the [**@kwirthmagnify/kwirth-common**](https://www.npmjs.com/package/@kwirthmagnify/kwirth-common) package.


## Front Channel development
Starting with Kwirth 0.4 the front React app has been rearchitected to support the channel system in such a way that front features are implement *separately* via front plugins. For easing front channel development, the Kwirth team has created an interface that Front Channels must implement.

```typescript
interface IChannel {
    SetupDialog: React.FC<ISetupProps>
    TabContent: React.FC<IContentProps>
    readonly channelId: string
    requirements: IChannelRequirements

    getScope(): string
    getChannelIcon(): JSX.Element
    getSetupVisibility(): boolean
    setSetupVisibility(visibility:boolean): void
    processChannelMessage (channelObject:IChannelObject, wsEvent:MessageEvent): IChannelMessageAction
    initChannel(channelObject:IChannelObject): Promise<boolean>
    startChannel(channelObject:IChannelObject): boolean
    pauseChannel(channelObject:IChannelObject): boolean
    continueChannel(channelObject:IChannelObject): boolean
    stopChannel(channelObject:IChannelObject): boolean
    socketDisconnected(channelObject: IChannelObject): boolean
    socketReconnect(channelObject: IChannelObject): boolean
}
```

And this is the explanation for each member of the interface:

  - `SetupDialog: React.FC<ISetupProps>`, it is a function that implements a React Functional Component
  - `TabContent: React.FC<IContentProps>`, it is a function that implements a React Functional Component
  - `readonly channelId: string`, it is the channel Id ('log', 'metrics', 'trivy',...) it must be unique. The same id is used also in back channels.
  - `requirements`, on object indicating which other objects and information the channel need for working.
  - `getScope(): string`, channel must return the minimum scope needed to use the channel 
  - `getChannelIcon(): JSX.Element`, returns an SVG icon that will be shown on tabs nect to the name of the tab in front app.
  - `getSetupVisibility():boolean`, channel must return the visibulity status of the SetUp dialog.
  - `setSetupVisibility(visibility:boolean):void`, Kwirth informs channel about a new visibility status for the SetUp dialog.
  - `processChannelMessage (channelObject:IChannelObject, wsEvent:MessageEvent): IChannelMessageAction`, when a channel message is received from a Back Channel via a connected websocket, the message is delivered to the channel for its further processing.
  - `initChannel(channelObject:IChannelObject): boolean`, Kwirth will invoke this function when a new tab using this channel is first created (exactly after the user selects resources and clicks 'ADD' on resource selector).
  - `startChannel(channelObject:IChannelObject): boolean`, this function will be invoked when the user clicks on 'START' to start the channel.
  - `pauseChannel(channelObject:IChannelObject): boolean`, when the user click on 'PAUSE' Kwirth front will invoke this function.
  - `continueChannel(channelObject:IChannelObject): boolean`, when the user click on 'CONTINUE' on a paused channel, Kwirth front will invoke this function.
  - `stopChannel(channelObject:IChannelObject): boolean`, this function will be invoked when the user clicks on 'STOP' to stop the channel.
  - `socketDisconnected(channelObject: IChannelObject): boolean`, when the websocket is disconnected (user removing a tab, for example) Kwirth will invoke this function.
  - `socketReconnect(channelObject: IChannelObject): boolean`, , when a connection to a back channel is restored creating a new websocket (after websocket connection has been lost due to communication errors),  Kwirth will invoke this function.

The requirements of a channel are specified via the `requirements` property, which contains this data:

```typescript
export interface IChannelRequirements {
    setup: boolean
    settings: boolean
    frontChannels: boolean
    metrics: boolean
    notifier: boolean
    notifications: boolean
    clusterUrl: boolean
    clusterInfo: boolean
    accessString: boolean
    webSocket: boolean
    userSettings: boolean
    palette: boolean
    exit: boolean
}
```

And the meaning of the properties is:

  - `setup`, the channels needd user setup before starting a new channel instance.
  - `setting`, the channel needs access to the settings object for storeing/retriving Kwirth user settings.
  - `frontChannels`, the channel needs infromation about all supported channels in the front SPA (see Magnify channel).
  - `metrics`, the channels wants access to the list of metrics avaliable from the cluster (see MEtrics channel).
  - `notifier`, if a channel wants to send notifications to end user, this property must be enabled in order for Kwirth to provide the channel with a notifier function.
  - `notifications`, the channel wants to access the Kwirth notifications array (the ones sent to end user). (See Magnify channel).
  - `clusterUrl`, the channel wants to know the URL of the Kwirth sever, for example, for performing HTTP requests.
  - `clusterInfo`, the channel needs information about the cluster itlsef.
  - `accessString`, then channel will perfom HTTP request or new WebSocket request to Kwirth server, so the Access String is needed.
  - `webSocket`, then channel will send/receive data over the WebSocket, so the WebSocket object is required.
  - `userSettings`, the channel wants to store channel-user specific settings (see Magnify channel).
  - `palette`, the channel wants to be able to change Kwirth theme (see Magnify channel).
  - `exit`, the channel wnats to access the `exit` function fo Kwirth for exiting Kwirth directly form the channel (see Magnify channel).


All the information nnede to run a channel is atored in an instance of IChannelObject:

```Typescript
interface IChannelObject {
  clusterName: string
  view: EInstanceConfigView
  namespace: string
  group: string
  pod: string
  container: string
  instanceId: string
  instanceConfig: any
  config: any
  data: any
  metricsList?: Map<string, MetricDefinition>
  accessString?: string
  isElectron: boolean
  frontChannels?: Map<string, TChannelConstructor>
  notifications?: INotification[]
  webSocket?: WebSocket
  clusterUrl?: string
  clusterInfo?: IClusterInfo
  channelSettings?: IChannelSettings
  channelId: string
  updateChannelSettings?: (channelSettings:IChannelSettings) => void
  createTab?: (resource:IResourceSelected, start:boolean, settings:any) => void
  readChannelUserPreferences?: (channelId:string) => Promise<any>
  writeChannelUserPreferences?: (channelId:string, data:any) => Promise<boolean>
  setPalette?: (palette:string) => void
  notify?:(channelId:string|undefined, level:ENotifyLevel, message:string) => void
  exit?: () => void
}
```

As you may see, metricsList, accessString, webSocket and some others are optional, they depend on the abovementioned `requirements` object.

### Sample implementation
For a simple implementaiton of a channel, please review [echo Back Channel](https://github.com/jfvilas/kwirth/tree/master/back/src/channels/echo) and [echo Front Channel](https://github.com/jfvilas/kwirth/tree/master/front/src/channels/echo) on GitHub.

This is a reference implementation that you can use as a starter pack for channel development.
