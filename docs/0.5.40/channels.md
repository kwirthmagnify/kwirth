# Channels
As of Kwirth version 0.5.21, these are the existing channels:

  - **[Log](./channels?id=log)**. Real time log streaming from different source objects (a container, a pod, a namespace or a custom mix of any of them).
  - **[Metrics](./channels?id=metrics)**. Real-time metrics (CPU, memory, I/O, bandwidth...) on a set of objects.
  - **[Alert](./channels?id=alert)**. Alerts based on los messages. Log messages are processed at Kwirth core, so you only receive alerts according to your channel config.
  - **[Echo](./channels?id=echo)**. This is a reference channel for channel implementers, it is not useful for real kubernetes operations.
  - **[Trivy](./channels?id=trivy)**. Get security-related information based on Trivy vulnerability analyzer.
  - **[Ops](./channels?id=ops)**. Perform day-to-day operations like shell, restarts, getting info, etc...
  - **[Fileman](./channels?id=fileman)**. Access all your cluster filesystems (all your containers fs and your volumes) from one consolidated point.
  - **[Magnify](./channels?id=magnify)**. Manage your cluster with a management tools like Lens, K9s or Headlamp: full access.
  - **[Pinocchio](./channels?id=pinocchio)**. Extend Kwirth capabilities with AI, by adding LLM features.

Please follow the links to get specific information on each channel.

## Log
Log channel is the first channel we built inside Kwirth, it was its main purpose in fact. But now, Log Channel is just another channel you can use for receiving container logs in real time.

### What for
You can create log streams that show real time logs of a set of kubernetes objects. When you select the view you can decide what groups of objects you want to use:

  - *Namespace*, view all the logs of a namespace in on stream. As it happens with all the views inside Kwirth, you can select more than one object, that is, you can have one stream consolidating all the logs of all the pods of a set of namespaces.
  - *Group*, I mean, a Deployment, a ReplicaSet, a StatefulSet or a DaemonSet, or any combination of them.
  - *Pod*, you know, a pod or a set of pods that belong to the same or different namespaces.
  - *Container*, a set of containers that belong to the same or different pods, same or different groups and same or different namespaces.

### Features
Log Channel includes two main features:

  - Log streaming, for viewing logs starting form the point you want and in real time.
  - Start diagnostics, for viewing all the log messages that took place when a set of kubernetes objects just started.

### Use
When you start a Log Channel you see the setup card where you can decide what kind of log streaming you want to launch: log streaming or start diagnostics.

?> The tab that is selected when you click OK is the feature of Log Channel that will be used.

#### Start diagnostics
Start diagnostics, as mentioned, is real time streaming that **starts when the set of selected kubernetes objects first started**. The parameters you can configure are:

  - **Max Messages**, maximum number of messages to show on the browser. When maximum is reached **the stream will be stopped**.
  - **Max per pod messages**, maximum number of messages per object to add to the screen. When an object reaches the maximum, Kwirth will show no more messages coming from that object, but other objects can add messages while "Max Messages" is not reached.
  - **Message sort order**, depending on the investigation you are performing, you may be interested in viewing object messages in different orderings. These are possible orderings:
    - *Show messages as they arrive*, nothing to add here.
    - *Keep together messages from the same pod*, no matter when a messages has occurred it will be displayed next to other messages form the same pod.
    - *Use message time for sorting*, messages will use message time, no matter the object that originated it.

You can set your selected configuration as a default for future Log Channel starting.

![logsetup](./_media/ch-images/log-setup-sd.png ':class=imageclass40')

#### Log streaming
Log streaming is useful for viewing object current logs in real time starting from any point in time. Please take into account that a very old starting point can cause your browser to become slow in processing messages, since Kwirth Core sends all the data as quick as it can.

The configuration for log streaming is as follows:

  - **Max Messages**, maximum number of messages to show on the browser. When maximum is reached **oldest messages will start to disappear**.
  - **Get messages from container start time**. You can receive messages form the very start of the object by activating this configuration option. If you don't activate it, you can decide the starting moment by selecting a date/time just below. The default is last 30 minutes.
  - **Get messages of previous container**. When they are available, you can review messages that have been produced by previous run of the same object.
  - **Add timestamp to messages**, activate it to prefix all messages with its occurrence datetime.
  - **Follow new messages**, when you activate this option, the browser will move to the very end when a new message arrives.

