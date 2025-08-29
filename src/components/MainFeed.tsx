import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, MessageCircle, User, Settings, LogOut, Copy, Check, Users } from 'lucide-react'
import { pigeonSocial, UserProfile, Post } from '../services/pigeonSocial'
import { PostCard } from './PostCard'
import { CreatePost } from './CreatePost'
import { FriendsManager } from './FriendsManager'
import { friendService } from '../services/friendService'
import pigeonLogo from '../assets/pigeonlogo.jpg'

interface MainFeedProps {
  user: UserProfile
  onLogout: () => void
}

export function MainFeed({ user, onLogout }: MainFeedProps) {
  const [posts, setPosts] = useState<Post[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showCreatePost, setShowCreatePost] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showFriends, setShowFriends] = useState(false)
  const [copiedPublicKey, setCopiedPublicKey] = useState(false)

  useEffect(() => {
    loadFeed()
    
    // Listen for shared posts from friends
    const handleSharedPost = ({ post, sharedBy }: any) => {
      console.log('📥 MainFeed received shared post from:', sharedBy.userInfo.username)
      
      // Add shared post to feed with metadata
      const sharedPost = {
        ...post,
        id: `shared_${post.id}_${Date.now()}`, // Create unique ID for shared post
        sharedBy: sharedBy.userInfo.username,
        originalAuthor: post.author
      }
      
      setPosts(prevPosts => [sharedPost, ...prevPosts])
    }
    
    friendService.on('post:shared', handleSharedPost)
    
    // Cleanup
    return () => {
      // Remove event listener on unmount
      friendService.off('post:shared', handleSharedPost)
    }
  }, [])

  const loadFeed = async () => {
    try {
      const feedPosts = await pigeonSocial.getFeed()
      setPosts(feedPosts)
    } catch (error) {
      console.error('Failed to load feed:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handlePostCreated = (newPost: Post) => {
    setPosts(prevPosts => [newPost, ...prevPosts])
    setShowCreatePost(false)
  }

  const handleLike = async (postId: string) => {
    try {
      await pigeonSocial.likePost(postId)
      setPosts(prevPosts => 
        prevPosts.map(post => 
          post.id === postId 
            ? { ...post, likes: post.likes + 1 }
            : post
        )
      )
    } catch (error) {
      console.error('Failed to like post:', error)
    }
  }

  const handleCopyPublicKey = async () => {
    try {
      await navigator.clipboard.writeText(user.publicKey)
      setCopiedPublicKey(true)
      setTimeout(() => setCopiedPublicKey(false), 2000)
    } catch (error) {
      console.error('Failed to copy public key:', error)
    }
  }

  const handleLogout = async () => {
    try {
      await pigeonSocial.logout()
      onLogout()
    } catch (error) {
      console.error('Failed to logout:', error)
    }
  }

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header */}
      <header className="bg-slate-800/80 backdrop-blur-xl border-b border-slate-700/50 sticky top-0 z-10 shadow-xl">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center"
          >
            <img 
              src={pigeonLogo} 
              alt="PigeonSocial" 
              className="h-8 w-8 rounded-lg shadow-sm"
            />
          </motion.div>
          <div className="flex items-center gap-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 }}
              className="flex items-center gap-3 bg-slate-700/60 rounded-full px-4 py-2 shadow-sm"
            >
              <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 rounded-full flex items-center justify-center shadow-sm">
                <User className="w-4 h-4 text-white" />
              </div>
              <span className="text-sm font-semibold text-white">
                {user.displayName || user.username}
              </span>
            </motion.div>
            <motion.button 
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => setShowFriends(true)}
              className="p-2 text-slate-400 hover:text-white rounded-full hover:bg-slate-600/60 transition-all"
              title="Friends & Network"
            >
              <Users className="w-5 h-5" />
            </motion.button>
            <motion.button 
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => setShowSettings(true)}
              className="p-2 text-slate-400 hover:text-white rounded-full hover:bg-slate-600/60 transition-all"
            >
              <Settings className="w-5 h-5" />
            </motion.button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-2xl mx-auto px-4 py-8">
        {/* Create Post Button */}
        <motion.button
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => setShowCreatePost(true)}
          className="w-full bg-slate-800/50 backdrop-blur-xl border border-slate-700/50 rounded-xl p-6 text-left hover:bg-slate-700/50 transition-all duration-300 mb-8 group shadow-xl"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 rounded-full flex items-center justify-center shadow-lg">
              <User className="w-6 h-6 text-white" />
            </div>
            <span className="text-slate-400 group-hover:text-slate-300 transition-colors text-lg">
              What's on your mind?
            </span>
          </div>
        </motion.button>

        {/* Posts Feed */}
        <div className="space-y-6">
          {isLoading ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-12"
            >
              <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-6" />
              <p className="text-slate-400 text-lg">Loading your feed...</p>
            </motion.div>
          ) : posts.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center py-16 bg-slate-800/50 backdrop-blur-xl border border-slate-700/50 rounded-xl shadow-xl"
            >
              <div className="w-20 h-20 bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg">
                <MessageCircle className="w-10 h-10 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-4">No posts yet</h3>
              <p className="text-slate-400 mb-8 text-lg">Be the first to share something amazing!</p>
              <button
                onClick={() => setShowCreatePost(true)}
                className="px-6 py-3 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white rounded-lg hover:from-indigo-600 hover:via-purple-600 hover:to-pink-600 transition-all duration-200 font-medium text-lg"
              >
                ✨ Create your first post
              </button>
            </motion.div>
          ) : (
            <AnimatePresence>
              {posts.map((post, index) => (
                <motion.div
                  key={post.id}
                  initial={{ opacity: 0, y: 50 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -50 }}
                  transition={{ delay: index * 0.1 }}
                >
                  <PostCard
                    post={post}
                    author={user}
                    onLike={() => handleLike(post.id)}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>
      </main>

      {/* Floating Action Button */}
      <motion.button
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.5, type: "spring", stiffness: 200 }}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={() => setShowCreatePost(true)}
        className="fixed bottom-8 right-8 w-16 h-16 bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 hover:from-indigo-600 hover:via-purple-600 hover:to-pink-600 text-white rounded-full shadow-2xl flex items-center justify-center z-20 transition-all duration-300"
      >
        <Plus className="w-8 h-8" />
      </motion.button>

      {/* Create Post Modal */}
      <AnimatePresence>
        {showCreatePost && (
          <CreatePost
            user={user}
            onClose={() => setShowCreatePost(false)}
            onPostCreated={handlePostCreated}
          />
        )}
      </AnimatePresence>

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-50 p-4"
            onClick={() => setShowSettings(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 500 }}
              className="bg-slate-900/95 backdrop-blur-xl border border-slate-700/50 rounded-3xl shadow-2xl max-w-md w-full p-8"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-center mb-8">
                <div className="w-20 h-20 bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
                  <User className="w-10 h-10 text-white" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">
                  {user.displayName || user.username}
                </h2>
                <p className="text-slate-400">@{user.username}</p>
              </div>

              {/* Public Key Section */}
              <div className="mb-8">
                <h3 className="text-lg font-semibold text-white mb-4">Your Public Key</h3>
                <p className="text-sm text-slate-400 mb-4">
                  Share this with others so they can find and connect with you on the network.
                </p>
                <div className="bg-slate-800/50 rounded-xl p-4 mb-4 border border-slate-700/50">
                  <code className="text-sm text-slate-300 break-all font-mono">
                    {user.publicKey}
                  </code>
                </div>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleCopyPublicKey}
                  className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600/50 text-slate-300 rounded-lg hover:bg-slate-600/50 transition-all duration-200 flex items-center justify-center gap-2"
                >
                  {copiedPublicKey ? (
                    <>
                      <Check className="w-4 h-4" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      Copy Public Key
                    </>
                  )}
                </motion.button>
              </div>

              {/* Actions */}
              <div className="space-y-3">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleLogout}
                  className="w-full px-4 py-3 bg-red-600/20 border border-red-500/30 text-red-400 rounded-lg hover:bg-red-600/30 transition-all duration-200 flex items-center justify-center gap-2"
                >
                  <LogOut className="w-4 h-4" />
                  Logout
                </motion.button>
                
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setShowSettings(false)}
                  className="w-full px-4 py-3 text-slate-400 hover:text-white transition-colors"
                >
                  Close
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Friends Manager Modal */}
      <AnimatePresence>
        {showFriends && (
          <FriendsManager
            user={user}
            onClose={() => setShowFriends(false)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
