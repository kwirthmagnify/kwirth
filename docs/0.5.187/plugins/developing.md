# Developing your own plugin

If you want to build a custom plugin, you need to implement two TypeScript interfaces: one for the back side and one for the front side. The back interface defines how your plugin integrates with Kwirth core (WebSocket routing, Kubernetes events, instance management), and the front interface defines the React components (setup dialog, tab content) and the lifecycle callbacks.

The simplest way to start is by looking at the **Echo** plugin, which is the official reference implementation:

- [echo back channel on GitHub](https://github.com/kwirthmagnify/kwirth/tree/master/back/src/channels/echo)
- [echo front channel on GitHub](https://github.com/kwirthmagnify/kwirth/tree/master/front/src/channels/echo)

For the full interface specification and all available data structures, see the [Developing](../developing) section.
