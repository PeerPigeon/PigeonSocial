import { useEffect, useRef, useState } from 'react'
import { Play, Pause, Volume2, VolumeX, Maximize } from 'lucide-react'
import { pigeonSocial } from '../services/pigeonSocial'

interface VideoPlayerProps {
  postId: string
  magnetURI: string
  className?: string
}

export function VideoPlayer({ postId, magnetURI, className = '' }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    let currentBlobURL: string | null = null

    const initializeVideo = async () => {
      try {
        setIsLoading(true)
        setError(null)

        console.log('🎥 [VideoPlayer] Starting for post:', postId)
        console.log('🔗 [VideoPlayer] Magnet URI:', magnetURI?.substring(0, 50) + '...')

        // Ensure we have WebTorrent client
        const webtorrentClient = await pigeonSocial.getWebTorrentClient()
        if (!webtorrentClient) {
          throw new Error('WebTorrent client not available')
        }

        console.log('✅ [VideoPlayer] WebTorrent client ready')

        // Get or add the torrent
        let torrent = webtorrentClient.get(magnetURI)
        
        if (!torrent) {
          console.log('🔄 [VideoPlayer] Adding torrent...')
          torrent = webtorrentClient.add(magnetURI)
        } else {
          console.log('✅ [VideoPlayer] Using existing torrent')
        }

        // Wait for torrent to be ready
        const waitForReady = () => {
          return new Promise<void>((resolve, reject) => {
            if (torrent.ready && torrent.files && torrent.files.length > 0) {
              console.log('✅ [VideoPlayer] Torrent already ready')
              resolve()
              return
            }

            console.log('⏳ [VideoPlayer] Waiting for torrent ready...')
            
            const timeout = setTimeout(() => {
              reject(new Error('Torrent ready timeout after 30 seconds'))
            }, 30000)

            const onReady = () => {
              console.log('🎬 [VideoPlayer] Torrent ready event!')
              clearTimeout(timeout)
              resolve()
            }

            const onError = (err: Error) => {
              console.error('❌ [VideoPlayer] Torrent error:', err)
              clearTimeout(timeout)
              reject(err)
            }

            torrent.once('ready', onReady)
            torrent.once('error', onError)
          })
        }

        await waitForReady()

        if (!mounted) return

        // Find video file
        const videoFile = torrent.files.find((file: any) => 
          file.name.match(/\.(mp4|webm|ogg|mov|avi|mkv)$/i)
        ) || torrent.files[0]

        if (!videoFile) {
          throw new Error('No video file found in torrent')
        }

        console.log('🎥 [VideoPlayer] Found video file:', videoFile.name)

        if (!videoRef.current || !mounted) return

        // This is the key - use getBlobURL which works reliably in browsers
        console.log('🎬 [VideoPlayer] Getting blob URL...')
        videoFile.getBlobURL((err: Error | null, url: string) => {
          if (err) {
            console.error('❌ [VideoPlayer] getBlobURL error:', err)
            if (mounted) {
              setError('Failed to load video: ' + err.message)
              setIsLoading(false)
            }
            return
          }
          
          if (videoRef.current && mounted) {
            console.log('✅ [VideoPlayer] Setting video source to blob URL')
            currentBlobURL = url
            videoRef.current.src = url
            setIsLoading(false)
          }
        })

      } catch (err) {
        console.error('❌ [VideoPlayer] Initialization error:', err)
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Failed to load video')
          setIsLoading(false)
        }
      }
    }

    initializeVideo()

    return () => {
      mounted = false
      if (currentBlobURL) {
        URL.revokeObjectURL(currentBlobURL)
      }
    }
  }, [postId, magnetURI])

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause()
      } else {
        videoRef.current.play()
      }
      setIsPlaying(!isPlaying)
    }
  }

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted
      setIsMuted(!isMuted)
    }
  }

  const toggleFullscreen = () => {
    if (videoRef.current) {
      if (videoRef.current.requestFullscreen) {
        videoRef.current.requestFullscreen()
      }
    }
  }

  if (error) {
    return (
      <div className={`bg-gray-100 rounded-lg flex items-center justify-center ${className}`}>
        <div className="text-center text-gray-500">
          <div className="text-4xl mb-2">🎥</div>
          <p className="text-sm">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className={`relative bg-black rounded-lg overflow-hidden ${className}`}>
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
          <div className="text-white text-center">
            <div className="animate-spin w-8 h-8 border-2 border-white border-t-transparent rounded-full mx-auto mb-2"></div>
            <p className="text-sm">Loading video...</p>
          </div>
        </div>
      )}

      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onLoadedData={() => setIsLoading(false)}
        onError={() => setError('Video failed to load')}
        preload="metadata"
      />

      {/* Custom Controls */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
        <div className="flex items-center justify-between text-white">
          <div className="flex items-center gap-4">
            <button
              onClick={togglePlay}
              className="p-2 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
            >
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
            </button>

            <button
              onClick={toggleMute}
              className="p-2 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
            >
              {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </button>
          </div>

          <button
            onClick={toggleFullscreen}
            className="p-2 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
          >
            <Maximize className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  )
}
