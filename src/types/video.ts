export interface VideoFile {
  name: string
  path: string
  size: number
  addedAt: string
  duration?: number
  width?: number
  height?: number
  codec?: string
  thumbnail?: string
}

export type SortKey = 'name' | 'date' | 'duration'
export type SortOrder = 'asc' | 'desc'

export interface ExportConfig {
  outputFolder: string
  fileNamePattern: string
  reencode: boolean
  overwrite: boolean
  skipInterval: 5 | 10 | 15
}

export interface CutRange {
  start: number | null
  end: number | null
}

export interface ExportJob {
  id: string
  fileName: string
  inputPath: string
  outputPath: string
  startTime: number
  endTime: number
  reencode: boolean
  status: 'queued' | 'running' | 'done' | 'error'
  progress: number
  error?: string
  createdAt: number
}
