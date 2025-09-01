import { useState, useRef } from 'react'
import { motion } from 'framer-motion'
import { X, Send, User } from 'lucide-react'
import { pigeonSocial, UserProfile, Post } from '../services/pigeonSocial'
import { friendService } from '../services/friendService'
import { useNotifications } from '../contexts/NotificationContext'

interface CreatePostProps {
  user: UserProfile
  onClose: () => void
  onPostCreated: (post: Post) => void
}

export function CreatePost({ user, onClose, onPostCreated }: CreatePostProps) {
  const { showError } = useNotifications()
  const [content, setContent] = useState('')
  const [image, setImage] = useState<string | null>(null)
  const [videoFile, setVideoFile] = useState<File | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const videoInputRef = useRef<HTMLInputElement>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!content.trim() && !image && !videoFile || isSubmitting) return

    setIsSubmitting(true)
    
    try {
      const post = await pigeonSocial.createPost(content.trim(), image || undefined, videoFile || undefined)
      onPostCreated(post)
      
      // Share the post with friends
      await friendService.sharePost(post)
      
      setContent('')
      setImage(null)
      setVideoFile(null)
      onClose()
    } catch (error) {
      console.error('Failed to create post:', error)
      showError('Failed to create post', 'Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item.type.indexOf('image') !== -1) {
        e.preventDefault()
        const file = item.getAsFile()
        if (file) {
          const reader = new FileReader()
          reader.onload = (event) => {
            const base64 = event.target?.result as string
            setImage(base64)
            setVideoFile(null) // Clear video if image is pasted
          }
          reader.readAsDataURL(file)
        }
        break
      } else if (item.type.indexOf('video') !== -1) {
        e.preventDefault()
        const file = item.getAsFile()
        if (file) {
          setVideoFile(file)
          setImage(null) // Clear image if video is pasted
        }
        break
      }
    }
  }

  const maxLength = 280

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start justify-center p-4 z-50"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ opacity: 0, y: 50, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 50, scale: 0.95 }}
        className="glass-card w-full max-w-lg mt-20"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">Create Post</h2>
          <motion.button
            whileHover={{ scale: 1.1, rotate: 90 }}
            whileTap={{ scale: 0.9 }}
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-all"
          >
            <X className="w-5 h-5" />
          </motion.button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6">
          <div className="flex gap-4 mb-6">
            <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center flex-shrink-0 shadow-lg">
              <User className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-900 mb-3">
                {user.displayName || user.username}
              </p>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                onPaste={handlePaste}
                placeholder="What's happening?"
                className="w-full resize-none border-none outline-none text-lg placeholder-gray-500 min-h-[140px] bg-transparent"
                maxLength={maxLength}
                autoFocus
                disabled={isSubmitting}
              />
              {image && (
                <div className="mt-4 relative">
                  <img
                    src={image}
                    alt="Pasted image"
                    className="max-w-full max-h-64 rounded-lg border border-gray-300"
                  />
                  <button
                    onClick={() => setImage(null)}
                    className="absolute top-2 right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm hover:bg-red-600"
                  >
                    ×
                  </button>
                </div>
              )}
              {videoFile && (
                <div className="mt-4 relative">
                  <video
                    src={URL.createObjectURL(videoFile)}
                    controls
                    className="max-w-full max-h-64 rounded-lg border border-gray-300"
                  />
                  <button
                    onClick={() => setVideoFile(null)}
                    className="absolute top-2 right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm hover:bg-red-600"
                  >
                    ×
                  </button>
                  <div className="mt-2 text-sm text-gray-600">
                    Video: {videoFile.name} ({(videoFile.size / (1024 * 1024)).toFixed(1)} MB)
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Character Count & Actions */}
          <div className="flex items-center justify-between pt-4 border-t border-gray-200">
            <div className="flex items-center gap-4">
              <div className={`text-sm font-medium ${
                content.length > maxLength * 0.8 
                  ? content.length > maxLength * 0.9 
                    ? 'text-red-500' 
                    : 'text-orange-500'
                  : 'text-gray-500'
              }`}>
                {content.length}/{maxLength}
              </div>
              {content.length > maxLength * 0.8 && (
                <div 
                  className={`w-8 h-8 rounded-full border-2 relative ${
                    content.length > maxLength * 0.9 ? 'border-red-500' : 'border-orange-500'
                  }`}
                >
                  <div 
                    className={`absolute inset-0.5 rounded-full ${
                      content.length > maxLength * 0.9 ? 'bg-red-500' : 'bg-orange-500'
                    }`}
                    style={{
                      background: `conic-gradient(${
                        content.length > maxLength * 0.9 ? '#ef4444' : '#f97316'
                      } ${(content.length / maxLength) * 360}deg, transparent 0deg)`
                    }}
                  />
                </div>
              )}
              
              {/* File Upload Buttons */}
              <div className="flex gap-2">
                <label className="cursor-pointer text-blue-500 hover:text-blue-600 text-sm font-medium">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) {
                        const reader = new FileReader()
                        reader.onload = (event) => {
                          const base64 = event.target?.result as string
                          setImage(base64)
                          setVideoFile(null)
                        }
                        reader.readAsDataURL(file)
                      }
                    }}
                    className="hidden"
                  />
                  📷 Image
                </label>
                <input
                  ref={videoInputRef}
                  type="file"
                  accept="video/*"
                  onChange={(e) => {
                    console.log('Video file input changed', e.target.files)
                    const file = e.target.files?.[0]
                    if (file) {
                      console.log('Video file selected:', file.name, file.size)
                      setVideoFile(file)
                      setImage(null)
                    }
                  }}
                  className="hidden"
                />
                <button
                  type="button"
                  className="cursor-pointer text-purple-500 hover:text-purple-600 text-sm font-medium"
                  onClick={(e) => {
                    e.preventDefault()
                    console.log('Video button clicked, triggering input')
                    videoInputRef.current?.click()
                  }}
                >
                  🎥 Video
                </button>
              </div>
            </div>
            
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="btn-secondary"
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <motion.button
                type="submit"
                whileHover={{ scale: (content.trim() || image || videoFile) && !isSubmitting ? 1.05 : 1 }}
                whileTap={{ scale: (content.trim() || image || videoFile) && !isSubmitting ? 0.95 : 1 }}
                className="btn-primary flex items-center gap-2"
                disabled={!(content.trim() || image || videoFile) || isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Posting...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Post
                  </>
                )}
              </motion.button>
            </div>
          </div>
        </form>
      </motion.div>
    </motion.div>
  )
}
