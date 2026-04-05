import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

let ffmpegPath: string
let ffprobePath: string

try {
  ffmpegPath = require('@ffmpeg-installer/ffmpeg').path
  ffprobePath = require('@ffprobe-installer/ffprobe').path
} catch {
  ffmpegPath = 'ffmpeg'
  ffprobePath = 'ffprobe'
}

const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.mkv', '.avi', '.webm', '.m4v', '.ts', '.flv'])

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

// ─── GPU Encoder Detection ──────────────────────────────────────────────────

let cachedEncoder: string | null = null

async function detectVideoEncoder(): Promise<string> {
  if (cachedEncoder) return cachedEncoder

  const candidates = ['h264_nvenc', 'h264_amf', 'h264_qsv']
  for (const enc of candidates) {
    try {
      await execFileAsync(ffmpegPath, [
        '-f', 'lavfi', '-i', 'nullsrc=s=64x64',
        '-t', '0.1',
        '-c:v', enc,
        '-f', 'null', '-'
      ])
      console.log(`[zideo] GPU encoder detected: ${enc}`)
      cachedEncoder = enc
      return enc
    } catch {
      // encoder not available, try next
    }
  }

  console.log('[zideo] No GPU encoder found, using libx264')
  cachedEncoder = 'libx264'
  return 'libx264'
}

function getEncoderArgs(encoder: string): string[] {
  switch (encoder) {
    case 'h264_nvenc':
      return ['-c:v', 'h264_nvenc', '-cq', '18', '-preset', 'p4', '-c:a', 'aac']
    case 'h264_amf':
      return ['-c:v', 'h264_amf', '-rc', 'cqp', '-qp', '18', '-quality', 'balanced', '-c:a', 'aac']
    case 'h264_qsv':
      return ['-c:v', 'h264_qsv', '-global_quality', '18', '-preset', 'medium', '-c:a', 'aac']
    default:
      return ['-c:v', 'libx264', '-crf', '18', '-preset', 'fast', '-c:a', 'aac']
  }
}

// ─── Keyframe Search ────────────────────────────────────────────────────────

async function findNearestKeyframe(
  filePath: string,
  time: number,
  direction: 'before' | 'after'
): Promise<number | null> {
  const searchStart = Math.max(0, time - 12)
  const searchRange = `${searchStart}%+24`

  // No -show_entries filter: let FFprobe include all frame fields so timestamp
  // field names (pkt_pts_time / pts_time / best_effort_timestamp_time) are available
  // regardless of FFprobe version.
  const args = [
    '-v', 'quiet',
    '-print_format', 'json',
    '-select_streams', 'v:0',
    '-show_frames',
    '-read_intervals', searchRange,
    filePath
  ]

  try {
    const { stdout } = await execFileAsync(ffprobePath, args, { maxBuffer: 10 * 1024 * 1024 })
    const parsed = JSON.parse(stdout)
    const keyframeTimes: number[] = (parsed.frames ?? [])
      .filter((f: { key_frame: number }) => f.key_frame === 1)
      .map((f: Record<string, string>) => {
        const t = f.pkt_pts_time ?? f.pts_time ?? f.best_effort_timestamp_time
        return parseFloat(t)
      })
      .filter((t: number) => !isNaN(t))

    if (keyframeTimes.length === 0) return null

    if (direction === 'before') {
      const before = keyframeTimes.filter(t => t <= time)
      return before.length > 0 ? Math.max(...before) : null
    } else {
      const after = keyframeTimes.filter(t => t >= time)
      return after.length > 0 ? Math.min(...after) : null
    }
  } catch {
    return null
  }
}

// ─── FFmpeg helpers ─────────────────────────────────────────────────────────

function runFFmpeg(
  args: string[],
  onProgress: (p: number) => void,
  totalDuration: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = execFile(ffmpegPath, args)
    let stderr = ''

    proc.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
      const match = stderr.match(/time=(\d+):(\d+):([\d.]+)/)
      if (match) {
        const h = parseInt(match[1], 10)
        const m = parseInt(match[2], 10)
        const s = parseFloat(match[3])
        const elapsed = h * 3600 + m * 60 + s
        onProgress(Math.min(elapsed / totalDuration, 1))
      }
    })

    proc.on('close', (code: number | null) => {
      if (code === 0) resolve()
      else {
        const errMsg = `FFmpeg exited with code ${code}\n${stderr.slice(-800)}`
        reject(new Error(errMsg))
      }
    })

    proc.on('error', reject)
  })
}

function cleanupFiles(files: string[]) {
  for (const f of files) {
    try { if (fs.existsSync(f)) fs.unlinkSync(f) } catch { /* ignore */ }
  }
}

// ─── Smart Rendering ────────────────────────────────────────────────────────

