import { useState, useCallback, useEffect, useRef } from 'react'
import type { VideoFile, SortKey, SortOrder } from '../types/video'
import { selectFolder, scanFolder, getVideoMetadata, getVideoThumbnail, renameFile, deleteFile } from '../services/ipcClient'
import { formatDuration, formatDate, formatBytes } from '../utils/format'
import { loadState, saveState } from '../utils/storage'
import './ExplorerPanel.css'

interface Props {
  onVideoSelect: (video: VideoFile) => void
  selectedVideo: VideoFile | null
}

export default function ExplorerPanel({ onVideoSelect, selectedVideo }: Props) {
  const [folderPath, setFolderPath] = useState<string>(() => loadState('folderPath', ''))
  const [videos, setVideos] = useState<VideoFile[]>([])
  const [loading, setLoading] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>(() => loadState('sortKey', 'name'))
  const [sortOrder, setSortOrder] = useState<SortOrder>(() => loadState('sortOrder', 'asc'))
  const [renamingPath, setRenamingPath] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)
  const loadingRef = useRef(false)
  const didRestoreRef = useRef(false)

  // Persist sort settings on change
  useEffect(() => { saveState('sortKey', sortKey) }, [sortKey])
  useEffect(() => { saveState('sortOrder', sortOrder) }, [sortOrder])

  // Focus rename input when it appears
  useEffect(() => {
    if (renamingPath) renameInputRef.current?.focus()
  }, [renamingPath])

  const loadFolder = useCallback(async (path: string) => {
    setFolderPath(path)
    saveState('folderPath', path)
    setLoading(true)
    setVideos([])
    loadingRef.current = true

    try {
      const rawFiles = await scanFolder(path)
      setVideos(rawFiles)
      for (const file of rawFiles) {
        if (!loadingRef.current) break
        try {
          const meta = await getVideoMetadata(file.path)
          setVideos(prev =>
            prev.map(v => v.path === file.path
              ? { ...v, duration: meta.duration, width: meta.width, height: meta.height, codec: meta.codec }
              : v
            )
          )
          const thumb = await getVideoThumbnail(file.path, meta.duration)
          setVideos(prev =>
            prev.map(v => v.path === file.path ? { ...v, thumbnail: thumb } : v)
          )
        } catch {
          // skip individual file errors
        }
      }
    } catch {
      setFolderPath('')
      saveState('folderPath', '')
      setVideos([])
    } finally {
      setLoading(false)
      loadingRef.current = false
    }
  }, [])

  // Restore last folder on mount (once only)
  useEffect(() => {
    if (!didRestoreRef.current && folderPath) {
      didRestoreRef.current = true
      loadFolder(folderPath)
    }
  }, []) // intentionally run only on mount

  useEffect(() => {
    return () => { loadingRef.current = false }
  }, [])

  const handleSelectFolder = useCallback(async () => {
    const path = await selectFolder()
    if (!path) return
    loadFolder(path)
  }, [loadFolder])

  const startRename = useCallback((video: VideoFile, e: React.MouseEvent) => {
    e.stopPropagation()
    setRenamingPath(video.path)
    setRenameValue(video.name)
  }, [])

  const commitRename = useCallback(async () => {
    if (!renamingPath) return
    const trimmed = renameValue.trim()
    if (!trimmed || trimmed === videos.find(v => v.path === renamingPath)?.name) {
      setRenamingPath(null)
      return
    }
    try {
      const newPath = await renameFile(renamingPath, trimmed)
      setVideos(prev =>
        prev.map(v => v.path === renamingPath ? { ...v, name: trimmed, path: newPath } : v)
      )
    } catch (err) {
      alert(`이름 변경 실패: ${String(err)}`)
    } finally {
      setRenamingPath(null)
    }
  }, [renamingPath, renameValue, videos])

  const cancelRename = useCallback(() => {
    setRenamingPath(null)
  }, [])

  const handleRenameKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') commitRename()
    else if (e.key === 'Escape') cancelRename()
  }, [commitRename, cancelRename])

  const handleDelete = useCallback(async (video: VideoFile, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!window.confirm(`"${video.name}"을(를) 휴지통으로 이동하시겠습니까?`)) return
    try {
      await deleteFile(video.path)
      setVideos(prev => prev.filter(v => v.path !== video.path))
    } catch (err) {
      alert(`삭제 실패: ${String(err)}`)
    }
  }, [])

  const sorted = [...videos].sort((a, b) => {
    let cmp = 0
    if (sortKey === 'name') cmp = a.name.localeCompare(b.name, 'ko')
    else if (sortKey === 'date') cmp = new Date(a.addedAt).getTime() - new Date(b.addedAt).getTime()
    else if (sortKey === 'duration') cmp = (a.duration ?? 0) - (b.duration ?? 0)
    return sortOrder === 'asc' ? cmp : -cmp
  })

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortOrder(o => o === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortOrder('asc')
    }
  }

  const sortIcon = (key: SortKey) => {
    if (sortKey !== key) return <span className="sort-icon inactive">↕</span>
    return <span className="sort-icon active">{sortOrder === 'asc' ? '↑' : '↓'}</span>
  }

  return (
    <aside className="explorer-panel">
      <div className="explorer-header">
        <span className="panel-title">Explorer</span>
        <button className="folder-btn" onClick={handleSelectFolder} title="폴더 선택">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
          </svg>
          폴더 선택
        </button>
      </div>

      {folderPath && (
        <div className="folder-path" title={folderPath}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" stroke="currentColor" strokeWidth="2"/>
          </svg>
          <span>{folderPath}</span>
        </div>
      )}

      {videos.length > 0 && (
        <div className="sort-bar">
          <button
            className={`sort-btn ${sortKey === 'name' ? 'active' : ''}`}
            onClick={() => toggleSort('name')}
          >
            이름 {sortIcon('name')}
          </button>
          <button
            className={`sort-btn ${sortKey === 'date' ? 'active' : ''}`}
            onClick={() => toggleSort('date')}
          >
            날짜 {sortIcon('date')}
          </button>
          <button
            className={`sort-btn ${sortKey === 'duration' ? 'active' : ''}`}
            onClick={() => toggleSort('duration')}
          >
            길이 {sortIcon('duration')}
          </button>
        </div>
      )}

      <div className="video-list">
        {!folderPath && (
          <div className="empty-state">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
              <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" stroke="var(--text-muted)" strokeWidth="1.5"/>
            </svg>
            <p>폴더를 선택하여<br/>동영상을 불러오세요</p>
          </div>
        )}

        {folderPath && videos.length === 0 && !loading && (
          <div className="empty-state">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
              <path d="M15 10l4.553-2.669A1 1 0 0121 8.232v7.536a1 1 0 01-1.447.901L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" stroke="var(--text-muted)" strokeWidth="1.5"/>
            </svg>
            <p>동영상 파일이 없습니다</p>
          </div>
        )}

        {sorted.map(video => {
          const isRenaming = renamingPath === video.path
          const isSelected = selectedVideo?.path === video.path

          return (
            <div
              key={video.path}
              className={`video-item-wrapper ${isSelected ? 'selected' : ''}`}
            >
              <button
                className="video-item"
                onClick={() => !isRenaming && onVideoSelect(video)}
              >
                <div className="video-thumb">
                  {video.thumbnail
                    ? <img src={video.thumbnail} alt={video.name} />
                    : <div className="thumb-placeholder">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                          <path d="M15 10l4.553-2.669A1 1 0 0121 8.232v7.536a1 1 0 01-1.447.901L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" stroke="currentColor" strokeWidth="1.5"/>
                        </svg>
                      </div>
                  }
                </div>
                <div className="video-info">
                  {isRenaming ? (
                    <input
                      ref={renameInputRef}
                      className="rename-input"
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      onKeyDown={handleRenameKeyDown}
                      onBlur={commitRename}
                      onClick={e => e.stopPropagation()}
                    />
                  ) : (
                    <div className="video-name" title={video.name}>{video.name}</div>
                  )}
                  <div className="video-meta">
                    <span className="meta-duration">
                      {video.duration !== undefined
                        ? formatDuration(video.duration)
                        : <span className="loading-dots">...</span>
                      }
                    </span>
                    <span className="meta-date">{formatDate(video.addedAt)}</span>
                  </div>
                  <div className="video-meta">
                    <span className="meta-size">{formatBytes(video.size)}</span>
                    {video.codec && <span className="meta-codec">{video.codec.toUpperCase()}</span>}
                  </div>
                </div>
              </button>

              {/* Hover action buttons */}
              {!isRenaming && (
                <div className="video-actions">
                  <button
                    className="action-btn rename-btn"
                    onClick={(e) => startRename(video, e)}
                    title="이름 변경"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                  <button
                    className="action-btn delete-btn"
                    onClick={(e) => handleDelete(video, e)}
                    title="삭제 (휴지통으로)"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                      <polyline points="3 6 5 6 21 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                      <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                </div>
              )}
            </div>
          )
        })}

        {loading && (
          <div className="loading-indicator">
            <div className="spinner" />
            <span>메타데이터 로드 중...</span>
          </div>
        )}
      </div>
    </aside>
  )
}
