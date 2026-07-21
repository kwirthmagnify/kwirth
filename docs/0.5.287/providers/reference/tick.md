# Tick
Tick provider is a demo provider. It does not extract any data from Kubernetes; its main purpose is to serve as a starting point for developers aiming to develop a new provider.

## What for
Tick provider creates a 'tick' every 5 seconds, so channels subscribed to Tick provider will receive an empty-data event every five seconds. That's it.

## Features
Tick provider has no configuration; the interval for the Tick is fixed. The source for ticks (a `setInterval` in fact) is **unique** for all subscribers, that is, one only source for ticks *for each cluster*.

!> The source is linked to a running instance, not to Kwirth core, so you will have a unique Tick provider for each cluster.

## Use
When initializing a channel or when starting a channel (or any other moment afterwards) you can add yourself as a subscriber to the Tick provider, and you will start receiving ticks every five seconds.
