import { useState, useCallback, useEffect } from 'react'
import ExplorerPanel from './components/ExplorerPanel'
import PreviewPanel from './components/PreviewPanel'
import ConfigPanel from './components/ConfigPanel'
import type { VideoFile, CutRange, ExportConfig } from './types/video'
import { loadState, saveState } from './utils/storage'
import { useJobQueue } from './hooks/useJobQueue'
import './App.css'

const DEFAULT_EXPORT_CONFIG: ExportConfig = {
  outputFolder: '',
  fileNamePattern: '{name}_cut_{start}',
  reencode: true,
  overwrite: false,
  skipInterval: 5
}

export default function App() {
  const [selectedVideo, setSelectedVideo] = useState<VideoFile | null>(null)
  const [cutRange, setCutRange] = useState<CutRange>({ start: null, end: null })
  const [exportConfig, setExportConfig] = useState<ExportConfig>(
    () => ({ ...DEFAULT_EXPORT_CONFIG, ...loadState('exportConfig', {}) })
  )

  const { jobs, addJob, removeJob, clearCompletedJobs } = useJobQueue()

  useEffect(() => {
    saveState('exportConfig', exportConfig)
  }, [exportConfig])

  const handleVideoSelect = useCallback((video: VideoFile) => {
    setSelectedVideo(video)
    setCutRange({ start: null, end: null })
  }, [])

  const handleCutRangeChange = useCallback((range: CutRange) => {
    setCutRange(range)
  }, [])

  return (
    <div className="app-layout">
      <header className="app-header">
        <div className="app-logo">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M15 10l4.553-2.669A1 1 0 0121 8.232v7.536a1 1 0 01-1.447.901L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" stroke="#6c63ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span>Zideo</span>
        </div>
        <span className="app-subtitle">Video Cut Editor</span>
      </header>
      <div className="app-body">
        <ExplorerPanel
          onVideoSelect={handleVideoSelect}
          selectedVideo={selectedVideo}
        />
        <PreviewPanel
          video={selectedVideo}
          cutRange={cutRange}
          onCutRangeChange={handleCutRangeChange}
          exportConfig={exportConfig}
          onAddJob={addJob}
        />
        <ConfigPanel
          video={selectedVideo}
          cutRange={cutRange}
          config={exportConfig}
          onConfigChange={setExportConfig}
          jobs={jobs}
          onRemoveJob={removeJob}
          onClearJobs={clearCompletedJobs}
        />
      </div>
    </div>
  )
}
