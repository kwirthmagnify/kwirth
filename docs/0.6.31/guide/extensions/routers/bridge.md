# Bridge

**Two Kwirths that reach each other through one outbound link.** Only one of them needs to reach the other: with
that single link, **each one sees the other in its cluster list**, and all of Kwirth works against it — tabs, live
channels, Magnify — even when one of them is behind NAT or a firewall.

Package: `@jfvilas/kwirth-router-bridge` · source: [github.com/jfvilas/kwirth/routers/bridge](https://github.com/jfvilas/kwirth/tree/master/routers/bridge) · open source.

```
   Kwirth A (behind NAT)                                      Kwirth B (reachable)
 ┌──────────────────────┐   one outbound WebSocket link   ┌──────────────────────┐
 │ bridge: sibling = B  ├────────────────────────────────►│ bridge (accepts)     │
 │                      │◄═══ A's sessions use B ════════│                      │
 │                      │════ B's sessions use A ═══════►│                      │
 └──────────────────────┘                                 └──────────────────────┘
```

## Typical uses

- **A cluster behind NAT** that must not be exposed: it links out to a Kwirth that is, and from that Kwirth you
  see it.
- **Magnify desktop and a cluster's Kwirth**: the desktop (always behind NAT) links to the cluster's Kwirth; the
  desktop sees that cluster, and that Kwirth sees the desktop's local clusters.
- **Two sites, one of them closed**: home and office, a lab and the cloud.

## Setting it up

1. Install **Bridge** in both Kwirths (*Manage extensions → Routers*). No restart.
2. In **B** (the one that can be reached), create an **access key** with the scope **Bridge · Peer link**
   (`bridge$peer`), in *Access keys*. Nothing else to configure in B.
3. In **A**, open Bridge's configuration (the gear) and fill in:

   | Field | Value |
   |---|---|
   | *Sibling URL* | B's URL, e.g. `https://kwirth-b.example.com/kwirth`. Empty: this Bridge only accepts links |
   | *Access key created in the sibling* | the key from step 2 (masked, with the eye) |
   | *Reconnect every (seconds)* | 10 by default |

   Save: A links to B at once. Bridge's card in both Kwirths says *Started*, and its tooltip who it is linked
   to (*outgoing* in A, *incoming* in B).
4. In each Kwirth, add the other one to the cluster list (see [adding a routed cluster](index#adding-a-routed-cluster)):
   its real URL, an API key **of that cluster**, *Route* **bridge**, and *Cluster UID* = the other one's uid.

**Configuring only one of them is enough**, and it is the recommended way: the one that can reach the other
dials, and over that one link **either side** starts requests and WebSockets towards the other.

## How it behaves

- **The other Kwirth decides.** What A sends for B is delivered to B's Kwirth as if it came from a browser, and
  **B authenticates and authorizes it** with the API key the entry carries. Bridge never decides what a user may
  do.
- **Only sessions use the route.** Traffic through Bridge comes from a session (a route ticket) or from Kwirth's
  own back end; an access key only opens the link itself.
- **Exactly one sibling.** A third Kwirth trying to link while the link lives is refused, and the refusal is
  logged.
- **Both configured to each other?** Both dial; if only one can reach the other, that link stays and the other
  side stops trying while it lives. If both can, both links come up and the one opened by the **lower cluster
  uid** stays.
- **It comes back on its own.** A link that fails is dialled again every *Reconnect every* seconds, and the link
  is checked every 30 seconds.
- **Revoking it.** Deleting the `bridge$peer` key in B cuts the link at once; A logs it and keeps retrying (and
  failing) until it is given a valid key again.

## Security

- Whoever holds a `bridge$peer` key of B can **be** B's sibling. Protect it like any other key, and delete it to
  cut the link.
- Bridge delivers what it carries to the other Kwirth **over loopback**. Kwirth's **login IP filter** only checks
  logins with user and password, which routed sessions never do — they use API keys. But keep **loopback out of
  the login allow list and out of the trusted proxies** of a Kwirth with Bridge installed: otherwise a login made
  by hand through the bridge would look local. On **Magnify desktop**, loopback is always allowed to log in.

## Log

Component **Routers** (`rout`), id `bridge`: link up and down (with whom, and which versions), refused links and
why, retries, and requests that could not be delivered.