You can set your selected configuration as a default for future Log Channel starting.

![logsetup](./_media/ch-images/log-setup-ls.png  ':class=imageclass40')


#### Running
When you start a log stream or a start diagnostic, messages will be prefixed according to the objects you selected. For example, if you did only selected a container, messages will have no prefix. But, if you selected 2 or more containers from the same or different pod, messages will be prefixed with object information (pod name, group name, namespace name...) in order to have accurate information on the origin of the message.

A log stream would look like this:

![logstream](./_media/ch-images/log-running-ls.png ':class=imageclass90')

A start diagnostic, as you can see in the example, may not show messages ordered in message occurrence, it depends on your setup configuration.

![sd](./_media/ch-images/log-running-sd.png ':class=imageclass90')

## Metrics
Metrics Channel is a very long waited feature that eases your *needs for observability*. Aside from real-time streaming logs (the main original purpose of Kwirth), Metrics Channel can enhance your observability posture by streaming real-time metrics of your Kubernetes objects. As usual, you can build sets of objects by mixing different sources (pods from different namespaces, different whole namespaces...) or even stream real-time metrics for a single container. 

### What for
Metrics Channel can send to your browser (or your Kwirth-API consuming application) real-time observability that Kwirth gathers **directly from cAdvisor**.

!> This is important, **Kwirth does not need Prometheus** or other metrics-scraping software, Kwirth can gather required metrics directly from the kubelets running inside your nodes.

### Features
Main features of Metrics Channel are:

  - Gather metrics directly from cAdvisor/Kubelet (**no Prometheus required**)
  - Show metrics in real-time charts of different kinds: Line, Area, Bar chart or direct value
  - Group your objects to see them together in two different modes:
    - **Aggregate**: just sum up the values of same metrics from different objects and show it.
    - **Merge**: do not sum up the values, just show the metrics from different objects in the same chart. If you want to merge objects you can also decide whether to **stack** or **overlay** them.
  - As any other channel inside Kwirth, Metrics can reconnect even after losing the websocket connection, so you can stream real-time metrics in a non-stop way.

### Use
When you start the channel you must first setup how you want to receive the metrics and show them on the browser. These are the configuration items you must provide:

  - **Streaming mode**, default mode (not changeable right now) is 'Stream', that is, real time streaming.
  - **Depth**, select the number of values to show in the charts. When this limit is reached, oldest values will start to be removed.
  - **Width**, typically you select several metrics to be shown in the screen, yo can decide how many charts to show on each line.
  - **Interval**, this is the refresh interval. Kwirth core will send you new values every *interval* seconds.
  - **Metrics list**, you can add as many metrics as you want, just click on a metric name to add or remove it from the list. You can use the filter for simplify the selection process. In addition to typical Kubernetes metrics exposed by cAdvisor, Kwirth adds some simple metrics whose names start with **kwirth_** and just show common usage metrics:
    - *kwirth_container_memory_percentage*, % of memory used by **all the objects in scope**
    - *kwirth_container_cpu_percentage*, % of CPU used by **all the objects in scope**
    - *kwirth_container_transmit_percentage*, % of data sent by **all the objects in scope**
    - *kwirth_container_receive_percentage*, % of data received by **all the objects in scope**
    - *kwirth_container_random_counter*, just for testing purposes.
    - *kwirth_container_random_gauge*, just for testing purposes.
  - **Drawing options**:
    - *Aggregate*, when there ar multiple objects in scope, you can **aggregate** metrics values in order to show one only value for all the objects' values.
    - *Merge*, if you don't want to aggregate the values of the metrics, you can decide to **merge** the values, so same metric from different objects are shown in the same chart.
    - *Stack*, when you *merge* the values, you can decide whether to stack them or not.
    - *Chart*, select the chart type: Line, Area, Bar or Value.

Yo need to select at least one metrics to be able to start the channel.

![metricssetup](./_media/ch-images/metrics-setup.png ':class=imageclass60')


Once you start a Metrics Channel you can see some charts like these ones we've screenshooted for you.

One object with four Kwirth metrics.
![metricsrunning1](./_media/ch-images/metrics-running-1.png ':class=imageclass100')

Several objects shown bar-stacked.
![metricsrunning1](./_media/ch-images/metrics-running-2.png ':class=imageclass100')

Several objects shown area-stacked.
![metricsrunning1](./_media/ch-images/metrics-running-3.png ':class=imageclass100')

