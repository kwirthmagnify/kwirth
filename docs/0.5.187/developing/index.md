# Developing channels

On the very first versions of Kwirth all its capabilities were implemented inside Kwirth core. That is, log streaming or the ability to restart pods or deployments were in fact TypeScript modules co-developed and integrated into Kwirth core, they were built next to it, creating one only piece which contains the core backend features (connection to Kubernetes cluster, managing security, serving as a storage system for profiles, etc.), the Kwirth capabilities (log streaming, cluster basic operations) and serving the front application (the React module).

Channel development has been taken outside of Kwirth core, so Kwirth features can be increased independently from Kwirth core evolution.
