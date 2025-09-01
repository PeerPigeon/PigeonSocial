import express from 'express'
import { pigeonSocial } from './pigeonSocial'

const app = express()
const PORT = 3002

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cache-Control, Pragma')
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200)
  } else {
    next()
  }
})

// Stream video by info hash - exactly like wt.js
app.get('/api/stream/:infoHash', async (req, res) => {
  const { infoHash } = req.params
  
  console.log('🎥 Stream request for infoHash:', infoHash)
  
  try {
    // Get the torrent client
    const client = (pigeonSocial as any).webtorrentClient
    if (!client) {
      return res.status(500).json({ error: 'WebTorrent client not available' })
    }

    const torrent = client.get(infoHash)
    if (!torrent) {
      return res.status(404).json({ error: 'Torrent not found' })
    }

    // Find video file in torrent - exactly like wt.js
    const videoFile = torrent.files.find((file: any) => 
      file.name.toLowerCase().match(/\.(mp4|avi|mkv|mov|wmv|flv|webm)$/)
    )

    if (!videoFile) {
      return res.status(404).json({ error: 'No video file found in torrent' })
    }

    const range = req.headers.range
    const fileSize = videoFile.length

    console.log('🎥 Streaming video:', videoFile.name, 'size:', fileSize, 'range:', range)

    // Handle client disconnect
    req.on('close', () => {
      console.log('Client disconnected from stream')
    })

    res.on('close', () => {
      console.log('Response stream closed')
    })

    if (range) {
      // Range request - exactly like wt.js
      const parts = range.replace(/bytes=/, "").split("-")
      const start = parseInt(parts[0], 10)
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1
      const chunksize = (end - start) + 1

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'video/mp4',
      })

      const stream = videoFile.createReadStream({ start, end })
      
      // Handle stream errors - exactly like wt.js
      stream.on('error', (err: any) => {
        console.error('Stream error:', err.message)
        if (!res.headersSent) {
          res.status(500).end()
        }
      })

      stream.on('close', () => {
        console.log('File stream closed')
      })

      stream.pipe(res)

      // Clean up on response close - exactly like wt.js
      res.on('close', () => {
        if (stream && !stream.destroyed) {
          stream.destroy()
        }
      })

    } else {
      // Full file request - exactly like wt.js
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': 'video/mp4',
      })
      
      const stream = videoFile.createReadStream()
      
      // Handle stream errors - exactly like wt.js
      stream.on('error', (err: any) => {
        console.error('Stream error:', err.message)
        if (!res.headersSent) {
          res.status(500).end()
        }
      })

      stream.on('close', () => {
        console.log('File stream closed')
      })

      stream.pipe(res)

      // Clean up on response close - exactly like wt.js
      res.on('close', () => {
        if (stream && !stream.destroyed) {
          stream.destroy()
        }
      })
    }

  } catch (error) {
    console.error('❌ Streaming error:', error)
    res.status(500).json({ error: 'Streaming failed' })
  }
})

app.listen(PORT, () => {
  console.log(`🎥 Video streaming server running on http://localhost:${PORT}`)
})

export default app