Several objects non-stacked.
![metricsrunning1](./_media/ch-images/metrics-running-4.png ':class=imageclass100')


## Alert
Alert channel is a subtype of Log Channel that can be used to rise alerts on information received on logs (in real-time, of course).

### What for
You can configure an alert channel for detecting log messages from objects in scope that match some specific regex. Alert channel is designed to work with three standard severity levels (INFO, WARNING, ERROR) and inform the user when a message has been produced that matches any of the severity levels configured.

You can add, for example, a tab containing all the namespaces in your cluster, this way you can detect veeeeery easily when an ERROR occurs anywhere. Please remember the way Kwirth tabs change its colour when new data is received, so a working alert tab will move from green to yellow when a new alert is received (as well as it occurs with other channels, for sure).

### Features
Alert detection is **performed on the backend**, that is, your browser will only receive alerts according to your setup. When you start an Alert Channel this is the information you must prodvide:

  - **Max alerts**, maximum number of alerts to keep on screen, when the maximum is reached, oldest ones will start to disappear.
  - **INFO**, is a list of regex or texts that will be searched for matching INFO alerts.
  - **WARNING**, is a list of regex or texts that will be searched for matching WARNING alerts.
  - **ERROR**, is a list of regex or texts that will be searched for matching ERROR alerts.

![alertsetup](./_media/ch-images/alert-setup.png ':class=imageclass40')

When an alert is fired the log message will be shown on the browser according to a typical color code (black, yellow, red)

To add expressions to ERROR alert list (it is the same for INFO and WARNING), you just type in the expression and click con Add. You can enter expressions like these:

  - 'error' (without apostrophes), lines containing the word 'error' will be shown in red.
  - '^ERR', for lines that start with 3 letters ERR.
  - 'OK$', lines ending in 'OK'.
  - '5[0-9][0-9]' lines containing a number between 500 and 599 (typical status code for server error).
  - '.' (a dot), matches any character, so every log line will be a match.

### Use
This is a sample screenshot for an Alert Channel running.

![alertrunning](./_media/ch-images/alert-running.png ':class=imageclass80')

