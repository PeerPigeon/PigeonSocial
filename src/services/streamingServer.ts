import express from 'express'
import cors from 'cors'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const app = express()
const PORT = process.env.PORT || 3001

// Global WebTorrent client - will be set by the main app
let webtorrentClient: any = null

// Store active torrents (shared with main app)
const activeTorrents = new Map<string, any>()

// Middleware
app.use(cors())
app.use(express.json())

// Set WebTorrent client (called from main app)
export function setWebTorrentClient(client: any) {
  webtorrentClient = client
  console.log('🌊 WebTorrent client set for streaming server')
}

// Register a torrent for streaming
export function registerTorrent(postId: string, torrent: any) {
  activeTorrents.set(postId, torrent)
  console.log('📹 Registered torrent for streaming:', postId)
}

// Unregister a torrent
export function unregisterTorrent(postId: string) {
  activeTorrents.delete(postId)
  console.log('📹 Unregistered torrent for streaming:', postId)
}

// Stream video by post ID
app.get('/stream/:postId', (req, res) => {
  const { postId } = req.params
  const torrent = activeTorrents.get(postId)
  
  if (!torrent) {
    return res.status(404).json({ error: 'Video not found for post' })
  }

  if (!torrent.ready || !torrent.files || torrent.files.length === 0) {
    return res.status(503).json({ error: 'Video not ready yet' })
  }

  // Find video file in torrent
  const videoFile = torrent.files.find((file: any) => 
    file.name.toLowerCase().match(/\.(mp4|avi|mkv|mov|wmv|flv|webm|ogg)$/i)
  ) || torrent.files[0]

  if (!videoFile) {
    return res.status(404).json({ error: 'No video file found in torrent' })
  }

  const range = req.headers.range
  const fileSize = videoFile.length

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-")
    const start = parseInt(parts[0], 10)
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1
    const chunksize = (end - start) + 1

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': 'video/mp4',
      'Cache-Control': 'no-cache',
    })

    const stream = videoFile.createReadStream({ start, end })
    stream.pipe(res)
  } else {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': 'video/mp4',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-cache',
    })
    const stream = videoFile.createReadStream()
    stream.pipe(res)
  }
})

// Get video info by post ID
app.get('/info/:postId', (req, res) => {
  const { postId } = req.params
  const torrent = activeTorrents.get(postId)
  
  if (!torrent) {
    return res.status(404).json({ error: 'Video not found for post' })
  }

  const videoFile = torrent.files?.find((file: any) => 
    file.name.toLowerCase().match(/\.(mp4|avi|mkv|mov|wmv|flv|webm|ogg)$/i)
  ) || torrent.files?.[0]

  res.json({
    ready: torrent.ready,
    fileCount: torrent.files?.length || 0,
    videoFile: videoFile ? {
      name: videoFile.name,
      size: videoFile.length
    } : null,
    progress: torrent.progress,
    downloadSpeed: torrent.downloadSpeed,
    uploadSpeed: torrent.uploadSpeed,
    numPeers: torrent.numPeers
  })
})

let server: any = null

// Start the streaming server
export function startStreamingServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (server) {
      resolve()
      return
    }

    server = app.listen(PORT, () => {
      console.log(`🌊 Video streaming server running on http://localhost:${PORT}`)
      resolve()
    })

    server.on('error', (error: any) => {
      if (error.code === 'EADDRINUSE') {
        console.log(`⚠️ Port ${PORT} is in use, video streaming may not work properly`)
        resolve() // Don't fail the whole app
      } else {
        reject(error)
      }
    })
  })
}

// Stop the streaming server
export function stopStreamingServer(): Promise<void> {
  return new Promise((resolve) => {
    if (server) {
      server.close(() => {
        server = null
        console.log('🌊 Video streaming server stopped')
        resolve()
      })
    } else {
      resolve()
    }
  })
}
