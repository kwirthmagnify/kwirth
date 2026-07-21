# Providers
Starting with version 0.5, we have converted data sources (the ones we use for extracting data from Kubernetes) into 'providers'. This means:

  - Kwirth core can be extended by adding new providers.
  - Providers are now standardized, and they can be moved away from Kwirth core (converting them into plugins, for example).

Kwirth currently ships with the following providers:

  - **[Tick](reference/tick)**. Demo provider — fires a heartbeat every 5 seconds. Useful for testing channel subscriptions.
  - **[Events](reference/events)**. Streams a Kwirth event whenever a Kubernetes cluster event takes place (Pod created, Deployment scaled, etc.).
  - **[Validating](reference/validating)**. Creates an event whenever the Kubernetes API needs a response from a Validating webhook.
  - **[Business](reference/business)**. Ingests external business data into Kwirth via HTTP POST and distributes it to subscribed channels by space/type.
  - **[Metrics](reference/metrics)**. Polls the Kubernetes cAdvisor API on a configurable interval and distributes cluster-wide resource metrics to subscribed channels.
  - **[Kafka](reference/kafka)**. Connects to one or more Kafka broker sets and distributes topic messages to channels via the same space/type routing model as Business.
  - **[OpenTelemetry](reference/otel)**. Turns Kwirth into an OTLP/HTTP receiver — any OTel-instrumented service can push traces, metrics, and logs directly to Kwirth.
  - **[Sample](reference/sample)**. Reference implementation for provider developers. Use it as a starting point for building custom providers.

## Architecture
Providers is one of the data-streaming subsystems inside Kwirth, and it is very easy to understand. The provider subsystem offers a decoupling layer between the Kubernetes API and the channel subsystem, which adds these benefits:

  - **Isolation**, the channels are not tightly coupled to the Kubernetes API.
  - **Efficiency**, the data streams can be instantiated once per provider and distribute data to different channels (subscribers in fact), so the overhead introduced into the Kubernetes API server is minimal.
  - **Enrichment**, you can build providers that introduce external data into the Kwirth ecosystem.

What follows is an architectural view of the provider/channel subsystem.

![provider-arch](../_media/ch-images/providers-arch.png ':class=imageclass80')
