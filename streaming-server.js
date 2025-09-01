// Simple streaming server following wt.js EXACTLY
const express = require('express')
const cors = require('cors')

const app = express()
const PORT = 3001

app.use(cors())
app.use(express.json())

// Import the WebTorrent client from the main app
let webtorrentClient = null

// Set the WebTorrent client reference
app.setWebTorrentClient = (client) => {
  webtorrentClient = client
}

// Stream video by info hash - EXACTLY like wt.js
app.get('/stream/:infoHash', (req, res) => {
  const { infoHash } = req.params
  
  console.log('🎥 Stream request for infoHash:', infoHash)
  
  if (!webtorrentClient) {
    return res.status(500).json({ error: 'WebTorrent client not available' })
  }

  const torrent = webtorrentClient.get(infoHash)
  if (!torrent) {
    return res.status(404).json({ error: 'Torrent not active' })
  }

  // Find video file in torrent - EXACTLY like wt.js
  const videoFile = torrent.files.find(file => 
    file.name.toLowerCase().match(/\.(mp4|avi|mkv|mov|wmv|flv|webm)$/)
  )

  if (!videoFile) {
    return res.status(404).json({ error: 'No video file found in torrent' })
  }

  const range = req.headers.range
  const fileSize = videoFile.length

  console.log('🎥 Streaming video:', videoFile.name, 'size:', fileSize, 'range:', range)

  // Handle client disconnect - EXACTLY like wt.js
  req.on('close', () => {
    console.log('Client disconnected from stream')
  })

  res.on('close', () => {
    console.log('Response stream closed')
  })

  if (range) {
    // Range request - EXACTLY like wt.js
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
    
    // Handle stream errors - EXACTLY like wt.js
    stream.on('error', (err) => {
      console.error('Stream error:', err.message)
      if (!res.headersSent) {
        res.status(500).end()
      }
    })

    stream.on('close', () => {
      console.log('File stream closed')
    })

    stream.pipe(res)

    // Clean up on response close - EXACTLY like wt.js
    res.on('close', () => {
      if (stream && !stream.destroyed) {
        stream.destroy()
      }
    })

  } else {
    // Full file request - EXACTLY like wt.js
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': 'video/mp4',
    })
    
    const stream = videoFile.createReadStream()
    
    // Handle stream errors - EXACTLY like wt.js
    stream.on('error', (err) => {
      console.error('Stream error:', err.message)
      if (!res.headersSent) {
        res.status(500).end()
      }
    })

    stream.on('close', () => {
      console.log('File stream closed')
    })

    stream.pipe(res)

    // Clean up on response close - EXACTLY like wt.js
    res.on('close', () => {
      if (stream && !stream.destroyed) {
        stream.destroy()
      }
    })
  }
})

let server = null

// Start the streaming server
const startStreamingServer = () => {
  if (server) return

  server = app.listen(PORT, () => {
    console.log(`🎥 Video streaming server running on http://localhost:${PORT}`)
  })
}

// Stop the streaming server
const stopStreamingServer = () => {
  if (server) {
    server.close()
    server = null
  }
}

// Export for use in browser (via dynamic import)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { app, startStreamingServer, stopStreamingServer }
} else {
  window.streamingServer = { app, startStreamingServer, stopStreamingServer }
}
