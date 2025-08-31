import { motion } from 'framer-motion'
import { Heart, MessageCircle, Share, User, UserPlus, Info } from 'lucide-react'
import { Post, UserProfile } from '../services/pigeonSocial'
import { friendService } from '../services/friendService'
import { useState } from 'react'

interface PostCardProps {
  post: Post & { 
    sharedBy?: string
    originalAuthor?: string 
  }
  author: UserProfile
  currentUser: UserProfile
  onLike: () => void
}

export function PostCard({ post, author, currentUser, onLike }: PostCardProps) {
  const [showInfo, setShowInfo] = useState(false)
  
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

  const isOwnPost = author.publicKey === currentUser.publicKey
  const isFriend = friendService.isFriend(author.publicKey)
  const isFollowing = friendService.isFollowing(author.publicKey)
  
  const handleFollow = async () => {
    try {
      await friendService.followUser(author.publicKey, {
        username: author.username,
        displayName: author.displayName || author.username
      })
    } catch (error) {
      console.error('Failed to follow user:', error)
    }
  }

  const handleUnfollow = () => {
    friendService.unfollowUser(author.publicKey)
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
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-gray-900 text-lg">
              {author.displayName || author.username}
            </h3>
            <div className="relative">
              <motion.button
                whileHover={{ scale: 1.1 }}
                onMouseEnter={() => setShowInfo(true)}
                onMouseLeave={() => setShowInfo(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <Info className="w-4 h-4" />
              </motion.button>
              {showInfo && (
                <div className="absolute top-6 left-0 z-10 bg-black text-white text-xs rounded px-2 py-1 whitespace-nowrap max-w-xs">
                  <div>Author: {author.publicKey}</div>
                  {post.sharedBy && <div>Shared by: {post.sharedBy}</div>}
                </div>
              )}
            </div>
          </div>
          <p className="text-sm text-gray-500">
            @{author.displayName || author.username} · {formatTimestamp(post.timestamp)}
          </p>
          {post.sharedBy && (
            <p className="text-xs text-blue-500 mt-1">
              Shared by {post.sharedBy}
            </p>
          )}
        </div>
        {!isOwnPost && !isFriend && (
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={isFollowing ? handleUnfollow : handleFollow}
            className={`px-3 py-1 rounded-full text-sm font-medium transition-colors flex items-center gap-1 ${
              isFollowing
                ? 'bg-pink-100 text-pink-600 hover:bg-pink-200'
                : 'bg-blue-100 text-blue-600 hover:bg-blue-200'
            }`}
          >
            {isFollowing ? (
              <>
                <Heart className="w-3 h-3 fill-current" />
                Following
              </>
            ) : (
              <>
                <UserPlus className="w-3 h-3" />
                Follow
              </>
            )}
          </motion.button>
        )}
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
