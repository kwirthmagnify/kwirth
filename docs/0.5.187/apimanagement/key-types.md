# Access key types
For a client to use Kwirth (the API, the channels, the instances...) he must previously obtain an access key, as we have explained. The client must present an Access Key on every subsequent Kwirth API invocation, for example, when starting an instance, connecting to a data stream, etc.

Access keys can be any of these 3 types:

  - **Permanent**. These keys are stored in the kubernetes control plane, so they are usable until their expiration date arrives, even if Kwirth or the whole cluster is stopped and restarted.
  - **Volatile**. Volatile keys behave exactly like permanent ones in relation to permissions and capabilities, but they are not persisted, that is, they live only inside the memory of the Kwirth instance that created them, so they are not useful if you have more than one replica of a Kwirth core or you are worried about Kwirth, node or cluster restarts.
  - **Bearer**. Bearer keys are not persisted inside Kwirth nor your kubernetes cluster, they are created and digitally signed and sent to the client on his first login. Every time a client invokes an API he must present the token, and Kwirth core will check its integrity prior to accepting client requests. I mean, this is a typical bearer token like the ones used in OAuth, for example. Bearer keys must be presented in an HTTP 'Authorization' header with a format like this one:
    - Authorization: Bearer f417c2a1277d3f24|permanent|view:production:::
    - The id at front of the key (the access key id) is in fact a hash id (with a secure sign) used to protect the access key from being hacked/tampered for client credentials escalation. Clients can read keys, and must send them back to servers, but clients cannot modify them.

Anyway, the format and content of a key is exactly the same in all three types of tokens.
