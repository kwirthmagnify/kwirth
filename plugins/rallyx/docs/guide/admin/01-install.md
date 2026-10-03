# Installation

IRIA Rally-X is a **private plugin** published to the IRIA Operae Nexus (scope `@iriaoperae`).

## Prerequisites

- Kwirth 0.6.x or later
- Access to the IRIA Operae private package registry

## Install

Install the plugin from the private registry:

```bash
npm install @iriaoperae/kwirth-plugin-rallyx
```

Or configure it in your Kwirth manifest (private manifest, not the public one):

```json
{
  "plugins": {
    "rallyx": "@iriaoperae/kwirth-plugin-rallyx"
  }
}
```

## Verify

After installing, restart Kwirth. The Rally-X channel should appear in the channel selector
when adding a new tab.