async function smartRender(opts: {
  inputPath: string
  outputPath: string
  startTime: number
  endTime: number
  encoder: string
  onProgress: (p: number) => void
}): Promise<void> {
  const { inputPath, outputPath, startTime, endTime, encoder, onProgress } = opts
  const totalDuration = endTime - startTime
  const encoderArgs = getEncoderArgs(encoder)
  const tmpDir = os.tmpdir()
  const jobId = `zideo_${Date.now()}`
  const tempFiles: string[] = []

  try {
    // Find keyframes bracketing start and end
    const [startKf, endKf] = await Promise.all([
      findNearestKeyframe(inputPath, startTime, 'before'),
      findNearestKeyframe(inputPath, endTime, 'after')
    ])

    const startKeyframe = startKf ?? startTime
    const endKeyframe = endKf ?? endTime

    const needStartSeg = startKeyframe < startTime - 0.04  // >40ms gap
    const needEndSeg = endKeyframe > endTime + 0.04

    const segments: string[] = []

    // ── Segment A: startKeyframe → startTime (re-encode) ──
    if (needStartSeg) {
      const segA = path.join(tmpDir, `${jobId}_a.mp4`)
      tempFiles.push(segA)
      const durationA = startTime - startKeyframe
      await runFFmpeg([
        '-ss', String(startKeyframe),
        '-i', inputPath,
        '-t', String(durationA),
        ...encoderArgs,
        '-avoid_negative_ts', 'make_zero',
        '-y', segA
      ], p => onProgress(p * 0.05), durationA)
      segments.push(segA)
    }

    // ── Segment B: startTime → endTime (stream copy — the bulk) ──
    const segB = path.join(tmpDir, `${jobId}_b.mp4`)
    tempFiles.push(segB)
    await runFFmpeg([
      '-ss', String(startTime),
      '-i', inputPath,
      '-t', String(totalDuration),
      '-c', 'copy',
      '-avoid_negative_ts', 'make_zero',
      '-y', segB
    ], p => onProgress(0.05 + p * 0.85), totalDuration)
    segments.push(segB)

    // ── Segment C: endTime → endKeyframe (re-encode) ──
    if (needEndSeg) {
      const segC = path.join(tmpDir, `${jobId}_c.mp4`)
      tempFiles.push(segC)
      const durationC = endKeyframe - endTime
      await runFFmpeg([
        '-ss', String(endTime),
        '-i', inputPath,
        '-t', String(durationC),
        ...encoderArgs,
        '-avoid_negative_ts', 'make_zero',
        '-y', segC
      ], p => onProgress(0.90 + p * 0.05), durationC)
      segments.push(segC)
    }

    // ── Concat ──
    if (segments.length === 1) {
      // Only one segment (mid copy) — just rename/move it
      try {
        fs.renameSync(segments[0], outputPath)
      } catch (e: unknown) {
        if ((e as NodeJS.ErrnoException).code === 'EXDEV') {
          // Cross-drive move: copy then delete
          fs.copyFileSync(segments[0], outputPath)
          fs.unlinkSync(segments[0])
        } else {
          throw e
        }
      }
      // remove from tempFiles so cleanupFiles doesn't try to delete again
      tempFiles.splice(tempFiles.indexOf(segments[0]), 1)
    } else {
      const concatFile = path.join(tmpDir, `${jobId}_concat.txt`)
      tempFiles.push(concatFile)
      const concatContent = segments.map(s => `file '${s.replace(/\\/g, '/')}'`).join('\n')
      fs.writeFileSync(concatFile, concatContent, 'utf8')

      await runFFmpeg([
        '-f', 'concat',
        '-safe', '0',
        '-i', concatFile,
        '-c', 'copy',
        '-y', outputPath
      ], p => onProgress(0.95 + p * 0.05), 1)
    }

    onProgress(1)
  } finally {
    cleanupFiles(tempFiles)
  }
}

// ─── BrowserWindow ──────────────────────────────────────────────────────────

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#1a1a2e',
    titleBarStyle: 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false
    }
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  return win
}

app.whenReady().then(() => {
  createWindow()
  // Pre-warm encoder detection so first export has no delay
  detectVideoEncoder().catch(() => { cachedEncoder = 'libx264' })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ─── IPC: Select folder ────────────────────────────────────────────────────
ipcMain.handle('dialog:selectFolder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory']
  })
  return result.canceled ? null : result.filePaths[0]
})

// ─── IPC: Select output folder ─────────────────────────────────────────────
ipcMain.handle('dialog:selectOutputFolder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory']
  })
  return result.canceled ? null : result.filePaths[0]
})

