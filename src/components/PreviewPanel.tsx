import { useRef, useState, useEffect, useCallback } from 'react'
import type { VideoFile, CutRange, ExportConfig } from '../types/video'
import type { useJobQueue } from '../hooks/useJobQueue'
import { formatDuration } from '../utils/format'
import { buildOutputFileName } from '../utils/format'
import './PreviewPanel.css'

type AddJob = ReturnType<typeof useJobQueue>['addJob']

interface Props {
  video: VideoFile | null
  cutRange: CutRange
  onCutRangeChange: (range: CutRange) => void
  exportConfig: ExportConfig
  onAddJob: AddJob
}

export default function PreviewPanel({ video, cutRange, onCutRangeChange, exportConfig, onAddJob }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const seekingRef = useRef(false)
  const wasPlayingRef = useRef(false)
  const [queued, setQueued] = useState(false)
  const animFrameRef = useRef<number>(0)

  // Reset state when video changes
  useEffect(() => {
    setPlaying(false)
    setCurrentTime(0)
    setDuration(0)
    setQueued(false)
  }, [video?.path])

  const syncTime = useCallback(() => {
    const el = videoRef.current
    if (!el) return
    if (!seekingRef.current) {
      setCurrentTime(el.currentTime)
    }
    if (!el.paused) {
      animFrameRef.current = requestAnimationFrame(syncTime)
    }
  }, [])

  useEffect(() => {
    return () => cancelAnimationFrame(animFrameRef.current)
  }, [])

  const handlePlay = useCallback(() => {
    const el = videoRef.current
    if (!el) return
    if (el.paused) {
      el.play()
      setPlaying(true)
      animFrameRef.current = requestAnimationFrame(syncTime)
    } else {
      el.pause()
      setPlaying(false)
      cancelAnimationFrame(animFrameRef.current)
    }
  }, [syncTime])

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const t = parseFloat(e.target.value)
    if (videoRef.current) videoRef.current.currentTime = t
    setCurrentTime(t)
  }, [])

  const skip = useCallback((delta: number) => {
    const el = videoRef.current
    if (!el) return
    const next = Math.max(0, Math.min(el.duration, el.currentTime + delta))
    el.currentTime = next
    setCurrentTime(next)
  }, [])

  const setStart = useCallback(() => {
    const t = videoRef.current?.currentTime ?? 0
    onCutRangeChange({ ...cutRange, start: t })
  }, [cutRange, onCutRangeChange])

  const setEnd = useCallback(() => {
    const t = videoRef.current?.currentTime ?? 0
    onCutRangeChange({ ...cutRange, end: t })
  }, [cutRange, onCutRangeChange])

  const handleExport = useCallback(() => {
    if (!video) return
    const { start, end } = cutRange
    if (start === null || end === null) {
      alert('시작 지점과 끝 지점을 먼저 설정하세요.')
      return
    }
    if (start >= end) {
      alert('시작 지점이 끝 지점보다 앞이어야 합니다.')
      return
    }
    if (!exportConfig.outputFolder) {
      alert('우측 패널에서 출력 폴더를 설정하세요.')
      return
    }

    const fileName = buildOutputFileName(
      exportConfig.fileNamePattern,
      video.name,
      start,
      end
    )
    const outputPath = exportConfig.outputFolder + '\\' + fileName

    onAddJob({
      fileName,
      inputPath: video.path,
      outputPath,
      startTime: start,
      endTime: end,
      reencode: exportConfig.reencode
    })

    // Brief visual feedback on the button
    setQueued(true)
    setTimeout(() => setQueued(false), 1500)
  }, [video, cutRange, exportConfig, onAddJob])

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      if (e.code === 'Space') { e.preventDefault(); handlePlay() }
      else if (e.code === 'ArrowLeft') { e.preventDefault(); skip(-exportConfig.skipInterval) }
      else if (e.code === 'ArrowRight') { e.preventDefault(); skip(exportConfig.skipInterval) }
      else if (e.code === 'KeyI') setStart()
      else if (e.code === 'KeyO') setEnd()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handlePlay, skip, setStart, setEnd])

  const cutStart = cutRange.start ?? 0
  const cutEnd = cutRange.end ?? duration
  const canExport = !!video && cutRange.start !== null && cutRange.end !== null && !!exportConfig.outputFolder

  return (
    <main className="preview-panel">
      <div className="video-container">
        {video ? (
          <video
            ref={videoRef}
            key={video.path}
            src={`file:///${video.path.replace(/\\/g, '/')}`}
            className="video-player"
            onLoadedMetadata={e => setDuration((e.target as HTMLVideoElement).duration)}
            onEnded={() => { setPlaying(false); cancelAnimationFrame(animFrameRef.current) }}
            onClick={handlePlay}
          />
        ) : (
          <div className="video-placeholder">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none">
              <path d="M15 10l4.553-2.669A1 1 0 0121 8.232v7.536a1 1 0 01-1.447.901L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <p>동영상을 선택하면<br/>여기에 표시됩니다</p>
          </div>
        )}
      </div>

      <div className="controls-area">
        {/* Timeline */}
        <div className="timeline-section">
          <div className="time-display">
            <span className="time-current">{formatDuration(currentTime)}</span>
            <span className="time-sep">/</span>
            <span className="time-total">{formatDuration(duration)}</span>
          </div>

          <div className="timeline-wrapper">
            {duration > 0 && cutRange.start !== null && cutRange.end !== null && (
              <div
                className="cut-range-highlight"
                style={{
                  left: `${(cutStart / duration) * 100}%`,
                  width: `${((cutEnd - cutStart) / duration) * 100}%`
                }}
              />
            )}
            {duration > 0 && cutRange.start !== null && (
              <div
                className="range-marker start-marker"
                style={{ left: `${(cutStart / duration) * 100}%` }}
                title={`시작: ${formatDuration(cutRange.start)}`}
              />
            )}
            {duration > 0 && cutRange.end !== null && (
              <div
                className="range-marker end-marker"
                style={{ left: `${(cutEnd / duration) * 100}%` }}
                title={`끝: ${formatDuration(cutRange.end)}`}
              />
            )}
            <input
              type="range"
              className="timeline-slider"
              min={0}
              max={duration || 100}
              step={0.01}
              value={currentTime}
              onMouseDown={() => {
                seekingRef.current = true
                const el = videoRef.current
                if (el && !el.paused) {
                  wasPlayingRef.current = true
                  el.pause()
                  cancelAnimationFrame(animFrameRef.current)
                } else {
                  wasPlayingRef.current = false
                }
              }}
              onMouseUp={() => {
                seekingRef.current = false
                if (wasPlayingRef.current && videoRef.current) {
                  videoRef.current.play()
                  setPlaying(true)
                  animFrameRef.current = requestAnimationFrame(syncTime)
                }
              }}
              onInput={handleSeek}
              onChange={handleSeek}
              disabled={!video}
            />
          </div>

          {cutRange.start !== null && cutRange.end !== null && (
            <div className="cut-info">
              <span>구간: {formatDuration(cutRange.start)} → {formatDuration(cutRange.end)}</span>
              <span className="cut-duration">({formatDuration(cutRange.end - cutRange.start)})</span>
            </div>
          )}
        </div>

        {/* Buttons */}
        <div className="controls-buttons">
          <button
            className="ctrl-btn"
            onClick={() => skip(-exportConfig.skipInterval)}
            disabled={!video}
            title={`${exportConfig.skipInterval}초 뒤로 (←)`}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M12.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0019 16V8a1 1 0 00-1.6-.8l-5.334 4zM4.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0011 16V8a1 1 0 00-1.6-.8l-5.334 4z" fill="currentColor"/>
            </svg>
            <span>{exportConfig.skipInterval}s</span>
          </button>

          <button
            className="ctrl-btn play-btn"
            onClick={handlePlay}
            disabled={!video}
            title="재생/일시정지 (Space)"
          >
            {playing
              ? <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6zm8 0h4v16h-4z"/></svg>
              : <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            }
          </button>

          <button
            className="ctrl-btn"
            onClick={() => skip(exportConfig.skipInterval)}
            disabled={!video}
            title={`${exportConfig.skipInterval}초 앞으로 (→)`}
          >
            <span>{exportConfig.skipInterval}s</span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M11.934 11.2a1 1 0 010 1.6L6.6 16.8A1 1 0 015 16V8a1 1 0 011.6-.8l5.334 4zM19.934 11.2a1 1 0 010 1.6L14.6 16.8A1 1 0 0113 16V8a1 1 0 011.6-.8l5.334 4z" fill="currentColor"/>
            </svg>
          </button>

          <div className="ctrl-separator" />

          <button
            className={`ctrl-btn marker-btn ${cutRange.start !== null ? 'set' : ''}`}
            onClick={setStart}
            disabled={!video}
            title="시작 지점 설정 (I)"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <rect x="4" y="4" width="4" height="16" rx="1" fill="currentColor"/>
              <path d="M8 12h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            {cutRange.start !== null ? formatDuration(cutRange.start) : '시작'}
          </button>

          <button
            className={`ctrl-btn marker-btn ${cutRange.end !== null ? 'set' : ''}`}
            onClick={setEnd}
            disabled={!video}
            title="끝 지점 설정 (O)"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <rect x="16" y="4" width="4" height="16" rx="1" fill="currentColor"/>
              <path d="M4 12h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            {cutRange.end !== null ? formatDuration(cutRange.end) : '끝'}
          </button>

          <button
            className={`ctrl-btn export-btn ${queued ? 'success' : ''}`}
            onClick={handleExport}
            disabled={!canExport}
            title="내보내기 (큐에 추가)"
          >
            {queued ? (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                큐 추가됨
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                내보내기
              </>
            )}
          </button>
        </div>

        <div className="shortcut-hints">
          <span>Space: 재생/정지</span>
          <span>← →: {exportConfig.skipInterval}초 이동</span>
          <span>I: 시작점</span>
          <span>O: 끝점</span>
        </div>
      </div>
    </main>
  )
}
