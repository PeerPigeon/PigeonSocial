import React, { useState, useEffect, useRef } from 'react'
import { pigeonSocial } from '../services/pigeonSocial'

interface VideoPlayerProps {
  postId: string
  magnetURI?: string
  onError?: (error: string) => void
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({ postId, magnetURI, onError }) => {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState('Initializing...')
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (!magnetURI) return

    let mounted = true
    let cleanup: (() => void) | null = null

    const loadVideo = async () => {
      // Wait for video ref to be available
      let retries = 0
      console.log('🎥 VideoPlayer: Checking video ref initially:', !!videoRef.current)
      
      while (retries < 20 && !videoRef.current && mounted) {
        console.log('🎥 VideoPlayer: Waiting for video ref... retry:', retries)
        await new Promise(resolve => setTimeout(resolve, 50))
        retries++
      }

      if (!videoRef.current) {
        console.error('❌ VideoPlayer: Video ref not available after waiting')
        if (mounted) {
          setError('Video player failed to initialize')
          setIsLoading(false)
        }
        return
      }

      if (!mounted) return

      setIsLoading(true)
      setError(null)
      setStatus('Connecting to P2P network...')
      
      try {
        console.log('🎥 VideoPlayer: Starting P2P video for FULL magnet link:', magnetURI)
        console.log('🎥 VideoPlayer: Post ID:', postId)
        
        setStatus('Initializing video...')
        
        // Check if we already have this torrent ready
        let videoFile = pigeonSocial.getVideoFile(magnetURI)
        
        if (videoFile) {
          console.log('🎥 VideoPlayer: Video file already available!')
        } else {
          console.log('🎥 VideoPlayer: Video not available, need to download/add torrent')
          
          setStatus('Downloading video from P2P network...')
          
          try {
            await pigeonSocial.addTorrentFromMagnet(magnetURI)
            console.log('🎥 VideoPlayer: Torrent added, waiting for it to be ready...')
          } catch (error: any) {
            console.error('❌ VideoPlayer: Failed to add torrent:', error)
            throw new Error('Failed to connect to P2P network for this video')
          }
          
          if (!mounted) return
          
          // Wait for the torrent to become ready
          setStatus('Waiting for video to download...')
          let attempts = 0
          const maxAttempts = 60 // 60 attempts = 30 seconds for downloading
          
          while (attempts < maxAttempts && !videoFile && mounted) {
            videoFile = pigeonSocial.getVideoFile(magnetURI)
            if (!videoFile) {
              console.log(`🎥 VideoPlayer: Attempt ${attempts + 1}/${maxAttempts} - waiting for video download`)
              await new Promise(resolve => setTimeout(resolve, 500))
              attempts++
            }
          }
          
          if (!mounted) return
          
          if (!videoFile) {
            throw new Error('Video download timed out - no peers available or video needs to be re-uploaded')
          }
        }
        
        if (!mounted) return

        setStatus('Loading video file...')
        console.log('🎥 VideoPlayer: Got video file:', videoFile.name)
        
        // Wait for some video data to be available before streaming
        setStatus('Waiting for video data...')
        console.log('🎥 VideoPlayer: Checking if video file has data downloaded...')
        console.log('🎥 VideoPlayer: Video file progress:', videoFile.progress, 'downloaded:', videoFile.downloaded)
        
        // Wait for at least some data to be downloaded before trying to stream
        let dataAttempts = 0
        const maxDataAttempts = 30 // 15 seconds
        
        while (dataAttempts < maxDataAttempts && videoFile.downloaded === 0 && mounted) {
          console.log(`🎥 VideoPlayer: Waiting for video data... attempt ${dataAttempts + 1}/${maxDataAttempts}`)
          await new Promise(resolve => setTimeout(resolve, 500))
          dataAttempts++
        }
        
        if (!mounted) return
        
        console.log('🎥 VideoPlayer: Video file after waiting - progress:', videoFile.progress, 'downloaded:', videoFile.downloaded)
        
        setStatus('Streaming video...')

        // Use getBlobURL method for reliable streaming (avoiding appendTo WebTorrent bugs)
        console.log('🎥 VideoPlayer: Using getBlobURL method for reliable streaming')
        console.log('🎥 VideoPlayer: Video file details:', {
          name: videoFile.name,
          length: videoFile.length,
          downloaded: videoFile.downloaded,
          progress: videoFile.progress
        })
        
        try {
          console.log('🎥 VideoPlayer: Creating stream for video file:', videoFile.name)
          
          // Skip the broken getBlobURL/getBlob methods - use createReadStream like wt.js
          console.log('🎥 VideoPlayer: Using createReadStream method (like wt.js)')
          
          if (typeof videoFile.createReadStream !== 'function') {
            throw new Error('Video file does not support createReadStream method')
          }
          
          // Create a read stream for the video file
          const stream = videoFile.createReadStream()
          console.log('🎥 VideoPlayer: Got video stream:', stream)
          
          // Use MediaSource API for true streaming like modern video players
          if ('MediaSource' in window && MediaSource.isTypeSupported('video/mp4; codecs="avc1.42E01E, mp4a.40.2"')) {
            console.log('🎥 VideoPlayer: Using MediaSource for true streaming')
            
            const mediaSource = new MediaSource()
            const url = URL.createObjectURL(mediaSource)
            
            if (videoRef.current) {
              videoRef.current.src = url
              videoRef.current.autoplay = false
              videoRef.current.muted = true
              videoRef.current.controls = true
              videoRef.current.preload = 'metadata'
              
              console.log('✅ VideoPlayer: Video element setup with MediaSource URL')
              setIsLoading(false)
              setStatus('')
            }
            
            mediaSource.addEventListener('sourceopen', () => {
              console.log('🎥 VideoPlayer: MediaSource opened')
              
              try {
                const sourceBuffer = mediaSource.addSourceBuffer('video/mp4; codecs="avc1.42E01E, mp4a.40.2"')
                let isUpdating = false
                const pendingChunks: ArrayBuffer[] = []
                
                const appendNextChunk = () => {
                  if (!isUpdating && pendingChunks.length > 0) {
                    isUpdating = true
                    const chunk = pendingChunks.shift()!
                    sourceBuffer.appendBuffer(chunk)
                  }
                }
                
                sourceBuffer.addEventListener('updateend', () => {
                  isUpdating = false
                  appendNextChunk()
                })
                
                stream.on('data', (chunk: any) => {
                  console.log('🎥 VideoPlayer: Received chunk for MediaSource, pending:', pendingChunks.length)
                  pendingChunks.push(chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength))
                  appendNextChunk()
                })
                
                stream.on('end', () => {
                  console.log('🎥 VideoPlayer: Stream ended, finalizing MediaSource')
                  if (!sourceBuffer.updating) {
                    mediaSource.endOfStream()
                  }
                })
                
                stream.on('error', (streamErr: any) => {
                  console.error('❌ VideoPlayer: Stream error:', streamErr)
                  if (mounted) {
                    setError('Video stream error: ' + streamErr.message)
                    setIsLoading(false)
                  }
                })
                
              } catch (sourceErr: any) {
                console.error('❌ VideoPlayer: MediaSource setup error:', sourceErr)
                // Fall back to simple blob approach
                fallbackToSimpleStream()
              }
            })
            
            cleanup = () => {
              if (stream && typeof stream.destroy === 'function') {
                stream.destroy()
              }
              URL.revokeObjectURL(url)
            }
            
          } else {
            // Fallback for browsers without MediaSource support
            fallbackToSimpleStream()
          }
          
          function fallbackToSimpleStream() {
            console.log('🎥 VideoPlayer: Using simple streaming fallback')
            
            // Create blob URL immediately with first chunk for instant thumbnail
            let hasCreatedInitialBlob = false
            const chunks: BlobPart[] = []
            
            stream.on('data', (chunk: any) => {
              chunks.push(chunk)
              console.log('🎥 VideoPlayer: Received chunk, total chunks:', chunks.length)
              
              // Create video blob after first few chunks for instant playback
              if (!hasCreatedInitialBlob && chunks.length >= 3) {
                hasCreatedInitialBlob = true
                try {
                  const partialBlob = new Blob(chunks, { type: 'video/mp4' })
                  const url = URL.createObjectURL(partialBlob)
                  console.log('🎥 VideoPlayer: Created initial video blob for instant playback:', url)
                  
                  if (videoRef.current && mounted) {
                    videoRef.current.src = url
                    videoRef.current.autoplay = false
                    videoRef.current.muted = true
                    videoRef.current.controls = true
                    videoRef.current.preload = 'metadata'
                    
                    console.log('✅ VideoPlayer: Video ready for immediate playback!')
                    setIsLoading(false)
                    setStatus('')
                    
                    cleanup = () => {
                      if (videoRef.current) {
                        videoRef.current.src = ''
                        videoRef.current.load()
                      }
                      URL.revokeObjectURL(url)
                    }
                  }
                } catch (blobErr: any) {
                  console.error('❌ VideoPlayer: Failed to create initial blob:', blobErr)
                }
              }
            })
            
            stream.on('end', () => {
              console.log('🎥 VideoPlayer: Stream ended')
              // Final blob is already set from the chunks above
            })
            
            stream.on('error', (streamErr: any) => {
              console.error('❌ VideoPlayer: Stream error:', streamErr)
              if (mounted) {
                setError('Video stream error: ' + streamErr.message)
                setIsLoading(false)
              }
            })
          }
          
        } catch (err: any) {
          console.error('❌ VideoPlayer: Stream creation failed:', err)
          console.error('❌ VideoPlayer: Video file object:', videoFile)
          console.error('❌ VideoPlayer: Video file torrent state:', {
            ready: videoFile._torrent?.ready,
            progress: videoFile._torrent?.progress,
            downloaded: videoFile._torrent?.downloaded,
            numPeers: videoFile._torrent?.numPeers
          })
          setError('Failed to create video stream: ' + err.message)
          setIsLoading(false)
        }
        
      } catch (err) {
        if (!mounted) return
        
        const errorMsg = err instanceof Error ? err.message : 'Failed to load video'
        console.error('❌ VideoPlayer: Failed to initialize P2P video:', errorMsg)
        setError(errorMsg)
        onError?.(errorMsg)
        setIsLoading(false)
        setStatus('')
      }
    }

