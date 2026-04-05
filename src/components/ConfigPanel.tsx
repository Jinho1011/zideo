import { useCallback } from 'react'
import type { VideoFile, CutRange, ExportConfig, ExportJob } from '../types/video'
import { formatDuration, formatBytes, buildOutputFileName } from '../utils/format'
import { selectOutputFolder } from '../services/ipcClient'
import './ConfigPanel.css'

interface Props {
  video: VideoFile | null
  cutRange: CutRange
  config: ExportConfig
  onConfigChange: (config: ExportConfig) => void
  jobs: ExportJob[]
  onRemoveJob: (id: string) => void
  onClearJobs: () => void
}

export default function ConfigPanel({ video, cutRange, config, onConfigChange, jobs, onRemoveJob, onClearJobs }: Props) {
  const update = useCallback((patch: Partial<ExportConfig>) => {
    onConfigChange({ ...config, ...patch })
  }, [config, onConfigChange])

  const handleSelectOutputFolder = useCallback(async () => {
    const p = await selectOutputFolder()
    if (p) update({ outputFolder: p })
  }, [update])

  const previewFileName = video && cutRange.start !== null && cutRange.end !== null
    ? buildOutputFileName(config.fileNamePattern, video.name, cutRange.start, cutRange.end)
    : null

  const cutDuration = (cutRange.start !== null && cutRange.end !== null)
    ? cutRange.end - cutRange.start
    : null

  const completedJobs = jobs.filter(j => j.status === 'done' || j.status === 'error')
  const activeJobs = jobs.filter(j => j.status === 'queued' || j.status === 'running')

  return (
    <aside className="config-panel">
      <div className="config-header">
        <span className="panel-title">Config</span>
      </div>

      <div className="config-body">
        {/* Video info */}
        {video && (
          <section className="config-section">
            <h3 className="section-title">선택된 영상</h3>
            <div className="info-rows">
              <div className="info-row">
                <span className="info-label">파일명</span>
                <span className="info-value" title={video.name}>{video.name}</span>
              </div>
              {video.duration !== undefined && (
                <div className="info-row">
                  <span className="info-label">길이</span>
                  <span className="info-value">{formatDuration(video.duration)}</span>
                </div>
              )}
              {video.width && video.height && (
                <div className="info-row">
                  <span className="info-label">해상도</span>
                  <span className="info-value">{video.width} × {video.height}</span>
                </div>
              )}
              {video.codec && (
                <div className="info-row">
                  <span className="info-label">코덱</span>
                  <span className="info-value codec-tag">{video.codec.toUpperCase()}</span>
                </div>
              )}
              <div className="info-row">
                <span className="info-label">크기</span>
                <span className="info-value">{formatBytes(video.size)}</span>
              </div>
            </div>
          </section>
        )}

        {/* Cut range info */}
        {(cutRange.start !== null || cutRange.end !== null) && (
          <section className="config-section">
            <h3 className="section-title">구간 정보</h3>
            <div className="info-rows">
              {cutRange.start !== null && (
                <div className="info-row">
                  <span className="info-label">시작</span>
                  <span className="info-value accent">{formatDuration(cutRange.start)}</span>
                </div>
              )}
              {cutRange.end !== null && (
                <div className="info-row">
                  <span className="info-label">끝</span>
                  <span className="info-value accent">{formatDuration(cutRange.end)}</span>
                </div>
              )}
              {cutDuration !== null && (
                <div className="info-row">
                  <span className="info-label">구간 길이</span>
                  <span className="info-value accent strong">{formatDuration(cutDuration)}</span>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Export settings */}
        <section className="config-section">
          <h3 className="section-title">내보내기 설정</h3>

          <div className="form-field">
            <label className="field-label">출력 폴더</label>
            <div className="folder-input-row">
              <div className="folder-display" title={config.outputFolder || '폴더를 선택하세요'}>
                {config.outputFolder || <span className="placeholder">폴더를 선택하세요</span>}
              </div>
              <button className="browse-btn" onClick={handleSelectOutputFolder}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" stroke="currentColor" strokeWidth="2"/>
                </svg>
              </button>
            </div>
          </div>

          <div className="form-field">
            <label className="field-label">파일명 패턴</label>
            <input
              type="text"
              className="text-input"
              value={config.fileNamePattern}
              onChange={e => update({ fileNamePattern: e.target.value })}
              placeholder="{name}_cut_{start}"
            />
            <div className="field-hint">
              변수: <code>{'{name}'}</code> 원본명, <code>{'{start}'}</code> 시작시간, <code>{'{end}'}</code> 끝시간
            </div>
          </div>

          {previewFileName && (
            <div className="filename-preview">
              <span className="preview-label">미리보기</span>
              <span className="preview-name" title={previewFileName}>{previewFileName}</span>
            </div>
          )}

          <div className="form-field">
            <label className="field-label">건너뛰기 간격</label>
            <div className="skip-interval-group">
              {([5, 10, 15] as const).map(s => (
                <button
                  key={s}
                  className={`skip-interval-btn ${config.skipInterval === s ? 'active' : ''}`}
                  onClick={() => update({ skipInterval: s })}
                >
                  {s}초
                </button>
              ))}
            </div>
          </div>

          <div className="form-field">
            <label className="toggle-row">
              <span className="field-label">재인코딩</span>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={config.reencode}
                  onChange={e => update({ reencode: e.target.checked })}
                />
                <span className="toggle-track" />
              </label>
            </label>
            <div className="field-hint">
              {config.reencode
                ? '정확한 컷 (느림, H.264+AAC 재인코딩)'
                : '스트림 복사 (빠름, 코덱 의존)'}
            </div>
          </div>

          <div className="form-field">
            <label className="toggle-row">
              <span className="field-label">파일 덮어쓰기</span>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={config.overwrite}
                  onChange={e => update({ overwrite: e.target.checked })}
                />
                <span className="toggle-track" />
              </label>
            </label>
          </div>
        </section>

        {/* Validation warning */}
        {video && (cutRange.start === null || cutRange.end === null) && (
          <div className="validation-hint">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            플레이어에서 시작/끝 지점을 설정하세요.
          </div>
        )}

        {video && cutRange.start !== null && cutRange.end !== null && cutRange.start >= cutRange.end && (
          <div className="validation-hint error">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
              <path d="M12 8v4m0 4h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            시작 지점이 끝 지점보다 앞이어야 합니다.
          </div>
        )}

        {!config.outputFolder && (
          <div className="validation-hint">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            출력 폴더를 지정하세요.
          </div>
        )}

        {/* Jobs section */}
        {jobs.length > 0 && (
          <section className="config-section jobs-section">
            <div className="jobs-header">
              <h3 className="section-title">
                내보내기 작업
                {activeJobs.length > 0 && (
                  <span className="jobs-badge">{activeJobs.length}</span>
                )}
              </h3>
              {completedJobs.length > 0 && (
                <button className="clear-jobs-btn" onClick={onClearJobs}>
                  완료 지우기
                </button>
              )}
            </div>

            <div className="job-list">
              {jobs.map(job => (
                <div key={job.id} className={`job-card job-${job.status}`}>
                  <div className="job-card-top">
                    <div className="job-status-icon">
                      {job.status === 'queued' && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                          <path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                        </svg>
                      )}
                      {job.status === 'running' && (
                        <div className="job-spinner" />
                      )}
                      {job.status === 'done' && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                          <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                      {job.status === 'error' && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                          <path d="M6 18L18 6M6 6l12 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
                        </svg>
                      )}
                    </div>

                    <span className="job-filename" title={job.fileName}>{job.fileName}</span>

                    {(job.status === 'done' || job.status === 'error') && (
                      <button
                        className="job-remove-btn"
                        onClick={() => onRemoveJob(job.id)}
                        title="제거"
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                          <path d="M6 18L18 6M6 6l12 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
                        </svg>
                      </button>
                    )}
                  </div>

                  {job.status === 'running' && (
                    <div className="job-progress-track">
                      <div
                        className="job-progress-fill"
                        style={{ width: `${Math.round(job.progress * 100)}%` }}
                      />
                      <span className="job-progress-label">{Math.round(job.progress * 100)}%</span>
                    </div>
                  )}

                  {job.status === 'error' && job.error && (
                    <div className="job-error-msg" title={job.error}>{job.error}</div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </aside>
  )
}
