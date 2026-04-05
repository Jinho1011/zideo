import { useState, useRef, useCallback } from 'react'
import type { ExportJob } from '../types/video'
import { exportCut, onExportProgress } from '../services/ipcClient'

type JobPayload = Pick<ExportJob, 'fileName' | 'inputPath' | 'outputPath' | 'startTime' | 'endTime' | 'reencode'>

export function useJobQueue(onJobDone?: () => void) {
  const [jobs, setJobs] = useState<ExportJob[]>([])
  const pendingJobsRef = useRef<ExportJob[]>([])
  const processingRef = useRef(false)

  const addJob = useCallback((payload: JobPayload) => {
    const newJob: ExportJob = {
      ...payload,
      id: `job-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      status: 'queued',
      progress: 0,
      createdAt: Date.now()
    }

    pendingJobsRef.current.push(newJob)
    setJobs(prev => [...prev, newJob])

    if (processingRef.current) return
    processingRef.current = true

    void (async () => {
      while (pendingJobsRef.current.length > 0) {
        const job = pendingJobsRef.current.shift()!

        setJobs(prev =>
          prev.map(j => j.id === job.id ? { ...j, status: 'running' } : j)
        )

        const unsub = onExportProgress(p => {
          setJobs(prev =>
            prev.map(j => j.id === job.id ? { ...j, progress: p } : j)
          )
        })

        try {
          const result = await exportCut({
            inputPath: job.inputPath,
            outputPath: job.outputPath,
            startTime: job.startTime,
            endTime: job.endTime,
            reencode: job.reencode
          })

          setJobs(prev =>
            prev.map(j => j.id === job.id
              ? {
                  ...j,
                  status: result.success ? 'done' : 'error',
                  progress: result.success ? 1 : j.progress,
                  error: result.error
                }
              : j
            )
          )
          if (result.success) onJobDone?.()
        } catch (err) {
          setJobs(prev =>
            prev.map(j => j.id === job.id
              ? { ...j, status: 'error', error: String(err) }
              : j
            )
          )
        } finally {
          unsub()
        }
      }

      processingRef.current = false
    })()
  }, [])

  const removeJob = useCallback((jobId: string) => {
    setJobs(prev => prev.filter(j => j.id !== jobId))
    // Also remove from pending queue if not yet started
    pendingJobsRef.current = pendingJobsRef.current.filter(j => j.id !== jobId)
  }, [])

  const clearCompletedJobs = useCallback(() => {
    setJobs(prev => prev.filter(j => j.status === 'queued' || j.status === 'running'))
  }, [])

  return { jobs, addJob, removeJob, clearCompletedJobs }
}