    loadVideo()

    // Cleanup on unmount
    return () => {
      mounted = false
      if (cleanup) {
        cleanup()
      }
    }
  }, [magnetURI, onError])

  if (!magnetURI) {
    return (
      <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-8 text-center">
        <p className="text-gray-600 dark:text-gray-400">
          No video available
        </p>
        <p className="text-xs text-gray-500 mt-2">
          Post ID: {postId}
        </p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-8 text-center">
        <p className="text-red-600 dark:text-red-400">
          Failed to load video: {error}
        </p>
        <p className="text-xs text-gray-500 mt-2">
          Post ID: {postId}
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-lg overflow-hidden bg-black relative">
      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-black bg-opacity-75 flex items-center justify-center z-10">
          <div className="text-white text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-4"></div>
            <p className="text-white">
              {status}
            </p>
            <p className="text-xs text-gray-300 mt-2">
              Post ID: {postId}
            </p>
          </div>
        </div>
      )}
      
      {/* Video element */}
      <video
        ref={videoRef}
        controls
        autoPlay={false}
        className="w-full h-auto max-h-96"
        preload="metadata"
        onError={(e) => {
          const error = 'Video playback failed'
          console.error('❌ Video element error:', e)
          console.error('❌ Video element error details:', {
            type: e.type,
            target: e.target,
            currentTarget: e.currentTarget,
            nativeEvent: e.nativeEvent,
            timeStamp: e.timeStamp
          })
          
          // Get more details from the video element itself
          if (e.target) {
            const video = e.target as HTMLVideoElement
            console.error('❌ Video element state:', {
              src: video.src,
              currentSrc: video.currentSrc,
              readyState: video.readyState,
              networkState: video.networkState,
              error: video.error ? {
                code: video.error.code,
                message: video.error.message
              } : null,
              autoplay: video.autoplay,
              muted: video.muted,
              controls: video.controls
            })
          }
          
          setError(error)
          onError?.(error)
        }}
        onLoadStart={() => console.log('🎥 Video load started')}
        onCanPlay={() => console.log('✅ Video can play')}
      >
        Your browser does not support P2P video streaming.
      </video>
    </div>
  )
}

export default VideoPlayer
