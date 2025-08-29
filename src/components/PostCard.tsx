import { motion } from 'framer-motion'
import { Heart, MessageCircle, Share, User } from 'lucide-react'
import { Post, UserProfile } from '../services/pigeonSocial'

interface PostCardProps {
  post: Post
  author: UserProfile
  onLike: () => void
}

export function PostCard({ post, author, onLike }: PostCardProps) {
  const formatTimestamp = (timestamp: number) => {
    const now = Date.now()
    const diff = now - timestamp
    const minutes = Math.floor(diff / (1000 * 60))
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))

    if (minutes < 60) {
      return `${minutes}m`
    } else if (hours < 24) {
      return `${hours}h`
    } else {
      return `${days}d`
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="card p-6 hover:shadow-xl transition-all duration-300 group"
    >
      {/* Post Header */}
      <div className="flex items-center gap-4 mb-6">
        <motion.div 
          whileHover={{ scale: 1.1 }}
          className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center shadow-lg"
        >
          <User className="w-6 h-6 text-white" />
        </motion.div>
        <div className="flex-1">
          <h3 className="font-bold text-gray-900 text-lg">
            {author.displayName || author.username}
          </h3>
          <p className="text-sm text-gray-500">
            @{author.username} · {formatTimestamp(post.timestamp)}
          </p>
        </div>
      </div>

      {/* Post Content */}
      <div className="mb-6">
        <p className="text-gray-900 leading-relaxed whitespace-pre-wrap text-lg">
          {post.content}
        </p>
      </div>

      {/* Post Actions */}
      <div className="flex items-center gap-8 text-gray-500 pt-4 border-t border-gray-100">
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={onLike}
          className="flex items-center gap-3 hover:text-red-500 transition-colors group/like"
        >
          <div className="p-2 rounded-full group-hover/like:bg-red-50 transition-colors">
            <Heart className="w-5 h-5" />
          </div>
          <span className="text-sm font-medium">{post.likes}</span>
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          className="flex items-center gap-3 hover:text-blue-500 transition-colors group/reply"
        >
          <div className="p-2 rounded-full group-hover/reply:bg-blue-50 transition-colors">
            <MessageCircle className="w-5 h-5" />
          </div>
          <span className="text-sm font-medium">{post.replies}</span>
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          className="flex items-center gap-3 hover:text-green-500 transition-colors group/share"
        >
          <div className="p-2 rounded-full group-hover/share:bg-green-50 transition-colors">
            <Share className="w-5 h-5" />
          </div>
        </motion.button>
      </div>
    </motion.div>
  )
}
