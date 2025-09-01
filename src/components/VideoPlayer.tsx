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
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!magnetURI) return

    let mounted = true
    let cleanup: (() => void) | null = null

    const loadVideo = async () => {
      // Wait for refs to be available - React timing issue
      let retries = 0
      console.log('🎥 VideoPlayer: Checking refs initially - container:', !!containerRef.current, 'video:', !!videoRef.current)
      
      while (retries < 20 && (!containerRef.current && !videoRef.current) && mounted) {
        console.log('🎥 VideoPlayer: Waiting for refs to be available... retry:', retries)
        await new Promise(resolve => setTimeout(resolve, 50))
        retries++
        console.log('🎥 VideoPlayer: After wait - container:', !!containerRef.current, 'video:', !!videoRef.current)
      }

      // At this point we need at least one ref to work
      if (!containerRef.current && !videoRef.current) {
        console.error('❌ VideoPlayer: Neither container nor video ref available after waiting')
        if (mounted) {
          setError('Video player failed to initialize - DOM elements not available')
          setIsLoading(false)
        }
        return
      }

      console.log('🎥 VideoPlayer: Final ref check - container:', !!containerRef.current, 'video:', !!videoRef.current)

      if (!mounted) return

      setIsLoading(true)
      setError(null)
      setStatus('Connecting to P2P network...')
      
      try {
        console.log('🎥 VideoPlayer: Starting P2P video for:', magnetURI.substring(0, 50) + '...')
        
        // For newly created videos, the torrent should exist but may not be ready yet
        setStatus('Initializing video...')
        
        // Try to add the torrent (will return immediately if it already exists)
        try {
          await pigeonSocial.addTorrentFromMagnet(magnetURI)
        } catch (error: any) {
          console.error('❌ VideoPlayer: Failed to add torrent:', error)
          throw new Error('Failed to initialize video torrent')
        }
        
        if (!mounted) return
        
        // Wait longer for newly created torrents to initialize
        setStatus('Waiting for video to be ready...')
        let attempts = 0
        const maxAttempts = 20 // 20 attempts = 10 seconds
        let videoFile = null
        
        while (attempts < maxAttempts && !videoFile && mounted) {
          videoFile = pigeonSocial.getVideoFile(magnetURI)
          if (!videoFile) {
            console.log(`🎥 VideoPlayer: Attempt ${attempts + 1}/${maxAttempts} - video not ready yet`)
            await new Promise(resolve => setTimeout(resolve, 500)) // Wait 500ms between attempts
            attempts++
          }
        }
        
        if (!mounted) return
        
        if (!videoFile) {
          throw new Error('Video torrent took too long to initialize - please refresh and try again')
        }

        setStatus('Loading video file...')

        // Use the video file we found above
        console.log('🎥 VideoPlayer: Got video file:', videoFile.name)

        console.log('🎥 VideoPlayer: Got video file:', videoFile.name)
        setStatus('Streaming video...')

        // Follow wt.js pattern EXACTLY - NO BLOBS
        // Use appendTo with a container div - this is the most reliable method
        if (typeof videoFile.appendTo === 'function' && containerRef.current) {
          console.log('🎥 VideoPlayer: Using appendTo method with container')
          
          // Clear the container first
          containerRef.current.innerHTML = ''
          
          videoFile.appendTo(containerRef.current, (err: any) => {
            if (!mounted) return
            
            if (err) {
              console.error('❌ VideoPlayer: appendTo error:', err)
              const errorMsg = 'Failed to stream video: ' + err.message
              setError(errorMsg)
              onError?.(errorMsg)
              setIsLoading(false)
            } else {
              console.log('✅ VideoPlayer: appendTo successful!')
              setIsLoading(false)
              setStatus('')
              
              // Find the created video element and disable autoplay
              if (containerRef.current) {
                const createdVideo = containerRef.current.querySelector('video')
                if (createdVideo) {
                  createdVideo.autoplay = false
                  createdVideo.controls = true
                  createdVideo.preload = 'metadata'
                  console.log('🎥 VideoPlayer: Disabled autoplay on created video element')
                }
              }
              
              // Hide the original video element since appendTo creates its own
              if (videoRef.current) {
                videoRef.current.style.display = 'none'
              }
            }
          })
          
          // Set up cleanup
          cleanup = () => {
            if (containerRef.current) {
              containerRef.current.innerHTML = ''
            }
          }
          
        } else if (typeof videoFile.renderTo === 'function' && videoRef.current) {
          console.log('🎥 VideoPlayer: Using renderTo method with existing video element')
          
          videoFile.renderTo(videoRef.current, (err: any) => {
            if (!mounted) return
            
            if (err) {
              console.error('❌ VideoPlayer: renderTo error:', err)
              const errorMsg = 'Failed to stream video: ' + err.message
              setError(errorMsg)
              onError?.(errorMsg)
              setIsLoading(false)
            } else {
              console.log('✅ VideoPlayer: renderTo successful!')
              
              // Disable autoplay on the rendered video
              if (videoRef.current) {
                videoRef.current.autoplay = false
                videoRef.current.controls = true
                videoRef.current.preload = 'metadata'
                console.log('🎥 VideoPlayer: Disabled autoplay on rendered video element')
              }
              
              setIsLoading(false)
              setStatus('')
            }
          })
          
          // Set up cleanup
          cleanup = () => {
            if (videoRef.current) {
              videoRef.current.src = ''
              videoRef.current.load()
            }
          }
          
        } else {
          console.log('🎥 VideoPlayer: Available methods on videoFile:', Object.getOwnPropertyNames(Object.getPrototypeOf(videoFile)))
          console.log('🎥 VideoPlayer: Container available:', !!containerRef.current)
          console.log('🎥 VideoPlayer: Video element available:', !!videoRef.current)
          throw new Error('Video file does not support P2P streaming (missing appendTo/renderTo)')
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
      
      {/* Error overlay */}
      {error && (
        <div className="absolute inset-0 bg-red-900 bg-opacity-90 flex items-center justify-center z-10">
          <div className="text-center p-4">
            <p className="text-red-200">
              Failed to load video: {error}
            </p>
            <p className="text-xs text-red-300 mt-2">
              Post ID: {postId}
            </p>
          </div>
        </div>
      )}
      
      {/* Container for appendTo method - WebTorrent will create video element here */}
      <div 
        ref={containerRef}
        className="w-full"
        style={{ minHeight: '200px' }}
      />
      
      {/* Fallback video element for renderTo method */}
      <video
        ref={videoRef}
        controls
        autoPlay={false}
        className="w-full h-auto max-h-96"
        preload="metadata"
        onError={(e) => {
          const error = 'Video playback failed'
          console.error('❌ Video element error:', e)
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
