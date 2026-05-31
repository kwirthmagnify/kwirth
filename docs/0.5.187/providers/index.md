# Providers
Starting with version 0.5, we have converted data sources (the ones we use for extracting data from Kubernetes) into 'providers'. This means:

  - Kwirth core can be extended by adding new providers.
  - Providers are now standardized, and they can be moved away from Kwirth core (converting them into plugins, for example).

Kwirth currently ships with the following providers:

  - **[Tick](reference/tick)**. Just a demo provider, it creates a heartbeat every 5 seconds.
  - **[Events](reference/events)**. Creates an event whenever a Kubernetes cluster event takes place.
  - **[Validating](reference/validating)**. Creates an event whenever the Kubernetes API needs a validation from a Validating webhook.
  - **[Business](reference/business)**. Ingests external business data into Kwirth via HTTP POST and distributes it to subscribed channels.

## Architecture
Providers is one of the data-streaming subsystems inside Kwirth, and it is very easy to understand. The provider subsystem offers a decoupling layer between the Kubernetes API and the channel subsystem, which adds these benefits:

  - **Isolation**, the channels are not tightly coupled to the Kubernetes API.
  - **Efficiency**, the data streams can be instantiated once per provider and distribute data to different channels (subscribers in fact), so the overhead introduced into the Kubernetes API server is minimal.
  - **Enrichment**, you can build providers that introduce external data into the Kwirth ecosystem.

What follows is an architectural view of the provider/channel subsystem.

![provider-arch](../_media/ch-images/providers-arch.png ':class=imageclass80')
