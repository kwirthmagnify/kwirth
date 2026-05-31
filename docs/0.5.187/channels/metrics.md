# Metrics
Metrics Channel is a very long-awaited feature that eases your *needs for observability*. Aside from real-time streaming logs (the main original purpose of Kwirth), Metrics Channel can enhance your observability posture by streaming real-time metrics of your Kubernetes objects. As usual, you can build sets of objects by mixing different sources (pods from different namespaces, different whole namespaces...) or even stream real-time metrics for a single container.

## What for
Metrics Channel can send to your browser (or your Kwirth-API consuming application) real-time observability that Kwirth gathers **directly from cAdvisor**.

!> This is important, **Kwirth does not need Prometheus** or other metrics-scraping software, Kwirth can gather required metrics directly from the kubelets running inside your nodes.

## Features
Main features of Metrics Channel are:

  - Gather metrics directly from cAdvisor/Kubelet (**no Prometheus required**)
  - Show metrics in real-time charts of different kinds: Line, Area, Bar chart or direct value
  - Group your objects to see them together in two different modes:
    - **Aggregate**: just sum up the values of same metrics from different objects and show it.
    - **Merge**: do not sum up the values, just show the metrics from different objects in the same chart. If you want to merge objects you can also decide whether to **stack** or **overlay** them.
  - As any other channel inside Kwirth, Metrics can reconnect even after losing the WebSocket connection, so you can stream real-time metrics in a non-stop way.

## Use
When you start the channel you must first set up how you want to receive the metrics and show them on the browser. These are the configuration items you must provide:

  - **Streaming mode**, default mode (not changeable right now) is 'Stream', that is, real time streaming.
  - **Depth**, select the number of values to show in the charts. When this limit is reached, oldest values will start to be removed.
  - **Width**, typically you select several metrics to be shown on the screen; you can decide how many charts to show on each line.
  - **Interval**, this is the refresh interval. Kwirth core will send you new values every *interval* seconds.
  - **Metrics list**, you can add as many metrics as you want, just click on a metric name to add or remove it from the list. You can use the filter to simplify the selection process. In addition to typical Kubernetes metrics exposed by cAdvisor, Kwirth adds some simple metrics whose names start with **kwirth_** and just show common usage metrics:
    - *kwirth_container_memory_percentage*, % of memory used by **all the objects in scope**
    - *kwirth_container_cpu_percentage*, % of CPU used by **all the objects in scope**
    - *kwirth_container_transmit_percentage*, % of data sent by **all the objects in scope**
    - *kwirth_container_receive_percentage*, % of data received by **all the objects in scope**
    - *kwirth_container_random_counter*, just for testing purposes.
    - *kwirth_container_random_gauge*, just for testing purposes.
  - **Drawing options**:
    - *Aggregate*, when there are multiple objects in scope, you can **aggregate** metric values in order to show one only value for all the objects' values.
    - *Merge*, if you don't want to aggregate the values of the metrics, you can decide to **merge** the values, so the same metric from different objects is shown in the same chart.
    - *Stack*, when you *merge* the values, you can decide whether to stack them or not.
    - *Chart*, select the chart type: Line, Area, Bar or Value.

You need to select at least one metric to be able to start the channel.

![metricssetup](../_media/ch-images/metrics-setup.png ':class=imageclass60')

Once you start a Metrics Channel you can see some charts like these ones.

One object with four Kwirth metrics.
![metricsrunning1](../_media/ch-images/metrics-running-1.png ':class=imageclass100')

Several objects shown bar-stacked.
![metricsrunning2](../_media/ch-images/metrics-running-2.png ':class=imageclass100')

Several objects shown area-stacked.
![metricsrunning3](../_media/ch-images/metrics-running-3.png ':class=imageclass100')

Several objects non-stacked.
![metricsrunning4](../_media/ch-images/metrics-running-4.png ':class=imageclass100')
