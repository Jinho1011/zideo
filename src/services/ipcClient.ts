import type { VideoFile } from '../types/video'

const api = () => window.electronAPI

export async function selectFolder(): Promise<string | null> {
  return api().selectFolder()
}

export async function selectOutputFolder(): Promise<string | null> {
  return api().selectOutputFolder()
}

export async function scanFolder(folderPath: string): Promise<VideoFile[]> {
  const raw = await api().scanFolder(folderPath)
  return raw.map(f => ({
    name: f.name,
    path: f.path,
    size: f.size,
    addedAt: f.addedAt
  }))
}

export async function getVideoMetadata(filePath: string): Promise<{
  duration: number
  width: number
  height: number
  codec: string
  bitrate: number
}> {
  return api().getMetadata(filePath)
}

export async function getVideoThumbnail(filePath: string, duration: number): Promise<string> {
  return api().getThumbnail(filePath, duration)
}

export async function exportCut(opts: {
  inputPath: string
  outputPath: string
  startTime: number
  endTime: number
  reencode: boolean
}): Promise<{ success: boolean; error?: string }> {
  return api().exportCut(opts)
}

export function onExportProgress(cb: (progress: number) => void): () => void {
  return api().onExportProgress(cb)
}

export async function renameFile(oldPath: string, newName: string): Promise<string> {
  return api().renameFile(oldPath, newName)
}

export async function deleteFile(filePath: string): Promise<void> {
  return api().deleteFile(filePath)
}
