// Cầu nối an toàn giữa giao diện và ứng dụng: chỉ mở đúng các chức năng cập nhật.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('h2vApp', {
  version: () => ipcRenderer.invoke('h2v:version'),
  check: () => ipcRenderer.invoke('h2v:check'),
  install: () => ipcRenderer.invoke('h2v:install'),
  onUpdate: cb => { ipcRenderer.on('h2v-update', (_e, s) => cb(s)); }
});
