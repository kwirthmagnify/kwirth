# News
!> **This is a test/demo channel.** News is not a Kubernetes observability tool — it is provided as a reference implementation showing how to build a Kwirth plugin that consumes an external data source instead of Kubernetes data.

News channel polls external RSS feeds and streams new items to the browser as they appear. It demonstrates the plugin lifecycle (start, pause, continue, stop) and the WebSocket message flow using a simple, easy-to-understand data source.

## What for
  - See a working example of a plugin that pulls data from an external HTTP source on a timer.
  - Test that Kwirth's plugin loading, WebSocket streaming, and pause/continue lifecycle work correctly.
  - Use as a starting point for building plugins that integrate external data feeds into Kwirth.

## Features
  - Polls two configurable RSS feeds every 5 minutes:
    - **Kubernetes** — `kubernetes.io/feed.xml`
    - **AI** — TechCrunch AI category feed
  - Deduplicates items across polls — each article is shown only once.
  - Supports **pause** and **continue** to temporarily stop receiving new items.
  - Configurable **max items** buffer: when the limit is reached, oldest items scroll off.

## Use
When you start a News channel you can configure:

  - **Max items** — maximum number of news items to keep on screen.
  - **Feeds** — select which feeds to subscribe to (Kubernetes, AI, or both).

![newssetup](../_media/ch-images/news-setup.png ':class=imageclass60')

Once started, news items appear as cards in the tab, sorted by publication date. Each card shows the title, source, category, and a link to the original article.

![newsrunning](../_media/ch-images/news-running.png ':class=imageclass60')