// ─── IPC: Scan video files in folder ───────────────────────────────────────
ipcMain.handle('video:scanFolder', async (_event, folderPath: string) => {
  const entries = fs.readdirSync(folderPath, { withFileTypes: true })
  const files = entries
    .filter(e => e.isFile() && VIDEO_EXTENSIONS.has(path.extname(e.name).toLowerCase()))
    .map(e => {
      const fullPath = path.join(folderPath, e.name)
      const stat = fs.statSync(fullPath)
      return {
        name: e.name,
        path: fullPath,
        size: stat.size,
        addedAt: stat.mtime.toISOString()
      }
    })
  return files
})

// ─── IPC: Get video metadata via ffprobe ───────────────────────────────────
ipcMain.handle('video:getMetadata', async (_event, filePath: string) => {
  const args = [
    '-v', 'quiet',
    '-print_format', 'json',
    '-show_format',
    '-show_streams',
    filePath
  ]
  const { stdout } = await execFileAsync(ffprobePath, args)
  const data = JSON.parse(stdout)
  const duration = parseFloat(data.format?.duration ?? '0')
  const videoStream = data.streams?.find((s: { codec_type: string }) => s.codec_type === 'video')
  return {
    duration,
    width: videoStream?.width ?? 0,
    height: videoStream?.height ?? 0,
    codec: videoStream?.codec_name ?? '',
    bitrate: parseInt(data.format?.bit_rate ?? '0', 10)
  }
})

// ─── IPC: Generate thumbnail ────────────────────────────────────────────────
ipcMain.handle('video:getThumbnail', async (_event, filePath: string, duration: number) => {
  const tmpDir = os.tmpdir()
  const safeName = path.basename(filePath).replace(/[^a-zA-Z0-9._-]/g, '_')
  const thumbPath = path.join(tmpDir, `zideo_thumb_${safeName}.jpg`)

  if (fs.existsSync(thumbPath)) {
    const data = fs.readFileSync(thumbPath)
    return `data:image/jpeg;base64,${data.toString('base64')}`
  }

  const seekTime = Math.min(duration * 0.1, 5)
  const args = [
    '-ss', String(seekTime),
    '-i', filePath,
    '-vframes', '1',
    '-q:v', '4',
    '-vf', 'scale=240:-1',
    '-y',
    thumbPath
  ]

  await execFileAsync(ffmpegPath, args)
  const data = fs.readFileSync(thumbPath)
  return `data:image/jpeg;base64,${data.toString('base64')}`
})

// ─── IPC: Export cut ────────────────────────────────────────────────────────
ipcMain.handle('video:exportCut', async (event, opts: {
  inputPath: string
  outputPath: string
  startTime: number
  endTime: number
  reencode: boolean
}) => {
  const { inputPath, outputPath, startTime, endTime, reencode } = opts
  const duration = endTime - startTime

  if (!reencode) {
    // Stream copy — fast, unchanged behaviour
    return new Promise<{ success: boolean; error?: string }>((resolve) => {
      const args = [
        '-ss', String(startTime),
        '-i', inputPath,
        '-t', String(duration),
        '-c', 'copy',
        '-avoid_negative_ts', 'make_zero',
        '-y', outputPath
      ]
      const proc = execFile(ffmpegPath, args)
      let stderr = ''

      proc.stderr?.on('data', (chunk: Buffer) => {
        stderr += chunk.toString()
        const match = stderr.match(/time=(\d+):(\d+):([\d.]+)/)
        if (match) {
          const h = parseInt(match[1], 10)
          const m = parseInt(match[2], 10)
          const s = parseFloat(match[3])
          const elapsed = h * 3600 + m * 60 + s
          event.sender.send('export:progress', Math.min(elapsed / duration, 1))
        }
      })

      proc.on('close', (code: number | null) => {
        if (code === 0) {
          event.sender.send('export:progress', 1)
          resolve({ success: true })
        } else {
          resolve({ success: false, error: `FFmpeg exited with code ${code}` })
        }
      })

      proc.on('error', (err: Error) => {
        resolve({ success: false, error: err.message })
      })
    })
  }

  // Re-encode path — smart rendering + GPU acceleration
  try {
    const encoder = await detectVideoEncoder()

    await smartRender({
      inputPath,
      outputPath,
      startTime,
      endTime,
      encoder,
      onProgress: (p) => event.sender.send('export:progress', p)
    })

    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

// ─── IPC: Rename file ───────────────────────────────────────────────────────
ipcMain.handle('file:rename', async (_event, oldPath: string, newName: string) => {
  const dir = path.dirname(oldPath)
  const newPath = path.join(dir, newName)
  fs.renameSync(oldPath, newPath)
  return newPath
})

// ─── IPC: Delete file (to trash) ───────────────────────────────────────────
ipcMain.handle('file:delete', async (_event, filePath: string) => {
  await shell.trashItem(filePath)
})
