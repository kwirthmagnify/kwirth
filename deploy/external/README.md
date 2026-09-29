# Kwirth External
This package is a bundled Kwirth installation created for targeting these objectives:

  - Local installation, no need to install any Kwirth artifact on your Kubernetes cluster.
  - Non-docker support, no need to use docker locally for running Kwirth.
  - Independent front/back, you can start Kwirth with or without front. Since Kwirth architecture is an SPA plus an API, if you only need the API you can start Kwirth backend for using your own frontend, like the Backstage plugins we usually develop and evolve with every new Kwirth version.

## Install
Since this artifact is an npm package you need to previously have a NodeJS installed on your Windows/Linux/mac

First install Kwirth:
```sh
$ npm i -g @kwirthmagnify/kwirth-external
```

Once installed (globally with '-g' optin) just launch it to check if everything is OK:
```sh
$ kwirth-external --version
```

You should see a version number.

### Command Line options
If you enter 'kwirth-external --help' you should see an explanatio with all the options of Kwirth External:

```sh
$ kwirth-external --help 
Usage:
  $ kwirth-external

Commands:
  start   Start server
  apikey  Create an API Key

For more info, run any command with the `--help` flag:
  $ kwirth-external start --help
  $ kwirth-external --help
  $ kwirth-external apikey --help

Options:
  -c, --context <string>          Context to load (default: )
  -k, --apiKey                    Context to load (default: false)
  -p, --port <number>             Server port (default: 3883)
  -r, --rootpath <string>         Root path (default: )
  -k, --masterkey <string>        Master key (default: Kwirth4Ever)
  -t, --front                     Enable front SPA serving (default: false)
  -f, --forward                   FORWARD feature (default: false)
  -i, --metricsinterval <number>  Seconds between metrics (default: 15)
  -cl, --channellog               Channel LOG (default: true)
  -cm, --channelmetrics           Channel METRICS (default: true)
  -ca, --channelalert             Channel ALERT (default: true)
  -ce, --channelecho              Channel ECHO (default: true)
  -co, --channelops               Channel OPS (default: true)
  -ct, --channeltrivy             Channel TRIVY (default: true)
  -cy, --channelmagnify           Channel MAGNIFY (default: true)
  -cp, --channelpinocchio         Channel PINOCCHIO (default: true)
  -v, --version                   Display version number
  -h, --help                      Display this message
```

## Actions

### Start (start)
Just start the server.

### API Key (apikey)
Create a 1-day API Key and exit (acts like a normal command: creates teh API key, show it, end exit)

## Switches

### Context (-c, --context)
Set the kubeconfig context to load. If this switch is not present, Kwirth will connect to Kubernets cluster that is 'current' on your kubeconfig.

### API Key (-k, --apiKey)

### Port (-p, --port)
Set the port to listen from, for example 3090, and Kwirth will be serverd from 'http://your.host.name:3090'

### Root path (-r, --rootpath)
Set the root path where Kwirth will listen, for example '/observer/kwirth', and Kwirth will be serverd from 'http://your.host.name/observer/kwirth'

### Marter Key (-k, --masterkey)
Set the master key for securely signing Bearer tokens.

### Front (-t, --front)
Enable/Disable the front. If you just need the server with the API don't use this option and the servier will start just an API server.

!> The defualt option is false, so no front will be enabled bay default.

### Forwarding requests (-f, --forward)
Enable or disable the feature of forwairding traffic to Pods or Services.

### Metrics Intreval (-i, --metricsinterval)
Set the number of seconds to wait between two consecutive Kubelet metrics read.

### Channel Log (-cl, --channellog)
Enable/Disable the Log channel.

### Channel Metrics (-cm, --channelmetrics)
Enable/Disable the Metrics channel.

### Channel Alert( -ca, --channelalert)
Enable/Disable the Alert channel.

### Channel Echo(-ce, --channelecho)
Enable/Disable the Echo channel.

### Channel Ops (-co, --channelops)
Enable/Disable the Ops channel.

### Channel Trivy ( -ct, --channeltrivy)
Enable/Disable the Trivy channel.

### Channel Magnify (-cy, --channelmagnify)
Enable/Disable the Magnify channel.

### Channel Pinocchio (-cp, --channelpinocchio)
Enable/Disable the Pinocchio channel.

### -h, --help
Show Kwirth External command help.

### -v, --version
Show Kwirth version. Version number shown is the one of Kwirth Extgernal wrapper.
