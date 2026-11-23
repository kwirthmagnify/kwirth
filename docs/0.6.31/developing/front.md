# Front Channel development

Starting with kwirth 0.4 the front React app has been rearchitected to support the channel system in such a way that front features are implemented *separately* via front plugins. For easing front channel development, the kwirth team has created an interface that Front Channels must implement.

## The channel interface

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

  - `SetupDialog: React.FC<ISetupProps>`, a React Functional Component that renders the channel setup dialog.
  - `TabContent: React.FC<IContentProps>`, a React Functional Component that renders the channel tab content.
  - `readonly channelId: string`, the channel id ('log', 'metrics', 'trivy',...) — it must be unique. The same id is used also in back channels.
  - `requirements`, an object indicating which other objects and information the channel needs for working.
  - `getScope(): string`, channel must return the minimum scope needed to use the channel.
  - `getChannelIcon(): JSX.Element`, returns an SVG icon that will be shown on tabs next to the name of the tab in the front app.
  - `getSetupVisibility(): boolean`, channel must return the visibility status of the SetUp dialog.
  - `setSetupVisibility(visibility:boolean): void`, kwirth informs channel about a new visibility status for the SetUp dialog.
  - `processChannelMessage(channelObject, wsEvent)`, when a channel message is received from a Back Channel via a connected WebSocket, the message is delivered to the channel for further processing.
  - `initChannel(channelObject)`, kwirth will invoke this function when a new tab using this channel is first created (exactly after the user selects resources and clicks 'ADD' on the resource selector).
  - `startChannel(channelObject)`, this function will be invoked when the user clicks on 'START' to start the channel.
  - `pauseChannel(channelObject)`, when the user clicks on 'PAUSE' kwirth front will invoke this function.
  - `continueChannel(channelObject)`, when the user clicks on 'CONTINUE' on a paused channel, kwirth front will invoke this function.
  - `stopChannel(channelObject)`, this function will be invoked when the user clicks on 'STOP' to stop the channel.
  - `socketDisconnected(channelObject)`, when the WebSocket is disconnected (user removing a tab, for example) kwirth will invoke this function.
  - `socketReconnect(channelObject)`, when a connection to a back channel is restored creating a new WebSocket (after WebSocket connection has been lost due to communication errors), kwirth will invoke this function.

## The requirements object

The requirements of a channel are specified via the `requirements` property:

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

  - `setup`, the channel needs user setup before starting a new channel instance.
  - `settings`, the channel needs access to the settings object for storing/retrieving kwirth user settings.
  - `frontChannels`, the channel needs information about all supported channels in the front SPA (see Magnify channel).
  - `metrics`, the channel wants access to the list of metrics available from the cluster (see Metrics channel).
  - `notifier`, if a channel wants to send notifications to the end user, this property must be enabled in order for kwirth to provide the channel with a notifier function.
  - `notifications`, the channel wants to access the kwirth notifications array (the ones sent to end user).
  - `clusterUrl`, the channel wants to know the URL of the kwirth server, for example, for performing HTTP requests. **Read it every time you use it, never keep a copy**: for a cluster reached through a router (Ianus, bridge…) the url carries the session's route ticket, which expires in 10 minutes, and `clusterUrl` always gives the one in force *now*. A copy taken when the tab started opens nothing 10 minutes later (a second shell, a new window, a dialog's request); and never use it as a key for storage — use `clusterName`.
  - `clusterInfo`, the channel needs information about the cluster itself.
  - `accessString`, the channel will perform HTTP requests or new WebSocket requests to the kwirth server, so the Access String is needed.
  - `webSocket`, the channel will send/receive data over the WebSocket, so the WebSocket object is required.
  - `userSettings`, the channel wants to store channel-user specific settings (see Magnify channel).
  - `palette`, the channel wants to be able to change the kwirth theme (see Magnify channel).
  - `exit`, the channel wants to access the `exit` function of kwirth for exiting kwirth directly from the channel (see Magnify channel).

## The IChannelObject

All the information needed to run a channel is stored in an instance of `IChannelObject`:

```typescript
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

As you may see, `metricsList`, `accessString`, `webSocket` and some others are optional — they depend on the above mentioned `requirements` object.

## Tables

Every table in Kwirth behaves the same way, and `@kwirthmagnify/kwirth-common-front` gives you the parts:

| Export | What it does |
|---|---|
| `SortableHeaderCell` | A header cell that **sorts** its table by its column and can be **resized** by dragging its right edge. In a `<Table stickyHeader>`, the header **stays on top** while the rows scroll |
| `TableToolbar` | The line above the table: its **title**, its **row count** (`12 rows`, or `3 of 12 rows` while filtering) and a **text filter** |
| `filterRows(rows, filter, texts)` | Keeps the rows any of whose texts contains the filter, ignoring case and the spaces around it |
| `rowCountLabel(shown, total)` | The count's text, if you need it somewhere else |

Your component still owns the rows, the sort, the column widths and the filter text. The components only draw and report.

Each table is built in the same order:

1. **Keep the filter text and pass it to `TableToolbar`**, along with how many rows the table has (`total`) and how many are on screen (`shown`).
2. **Filter the rows with `filterRows`, then sort them.** `texts(row)` returns what the row's cells **show**: labels and formatted values, not enum values or epoch numbers. That way, typing what the user reads finds it.
3. **Draw the header with one `SortableHeaderCell` per column.** Keep the widths in your state and leave **one** column without a width, so the table fills its container.
4. **Put the table in a box with a bounded height and `overflow: auto`.** In a flex column that means `flex: 1` and `minHeight: 0`, and somewhere above it, an ancestor with a real height. Without it the table grows with its rows, the page scrolls instead of the table, and the header never sticks.
5. **Always render an empty-state line under the table** that says why there is nothing: no data, or nothing that matches the filter. It is always there, so nothing below it moves.

When a table keeps only its last rows, tell the user what it does not hold. Pass the real total in the toolbar's **`detail`** (common-front 0.5.83), and it is shown after the count: `200 rows · 3,412 in all`.

A view with **two tables** gives each its own toolbar and its own `flex: 1` scroll box. They share the height, and each one scrolls on its own.

The package README has a complete, copyable example: [kwirth-common-front on npm](https://www.npmjs.com/package/@kwirthmagnify/kwirth-common-front).

> **Version.** A plugin does not bundle common-front: it uses the copy the core's front carries (`window.__kwirth__.kwirthCommonFront`). `TableToolbar`, `filterRows` and `rowCountLabel` exist from **common-front 0.5.81**. A plugin that uses them needs a Kwirth whose front was built with that version or later.

## Sample implementation

For a simple implementation of a front channel, please review [echo Front Channel](https://github.com/kwirthmagnify/kwirth/tree/master/front/src/channels/echo) on GitHub. This is a reference implementation that you can use as a starter pack for channel development.
