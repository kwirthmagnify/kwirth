# Log
Log channel is the first channel we built inside Kwirth, it was its main purpose in fact. But now, Log Channel is just another channel you can use for receiving container logs in real time.

## What for
You can create log streams that show real time logs of a set of Kubernetes objects. When you select the view you can decide what groups of objects you want to use:

  - *Namespace*, view all the logs of a namespace in one stream. As it happens with all the views inside Kwirth, you can select more than one object, that is, you can have one stream consolidating all the logs of all the pods of a set of namespaces.
  - *Group*, I mean, a Deployment, a ReplicaSet, a StatefulSet or a DaemonSet, or any combination of them.
  - *Pod*, you know, a pod or a set of pods that belong to the same or different namespaces.
  - *Container*, a set of containers that belong to the same or different pods, same or different groups and same or different namespaces.

## Features
Log Channel includes two main features:

  - Log streaming, for viewing logs starting from the point you want and in real time.
  - Start diagnostics, for viewing all the log messages that took place when a set of Kubernetes objects just started.

## Use
When you start a Log Channel you see the setup card where you can decide what kind of log streaming you want to launch: log streaming or start diagnostics.

?> The tab that is selected when you click OK is the feature of Log Channel that will be used.

### Start diagnostics
Start diagnostics, as mentioned, is real time streaming that **starts when the set of selected Kubernetes objects first started**. The parameters you can configure are:

  - **Max Messages**, maximum number of messages to show on the browser. When maximum is reached **the stream will be stopped**.
  - **Max per pod messages**, maximum number of messages per object to add to the screen. When an object reaches the maximum, Kwirth will show no more messages coming from that object, but other objects can add messages while "Max Messages" is not reached.
  - **Message sort order**, depending on the investigation you are performing, you may be interested in viewing object messages in different orderings. These are possible orderings:
    - *Show messages as they arrive*, nothing to add here.
    - *Keep together messages from the same pod*, no matter when a message has occurred it will be displayed next to other messages from the same pod.
    - *Use message time for sorting*, messages will use message time, no matter the object that originated it.

You can set your selected configuration as a default for future Log Channel starting.

![logsetup](../_media/ch-images/log-setup-sd.png ':class=imageclass40')

### Log streaming
Log streaming is useful for viewing object current logs in real time starting from any point in time. Please take into account that a very old starting point can cause your browser to become slow in processing messages, since Kwirth Core sends all the data as quickly as it can.

The configuration for log streaming is as follows:

  - **Max Messages**, maximum number of messages to show on the browser. When maximum is reached **oldest messages will start to disappear**.
  - **Get messages from container start time**. You can receive messages from the very start of the object by activating this configuration option. If you don't activate it, you can decide the starting moment by selecting a date/time just below. The default is last 30 minutes.
  - **Get messages of previous container**. When they are available, you can review messages that have been produced by a previous run of the same object.
  - **Add timestamp to messages**, activate it to prefix all messages with their occurrence datetime.
  - **Follow new messages**, when you activate this option, the browser will move to the very end when a new message arrives.

You can set your selected configuration as a default for future Log Channel starting.

![logsetup](../_media/ch-images/log-setup-ls.png ':class=imageclass40')

### Running
When you start a log stream or a start diagnostic, messages will be prefixed according to the objects you selected. For example, if you only selected a container, messages will have no prefix. But, if you selected 2 or more containers from the same or different pod, messages will be prefixed with object information (pod name, group name, namespace name...) in order to have accurate information on the origin of the message.

A log stream would look like this:

![logstream](../_media/ch-images/log-running-ls.png ':class=imageclass90')

A start diagnostic, as you can see in the example, may not show messages ordered by occurrence time — it depends on your setup configuration.

![sd](../_media/ch-images/log-running-sd.png ':class=imageclass90')
