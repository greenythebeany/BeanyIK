const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
  onWindowState: (cb) => ipcRenderer.on('window:state', (e, state) => cb(state)),
  getAppVersion: () => ipcRenderer.invoke('app:getVersion'),
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  onUpdateAvailable: (cb) => ipcRenderer.on('update:available', (e, info) => cb(info)),
  openExternal: (url) => ipcRenderer.send('shell:openExternal', url),

  openRobot: () => ipcRenderer.invoke('file:open'),
  readRobot: (filePath) => ipcRenderer.invoke('file:read', filePath),
  saveRobot: (payload) => ipcRenderer.invoke('file:save', payload),
  exportText: (payload) => ipcRenderer.invoke('file:export', payload),
});