## Trivy
We are very proud of one of the last channel we have added to Kwirth: the Trivy Channel. This channel is based on [Trivy OSS](https://trivy.io). Trivy is an excellent piece of software for observing your cybersecurity threads and be aware of your cybersecurity posture.

Kwrith relies on Trivy to send real-time information about the vulnerabiities of your Kubernetes objects. 

### What for
With Trivy Channel you can:

  - Have an score of the security compliance of your Kubernetes objects. As it always happens with Kwirth, you can calculate the Kwirth Security Score on a customized set of objects. Typically, you would use Trivy Channel to calculate a security exposure about all the components that comprise an application, no matter the namespace they are running on, no matter if they are pods, replica sets, or just individual containers.
  - For each analyzed object, and based on the information provided by Trivy, you can review what vulnerabilities are present in your images (knowing the specific CVE identifier), which versions are impacted by a CVE, which version contains the amendment, etc. (this information is, of course, provided by Trivy).
  - You can define a dynamic way of calculating Kwirth Security Score by configuring the number of accepted vulnerabilities of each kind (critical, high, medium, low). Ideally, you would set up a fixed configuration for all of your items.

### Features
These are key features of Trivy channel:

  - Calculate Kwirth Secure Score, an overall value that asses you cybersecurity posture.
  - Review vulnerability reports for each object in scope individually.
  - Review each CVE for each impacted object individually.
  - Re-evaluate a vulnerability report for an specific object.

### Use
When you start a Trivy Channel you must provide a few things for the vulnerability engine to run and show you some results:

  - **Maximum number of accepted issues** of each category of vulnerability, or even just ignore a specific severity (that means accepting as "good" any number of vulnerabilities of a specific kind).

![trivysetup](./_media/ch-images/trivy-setup.png ':class=imageclass40')

Here are some screenshots of some operations performed with a Trivy Channel. First one shows a general view of a Trivy Channel:

![trivycard](./_media/ch-images/trivy-card.png ':class=imageclass100')

You can switch the view (a card view with details on each object) to a list view, a more simplistic approach to use when you just need an overview of the global situation.

![trivylist](./_media/ch-images/trivy-list.png ':class=imageclass100')

No matter the kind of view you have selected (card or list), you can decide how to order the objects. Two main options are available: score order, scan date order.

![trivyorder](./_media/ch-images/trivy-sort.png ':class=imageclass20')

I you want to review the details of a vulnerability report, you can do it (from card or list item) and you will get a list of vulnerabilities including its category (critical, high...) and some details.

![trivydetail](./_media/ch-images/trivy-detail.png ':class=imageclass40')

IF you want to get detailed info on a specific CVE, just click on it to see the details.

![trivycve](./_media/ch-images/trivy-cve.png  ':class=imageclass40')

If there exist some problem with a Trivy vulnerability report, you'll be noticed via a red error icon on the screen, and clicking on it you can see some specifics on the error.

![trivyerror](./_media/ch-images/trivy-error.png  ':class=imageclass40')

## Ops
Ops Channel is a complex functionally rich channel that Kwirth users can use to operate (perform day-to-day operations) on your Kubernetes workload.

A typipcal use case is the one of a developer launching a shell to connect to a container in order to debug some error.

### What for
Ops Channel can be used mainly for:

  - Performing cluster operations like restarts.
  - Launch shell sessions to work with a running container.
  - Show information on running objects.

### Features
The only setup required for starting an Ops Channel is:

  - Decide whether to **keep-alive your shell sessions** in the backend or not. That is, Kwirth will perform some keep-alive activities for the sessions to remain working even if you type nothing all day. In addition, the **reconnect feature of Kwirth** allows you to reconnect to a shell session even if you lost you connection to Kwirth.
  - The other parameter you can configure is the color scheme: light (for normal people), dark (for sysadmins), or 3270 (for mainframe lovers). 

### Use
The setup of a Ops Channel is very simple:

  - Keep-alive.
  - Theme.

And it looks like this:

![opssetup](./_media/ch-images/ops-setup.png ':class=imageclass40')

When you finally launch an Ops Channel the first thing you will see in your screen is the help for the channel and (on the very bottom) an input field where you can type commands in.

It is important to understand the naming structure of objects:

  - You can refer a namespace by its own name (e.g., default)
  - You can refer a pod by qualifying it using its namespace: default/kwirth, kube-system/core-dns, and so on.
  - You can refer a container by indicating the namespace and the pod: default/kwirth-34jfu5/kwirth

This way of referring objects is common to all commands inside Ops Channel. Available commands, as shown in the channel help, are:

  - CLEAR, to clean the screen of your Ops Channel.
  - HELP to get some help on how to use the channel.
  - GET, to obtain some minimal info on an object (GET default, GET default/kwirth).
  - DESCRIBE, to obtain detailed info on an object.
  - LIST, you can see the list of object your Ops Channel session is authorized to work with.
  - EXECUTE, you can send one command to the destination container (a shell command, lik e'ps -A' or 'ls -lisa').
  - RESTART, this command enables you to **restart one container** inside a pod.
  - RESTARTPOD, restarts a pod.
  - RESTARTNS, restarts **a whole namespace**.
  - DELETE, delete a pod, that is, if there is a controller in place, this is the same action as restarting a pod, but, if there is no controller controlling this pod, the pod will disappear.
  - XTERM, well, you can **start shell sessions** to containers.

What follows are some screen shots of the commands.

![opsrunning](./_media/ch-images/ops-running.png ':class=imageclass100')

#### Shell operations
When you start a shell you'll see the shell showing up inside the Ops Channel tab. Aside from working with shell (/bin/sh in fact), you have some interesting keys you can use:

  - F12, go back to Ops Channel (and keep the sessions started) from any shell session.
  - F11, shows a list of started sessions where you can switch to any other one.
  - F1-F10, each shell session is assigned to a function key from 1 to 10, so you can always switch **directly** from one shell session to another one just pressing corresponding function key.
  - Control-D or exit to end a session.

Shell selection will be shown like this:

![opseshellselect](./_media/ch-images/ops-shell-select.png ':class=imageclass40')

When you select a shell session you'll see a TTY shell like this one:

![opseshell](./_media/ch-images/ops-shell.png ':class=imageclass80')

## Echo
This channel sends users realtime "echo" information on objects in scope. It has been built for channel implementers to have a simple channel implementation to use as a starting point.

### What for
It's a reference implementation of a Kwirth channel, and  although that this is its main objective, Echo Channel can also be used to test Kwirth connectivity and to monitor the status of objects in scope.

### Features
You can just configure two options prior to starting an Echo Channel:

  - **Max lines**, maximum number of lines to keep on screen, when the maximum is reached, old lines will start to disappear.
  - **Interval**, seconds to wait before sending next echo from the backend to the frontend.

This is how the Echo setup feels:

![echosetup](./_media/ch-images/echo-setup.png  ':class=imageclass40')

You can set your selected configuration as a default for future Echo Channel starting.

### Use
When you add an Echo Channel to your Kwirth desktop, when you start it (after configuring echo interval), Kwirth will start sending information on added objects in a regular basis (your interval in seconds), as shown in next figure.

![echo-running](./_media/ch-images/echo-running.png ':class=imageclass100')

## Fileman
Fileman is a really easy-to-use file manager for accessing all your filesystems inside a Kubernetes cluster. That is, you can visually manage all the filesystems that exist in your cluster wherever they are just image filesystems, PVC, secrets... With fileman you will have a consolidated view fo all the objects in the cluster and you will use **a navigation tool to view and manage** all your files.

!> When working with a large number of namespaces and/or pods, please be patient with the initial load of objects.

### What for
With Fileman channel you can:

  - Navigate through all your Kubernetes containers/pods/controllers/namespaces and view the contents of the filesystems.
  - You can perform file operations like copy, move, delete or rename.
  - You can copy/move from different source and target containers.
  - You can download and upload items to/from your local machine.

### Features
These are key features of Fileman channel:

  - The navigation is lazy, that is, Fileman channel will ask your cluster for data when you navigate to a specific container of folder.
  - The copy/move feature has two ways of working:
    1. You can copy/move files/folders inside the image filesystem of a specific container (wherever they live in root FS, or in a mounted FS).
    2. You can copy/move files/folders **from a container to a destination container different from source one**. That is, you can just go to container A, "select" and "copy" a bunch of files, then navigate to container B and paste those files in there. Kwirth will take into account tha fact that the source and target reside in a different container and will act accordingly.
  - You can **download files or folders**. When you download folders, Kwirth builds a `.tar.gz` file for your download operation.

### Use
Starting Fileman is **really simple**. Once you have configured your resource selector and added the new channel to the tabs, just go to tab "Settings" icon and Start the channel. *No configuration is needed*.

When the channel starts the navigation pane shows up, and in just some milliseconds the content will start arriving.

!> Filesystems information can be slow to arrive if your resource selector includes too many objects.

A typical view of Fileman channel is as follows:

![filemanstart](./_media/ch-images/fileman-initial.png ':class=imageclass80')

The navigation pane includes:
 - A folder tree navigation tool on the left.
 - A file ist area on the right, that can be configured to be shown as a grid or as a list (select your view on top-right icon the navigation pane).

As you navigate, some actions may appear on the navigation pane header, like 'Rename', 'Delete', 'Copy'...

![filemanactions](./_media/ch-images/fileman-actions.png ':class=imageclass80')

These actions are also available when right-clicking an object on the file list. When you right-click an item a context-menu appears with actions according to the object selected.

![filemancontextmenu](./_media/ch-images/fileman-contextmenu.png ':class=imageclassCenter :class=imageclass20')

Finally, for having a detailed view of a file or folder, you can switch the file list from 'Grid' to 'List' and back. The 'list' will show file information (length, date...).

![filemangridlist](./_media/ch-images/fileman-gridlist.png  ':class=imageclass60')


## Magnify
Magnify is **the most incredible thing** that happened inside and outside Kwirth in the last two years. It is not just a Kwirth channel, it is a really complete *Kubernetes Management Tool*.  What we mean?

We typically build Kwirth channels for providing a specific data stream for a specific type of information: logs, alerts, metrics, files, events... Magnify has been developed as a new Kwirth channel, in fact, it has a lot to do with data streaming as well as other Kwirth channels, but, what kind of data do Magnify streams to users?

Magnify is concerned about providing users with two main data streams:
  - Kubernetes artifacts
  - Kubernetes events

!> Yeah! **All the activity** happening inside Kubernetes is being streamed to you by means of the Magnify channel.

Is that all? Of course not!!

Magnify integrates all the data that is received from the Kubernetes via the data-stream with other stuff like:

  - An upwards command stream, for sending commands to Kubernetes.
  - An extension mechanism for **adding other Kwirth channels to magnify**. This means, you can do logging or observing directly from magnify channel.
  - Editors for working with Kubernetes objects.
  - Full Kubernetes object search.
  - Validation processes for **detecting inconsistences in your Kubernetes** cluster.
  - A lot of fun stuff.


### What for
With Magnify channel you can:
  - Manage your/s Kubernetes (not just connect to a specific cluster, you can manage all your clusters from a central point).
  - Work with all types of Kubernetes objects: browse, check, edit, cerate, delete...
  - Have real-time information, sync'ed with your Magnify installation as quick as it happens inside Kubernetes.


### Features
These are key features of Magnify channel:

  - Connect to your Kubernetes clusters and browse/edit all your Kubernetes artifacts (and apply changes) online.
  - Launch log streams in a multi-windowed system, mixing different log sources.
  - Launch metrics streams (mixing sources as you need) without the need of Prometheus.
  - Launch a Trivy channel for analyzing your workload. With Magnify you can also deploy Trivy Operator to your cluster if you have not deployed it previously.
  - Launch Fileman for working visually with the filesystems of your living images.
  - Launch shell sessions against your living containers (part of the ops channel).
  - In addition to these basic and not-so-basic features you can:
    - Work with nodes and review images.
    - Get information for specific resources like CSI objects (driver, node, etc.) and volume attachments.
    - Decide what information you want to stream.
    - Perform **full search of texts** in your Kubernetes artifacts.
    - Manage your CRD and your CRD instances.

### Use
Starting Magnify is **really simple**. Once you have configured your resource selector with **any existent resource (no matter which)** and added the new channel to the tabs, just go to tab "Settings" icon and start the channel. *No configuration is needed*.

When the channel starts the **cluster overview** shows up, and in just some milliseconds the content will start arriving. You will see some cluster information, some global metrics, a magnificent cluster validation ribbon (showing you errors or warnings detected on your cluster artifacts), and the las cluster events:

![magnifyoverview](./_media/ch-images/magnify-cluster-overview.png  ':class=imageclass60')

You can navigate on the left side of the channel to the aspect of the cluster you want to manage: nodes, workload, network, storage, CRD's, security...

![magnifyoverview](./_media/ch-images/magnify-navigation-pane.png  ':class=imageclass60')

Every time you select an item or a set of items you'll see the the action toolbar on top for performing actions:

![magnifyoverview](./_media/ch-images/magnify-workload.png  ':class=imageclass60')

Magnify is a **windowed tool**, so every time you perform an action a Window may show up, and you can manage it (inside yor browser or your KwirthMagnify desktop tool) as a regular window: minimize, full-screen, move, resize, pin... 

![magnifyoverview](./_media/ch-images/magnify-windowed.png)


#### Sepecifics for Kwirth Magnify (Desktop versions)
Kwirth Desktop is an Electron application whose login page is specifically designed for local work (the same you would do with Lens, K9s, or Headlamp). Therefore, Kwirth Desktop does not connect to a specific Kubernetes cluster by default; instead, it shows the user all the contexts available in their local `kubeconfig` file. Cluster status and availability will be refreshed automatically, as shown in the following image:

![local cluster selection](./_media/context-selection-local.png)

If you want to connect to a cluster using any other type of Kwirth installation (like Docker, External or Kubernetes), you can add as many clusters as you want in the 'Remote cluster' selection.

![local cluster selection](./_media/context-selection-remote.png)


## Pinocchio
Pinocchio channel extends Kwirth capabilities by providing an integration with IA LLM's in order to perform any activity you need depending on the providers you choose or the logic you implement. Architecture for `pinocchio` es easy to understand by simply reading following diagram:

![pinocchio-arch](./_media/ch-images/pinocchio-arch.png)

Components:
  - On the lef side, providers, data source for real-time data.
  - Inside `pinocchio` channel:
    - `ai-sdk` for integrating with external LLM's
    - 'infrastructure manager', for integrating into your infrastructure manager in order to take actions.

The rest of the parts are common to any other Kwirth channel.

### What for
Initial implementation receives events form `events` and `validating` providers, send object information to an LLM and establishes a risk level associated to the fact of deploy the object to Kubernetes.

### Features
Minimal capabilities include:

  - Receiving events
  - Pass them by to an LLM
  - Inform about cyber-risk level.

### Use
After configuring back channel, and activating front channel, the only thing you can do is watch Pinocchio taking actions.
