const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('kwirth', {
  validateDns: (hostname) => ipcRenderer.invoke('validate-dns',  hostname),
  kubeApiAvailable: (url) => ipcRenderer.invoke('kube-api-available', url),
  storeGet: (key) => ipcRenderer.invoke('store-get', key),
  storeSet: (key, value) => ipcRenderer.invoke('store-set', key, value)
})