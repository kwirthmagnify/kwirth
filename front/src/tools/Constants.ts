import { EInstanceConfigView } from "@kwirthmagnify/kwirth-common"
import { ITabSummary } from "../model/ITabObject"

interface IColors {
    stop: string
    start: string
    interrupt: string
    pause: string
    pending: string
}

const TABSELECTEDCOLORS: IColors = {
    stop: '#666666',
    start: '#34d058',
    interrupt: 'red',
    pause: '#0000d0',
    pending: '#ffc107'
}

const TABUNSELECTEDCOLORS: IColors = {
    stop: '#dddddd',
    start: '#084725',
    interrupt: '#500000',
    pause: '#000070',
    pending: '#dfaa0c',
}

const DEFAULTLASTTABS:ITabSummary[] = [
  {
    name: 'all-namespaces-log',
    description: 'Consolidated logs from all existing objects in all namespaces',
    channel: 'log',
    channelObject: {
      clusterName: 'inCluster',
      view: EInstanceConfigView.NAMESPACE,
      namespace: '*all',
      group: '',
      pod: '',
      container: ''
    }
  },
  {
    name: 'all-groups-fileman',
    description: 'File manager for all sets',
    channel: 'fileman',
    channelObject: {
      clusterName: 'inCluster',
      view: EInstanceConfigView.GROUP,
      namespace: '*all',
      group: '*all',
      pod: '',
      container: ''
    }
  },
  {
    name: 'all-pods-metrics',
    description: 'Basic metrics for all pods in cluster',
    channel: 'metrics',
    channelObject: {
      clusterName: 'inCluster',
      view: EInstanceConfigView.POD,
      namespace: '*all',
      group: '*all',
      pod: '*all',
      container: ''
    }
  },
  {
    name: 'all-containers-ops',
    description: 'Perform operations on all contianers',
    channel: 'ops',
    channelObject: {
      clusterName: 'inCluster',
      view: EInstanceConfigView.CONTAINER,
      namespace: '*all',
      group: '*all',
      pod: '*all',
      container: '*all'
    }
  }
]

export type { IColors }
export { DEFAULTLASTTABS, TABUNSELECTEDCOLORS, TABSELECTEDCOLORS }