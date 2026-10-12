const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  platform: process.platform,
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
  onWindowState: (cb) => ipcRenderer.on('window:state', (e, state) => cb(state)),
  getAppVersion: () => ipcRenderer.invoke('app:getVersion'),
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  installUpdate: (file) => ipcRenderer.invoke('update:install', file),
  onUpdateProgress: (cb) => ipcRenderer.on('update:progress', (e, p) => cb(p)),
  setAutoUpdateCheck: (on) => ipcRenderer.send('update:setAutoCheck', on),
  onUpdateAvailable: (cb) => ipcRenderer.on('update:available', (e, info) => cb(info)),
  openExternal: (url) => ipcRenderer.send('shell:openExternal', url),

  openRobot: (kind) => ipcRenderer.invoke('file:open', kind),
  readRobot: (filePath) => ipcRenderer.invoke('file:read', filePath),
  saveRobot: (payload) => ipcRenderer.invoke('file:save', payload),
  exportText: (payload) => ipcRenderer.invoke('file:export', payload),
});
