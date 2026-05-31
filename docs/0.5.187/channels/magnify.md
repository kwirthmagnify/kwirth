# Magnify
Magnify is **the most incredible thing** that happened inside and outside Kwirth in the last two years. It is not just a Kwirth channel, it is a really complete *Kubernetes Management Tool*. What do we mean?

We typically build Kwirth channels for providing a specific data stream for a specific type of information: logs, alerts, metrics, files, events... Magnify has been developed as a new Kwirth channel; in fact, it has a lot to do with data streaming as well as other Kwirth channels, but, what kind of data does Magnify stream to users?

Magnify is concerned about providing users with two main data streams:
  - Kubernetes artifacts
  - Kubernetes events

!> Yeah! **All the activity** happening inside Kubernetes is being streamed to you by means of the Magnify channel.

Is that all? Of course not!!

Magnify integrates all the data that is received from Kubernetes via the data-stream with other stuff like:

  - An upwards command stream, for sending commands to Kubernetes.
  - An extension mechanism for **adding other Kwirth channels to Magnify**. This means you can do logging or observing directly from the Magnify channel.
  - Editors for working with Kubernetes objects.
  - Full Kubernetes object search.
  - Validation processes for **detecting inconsistencies in your Kubernetes** cluster.
  - A lot of fun stuff.

## What for
With Magnify channel you can:
  - Manage your Kubernetes cluster(s) (not just connect to a specific cluster, you can manage all your clusters from a central point).
  - Work with all types of Kubernetes objects: browse, check, edit, create, delete...
  - Have real-time information, synced with your Magnify installation as quickly as it happens inside Kubernetes.

## Features
These are key features of Magnify channel:

  - Connect to your Kubernetes clusters and browse/edit all your Kubernetes artifacts (and apply changes) online.
  - Launch log streams in a multi-windowed system, mixing different log sources.
  - Launch metrics streams (mixing sources as you need) without the need of Prometheus.
  - Launch a Trivy channel for analyzing your workload. With Magnify you can also deploy Trivy Operator to your cluster if you have not deployed it previously.
  - Launch Fileman for working visually with the filesystems of your living images.
  - Launch shell sessions against your living containers (part of the Ops channel).
  - In addition to these basic and not-so-basic features you can:
    - Work with nodes and review images.
    - Get information for specific resources like CSI objects (driver, node, etc.) and volume attachments.
    - Decide what information you want to stream.
    - Perform **full text search** in your Kubernetes artifacts.
    - Manage your CRDs and your CRD instances.

## Use
Starting Magnify is **really simple**. Once you have configured your resource selector with **any existing resource (no matter which)** and added the new channel to the tabs, just go to the tab "Settings" icon and start the channel. *No configuration is needed*.

When the channel starts the **cluster overview** shows up, and in just some milliseconds the content will start arriving. You will see some cluster information, some global metrics, a magnificent cluster validation ribbon (showing you errors or warnings detected on your cluster artifacts), and the last cluster events:

![magnifyoverview](../_media/ch-images/magnify-cluster-overview.png ':class=imageclass60')

You can navigate on the left side of the channel to the aspect of the cluster you want to manage: nodes, workload, network, storage, CRDs, security...

![magnifynavigation](../_media/ch-images/magnify-navigation-pane.png ':class=imageclass60')

Every time you select an item or a set of items you'll see the action toolbar on top for performing actions:

![magnifyworkload](../_media/ch-images/magnify-workload.png ':class=imageclass60')

Magnify is a **windowed tool**, so every time you perform an action a window may show up, and you can manage it (inside your browser or your KwirthMagnify desktop tool) as a regular window: minimize, full-screen, move, resize, pin...

![magnifywindowed](../_media/ch-images/magnify-windowed.png)

### Specifics for Kwirth Magnify (Desktop versions)
Kwirth Desktop is an Electron application whose login page is specifically designed for local work (the same you would do with Lens, K9s, or Headlamp). Therefore, Kwirth Desktop does not connect to a specific Kubernetes cluster by default; instead, it shows the user all the contexts available in their local `kubeconfig` file. Cluster status and availability will be refreshed automatically, as shown in the following image:

![local cluster selection](../_media/context-selection-local.png)

If you want to connect to a cluster using any other type of Kwirth installation (like Docker, External or Kubernetes), you can add as many clusters as you want in the 'Remote cluster' selection.

![remote cluster selection](../_media/context-selection-remote.png)
