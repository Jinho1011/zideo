export interface ElectronAPI {
  selectFolder: () => Promise<string | null>
  selectOutputFolder: () => Promise<string | null>
  scanFolder: (folderPath: string) => Promise<Array<{
    name: string
    path: string
    size: number
    addedAt: string
  }>>
  getMetadata: (filePath: string) => Promise<{
    duration: number
    width: number
    height: number
    codec: string
    bitrate: number
  }>
  getThumbnail: (filePath: string, duration: number) => Promise<string>
  exportCut: (opts: {
    inputPath: string
    outputPath: string
    startTime: number
    endTime: number
    reencode: boolean
  }) => Promise<{ success: boolean; error?: string }>
  onExportProgress: (cb: (progress: number) => void) => () => void
  renameFile: (oldPath: string, newName: string) => Promise<string>
  deleteFile: (filePath: string) => Promise<void>
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
