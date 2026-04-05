import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  selectFolder: () => ipcRenderer.invoke('dialog:selectFolder'),
  selectOutputFolder: () => ipcRenderer.invoke('dialog:selectOutputFolder'),
  scanFolder: (folderPath: string) => ipcRenderer.invoke('video:scanFolder', folderPath),
  getMetadata: (filePath: string) => ipcRenderer.invoke('video:getMetadata', filePath),
  getThumbnail: (filePath: string, duration: number) =>
    ipcRenderer.invoke('video:getThumbnail', filePath, duration),
  exportCut: (opts: {
    inputPath: string
    outputPath: string
    startTime: number
    endTime: number
    reencode: boolean
  }) => ipcRenderer.invoke('video:exportCut', opts),
  onExportProgress: (cb: (progress: number) => void) => {
    const listener = (_: Electron.IpcRendererEvent, progress: number) => cb(progress)
    ipcRenderer.on('export:progress', listener)
    return () => ipcRenderer.removeListener('export:progress', listener)
  },
  renameFile: (oldPath: string, newName: string) =>
    ipcRenderer.invoke('file:rename', oldPath, newName),
  deleteFile: (filePath: string) =>
    ipcRenderer.invoke('file:delete', filePath)
})
