import { useState, useCallback, useEffect, useRef } from 'react'
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

const MIN_SIDEBAR = 180
const COLLAPSED_WIDTH = 36
const MIN_PREVIEW = 720
const HANDLE_TOTAL = 12 // two 6px handles

export default function App() {
  const [selectedVideo, setSelectedVideo] = useState<VideoFile | null>(null)
  const [cutRange, setCutRange] = useState<CutRange>({ start: null, end: null })
  const [exportConfig, setExportConfig] = useState<ExportConfig>(
    () => ({ ...DEFAULT_EXPORT_CONFIG, ...loadState('exportConfig', {}) })
  )

  // Sidebar resize / collapse state
  const [leftWidth, setLeftWidth] = useState<number>(() => loadState('leftWidth', 280))
  const [rightWidth, setRightWidth] = useState<number>(() => loadState('rightWidth', 260))
  const [leftCollapsed, setLeftCollapsed] = useState<boolean>(() => loadState('leftCollapsed', false))
  const [rightCollapsed, setRightCollapsed] = useState<boolean>(() => loadState('rightCollapsed', false))

  // Track dragging state for cursor styling on body
  const draggingRef = useRef(false)

  const [refreshCounter, setRefreshCounter] = useState(0)
  const { jobs, addJob, removeJob, clearCompletedJobs } = useJobQueue(
    useCallback(() => setRefreshCounter(n => n + 1), [])
  )

  useEffect(() => { saveState('exportConfig', exportConfig) }, [exportConfig])
  useEffect(() => { saveState('leftWidth', leftWidth) }, [leftWidth])
  useEffect(() => { saveState('rightWidth', rightWidth) }, [rightWidth])
  useEffect(() => { saveState('leftCollapsed', leftCollapsed) }, [leftCollapsed])
  useEffect(() => { saveState('rightCollapsed', rightCollapsed) }, [rightCollapsed])

  // ── Resize handlers ──────────────────────────────────────────────────────

  const startLeftResize = useCallback((e: React.MouseEvent) => {
    if (leftCollapsed) return
    e.preventDefault()
    const startX = e.clientX
    const startW = leftWidth
    draggingRef.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const onMove = (ev: MouseEvent) => {
      const effectiveRight = rightCollapsed ? COLLAPSED_WIDTH : rightWidth
      const max = window.innerWidth - effectiveRight - MIN_PREVIEW - HANDLE_TOTAL
      setLeftWidth(Math.max(MIN_SIDEBAR, Math.min(max, startW + ev.clientX - startX)))
    }
    const onUp = () => {
      draggingRef.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [leftWidth, rightWidth, leftCollapsed, rightCollapsed])

  const startRightResize = useCallback((e: React.MouseEvent) => {
    if (rightCollapsed) return
    e.preventDefault()
    const startX = e.clientX
    const startW = rightWidth
    draggingRef.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const onMove = (ev: MouseEvent) => {
      const effectiveLeft = leftCollapsed ? COLLAPSED_WIDTH : leftWidth
      const max = window.innerWidth - effectiveLeft - MIN_PREVIEW - HANDLE_TOTAL
      setRightWidth(Math.max(MIN_SIDEBAR, Math.min(max, startW - (ev.clientX - startX))))
    }
    const onUp = () => {
      draggingRef.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [rightWidth, leftWidth, leftCollapsed, rightCollapsed])

  // ── App state handlers ────────────────────────────────────────────────────

  const handleVideoSelect = useCallback((video: VideoFile) => {
    setSelectedVideo(video)
    setCutRange({ start: null, end: null })
  }, [])

  const handleCutRangeChange = useCallback((range: CutRange) => {
    setCutRange(range)
  }, [])

  const toggleLeft = useCallback(() => setLeftCollapsed(v => !v), [])
  const toggleRight = useCallback(() => setRightCollapsed(v => !v), [])
  const handleVideoDeselect = useCallback(() => setSelectedVideo(null), [])

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
          style={{ width: leftCollapsed ? COLLAPSED_WIDTH : leftWidth }}
          collapsed={leftCollapsed}
          onToggleCollapse={toggleLeft}
          onVideoSelect={handleVideoSelect}
          onVideoDeselect={handleVideoDeselect}
          selectedVideo={selectedVideo}
          refreshTrigger={refreshCounter}
        />
        <div
          className={`resize-handle${leftCollapsed ? ' resize-handle--disabled' : ''}`}
          onMouseDown={startLeftResize}
        />
        <PreviewPanel
          video={selectedVideo}
          cutRange={cutRange}
          onCutRangeChange={handleCutRangeChange}
          exportConfig={exportConfig}
          onAddJob={addJob}
        />
        <div
          className={`resize-handle${rightCollapsed ? ' resize-handle--disabled' : ''}`}
          onMouseDown={startRightResize}
        />
        <ConfigPanel
          style={{ width: rightCollapsed ? COLLAPSED_WIDTH : rightWidth }}
          collapsed={rightCollapsed}
          onToggleCollapse={toggleRight}
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
