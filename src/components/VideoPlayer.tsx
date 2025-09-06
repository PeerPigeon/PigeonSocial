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
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!magnetURI) return

    let mounted = true
    let cleanup: (() => void) | null = null

    const loadVideo = async () => {
      // Wait for container ref to be available
      let retries = 0
      while (retries < 20 && !containerRef.current && mounted) {
        await new Promise(resolve => setTimeout(resolve, 50))
        retries++
      }

      if (!containerRef.current || !mounted) {
        setError('Video container not available')
        setIsLoading(false)
        return
      }

      setIsLoading(true)
      setError(null)
      setStatus('Connecting to P2P network...')
      
      try {
        console.log('🎥 VideoPlayer: Starting P2P video for FULL magnet link:', magnetURI)
        console.log('🎥 VideoPlayer: Post ID:', postId)
        
        setStatus('Loading video file...')
        
        // Check if we already have this torrent ready (from seeding or re-seeding)
        let videoFile = pigeonSocial.getVideoFile(magnetURI)
        
        if (videoFile) {
          console.log('🎥 VideoPlayer: Video file already available (from seeding or re-seeding)!')
        } else {
          console.log('🎥 VideoPlayer: Video not immediately available, checking torrent status...')
          
          // Check if torrent is being seeded (should be true for poster's own videos)
          const isBeingSeeded = pigeonSocial.isTorrentBeingSeeded(magnetURI)
          
          if (isBeingSeeded) {
            console.log('🎥 VideoPlayer: Torrent is being seeded, waiting for video file...')
            
            // Wait a bit longer for seeded torrents to become accessible
            let attempts = 0
            while (attempts < 10 && !videoFile) {
              await new Promise(resolve => setTimeout(resolve, 200))
              videoFile = pigeonSocial.getVideoFile(magnetURI)
              attempts++
            }
            
            if (videoFile) {
              console.log('🎥 VideoPlayer: Video file available from seeded torrent!')
            } else {
              console.warn('🎥 VideoPlayer: Torrent is seeded but video file not accessible')
            }
          }
          
          if (!videoFile) {
            console.log('🎥 VideoPlayer: Need to add torrent for streaming...')
            
            setStatus('Connecting to P2P network for streaming...')
            
            try {
              console.log('🎥 VideoPlayer: Calling addTorrentFromMagnet for streaming...')
              await pigeonSocial.addTorrentFromMagnet(magnetURI)
              console.log('✅ VideoPlayer: Torrent added successfully!')
            } catch (error: any) {
              console.error('❌ VideoPlayer: Failed to add torrent:', error)
              throw new Error('Failed to connect to P2P network for this video: ' + error.message)
            }
            
            if (!mounted) return
            
            // Wait for the torrent to become ready for streaming
            setStatus('Preparing video stream...')
            console.log('🎥 VideoPlayer: Waiting for video file to become available for streaming...')
            
            let attempts = 0
            const maxAttempts = 60
            
            while (attempts < maxAttempts && !videoFile && mounted) {
              videoFile = pigeonSocial.getVideoFile(magnetURI)
              console.log(`🎥 VideoPlayer: Attempt ${attempts + 1}/${maxAttempts} - videoFile available:`, !!videoFile)
              
              if (!videoFile) {
                await new Promise(resolve => setTimeout(resolve, 500))
                attempts++
              }
            }
            
            if (!mounted) return
            
            if (!videoFile) {
              console.error('❌ VideoPlayer: Video streaming setup timed out after', maxAttempts, 'attempts')
              throw new Error('Video streaming setup timed out - no peers available or torrent is broken')
            }
            
            console.log('✅ VideoPlayer: Video file finally available for streaming after', attempts + 1, 'attempts')
          }
        }
        
        if (!mounted) return

        console.log('🎥 VideoPlayer: Got video file:', videoFile.name)
        setStatus('Preparing video...')

        // Use appendTo EXACTLY like wt.js - simple and clean
        console.log('🎥 VideoPlayer: Using appendTo method EXACTLY like wt.js')
        
        if (!videoFile || typeof videoFile.appendTo !== 'function') {
          throw new Error('Video file does not support appendTo method')
        }
        
        // Clear container
        containerRef.current.innerHTML = ''
        
        console.log('🎥 VideoPlayer: Calling appendTo with container')
        
        // Use appendTo EXACTLY like wt.js - no options, no callback complications
        videoFile.appendTo(containerRef.current, {
          autoplay: false,  // NEVER autoplay - user must click play
          muted: true,      // Muted to help prevent autoplay issues
          controls: true    // Always show controls
        })
        
        console.log('✅ VideoPlayer: appendTo called with autoplay=false - video will appear when ready!')
        
        // Find and configure the video element that WebTorrent creates
        setTimeout(() => {
          if (containerRef.current) {
            const videoElement = containerRef.current.querySelector('video')
            if (videoElement) {
              videoElement.autoplay = false
              videoElement.muted = true
              videoElement.controls = true
              videoElement.preload = 'metadata'
              
              // Force pause if somehow playing
              if (!videoElement.paused) {
                videoElement.pause()
              }
              
              console.log('🎥 VideoPlayer: Configured WebTorrent-created video element - autoplay disabled')
            }
          }
        }, 100)
        
        // Video will appear automatically when ready - just like wt.js
        setIsLoading(false)
        setStatus('')
        
        // Set up cleanup
        cleanup = () => {
          if (containerRef.current) {
            containerRef.current.innerHTML = ''
          }
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
      
      {/* Container where WebTorrent will append the video - EXACTLY like wt.js */}
      <div 
        ref={containerRef}
        className="w-full min-h-[200px]"
        style={{ backgroundColor: '#000' }}
      />
    </div>
  )
}

export default VideoPlayer
