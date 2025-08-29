import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Users, 
  UserPlus, 
  Check, 
  X, 
  Search, 
  Key, 
  Send,
  Wifi,
  WifiOff,
  Clock,
  Copy,
  Eye,
  EyeOff,
  Trash2
} from 'lucide-react'
import { friendService, Friend, FriendRequest } from '../services/friendService'
import { UserProfile } from '../services/pigeonSocial'
import { Messaging } from './Messaging'
import { useNotifications } from '../contexts/NotificationContext'

interface FriendsManagerProps {
  user: UserProfile
  onClose: () => void
}

export function FriendsManager({ user, onClose }: FriendsManagerProps) {
  const { showSuccess, showError } = useNotifications()
  const [activeTab, setActiveTab] = useState<'friends' | 'requests' | 'discover' | 'add'>('friends')
  const [friends, setFriends] = useState<Friend[]>([])
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([])
  const [discoveredPeers, setDiscoveredPeers] = useState<any[]>([])
  const [isDiscovering, setIsDiscovering] = useState(false)
  const [addFriendKey, setAddFriendKey] = useState('')
  const [addFriendMessage, setAddFriendMessage] = useState('')
  const [showAddFriendKey, setShowAddFriendKey] = useState(false)
  const [isConnectedToSignaling, setIsConnectedToSignaling] = useState(false)
  const [messagingFriend, setMessagingFriend] = useState<Friend | null>(null)
  const [friendToRemove, setFriendToRemove] = useState<Friend | null>(null)

  useEffect(() => {
    // Load initial data
    setFriends(friendService.getFriends())
    setFriendRequests(friendService.getPendingFriendRequests())
    setIsConnectedToSignaling(friendService.isConnectedToSignaling())

    // Set up event listeners
    friendService.on('friends:status-updated', () => {
      setFriends(friendService.getFriends())
    })

    friendService.on('friends:updated', () => {
      setFriends(friendService.getFriends())
    })

    friendService.on('friend-request:received', (_request: FriendRequest) => {
      setFriendRequests(friendService.getPendingFriendRequests())
    })

    friendService.on('friend-request:accepted', ({ friend: _friend }: { friend: Friend }) => {
      setFriends(friendService.getFriends())
      setFriendRequests(friendService.getPendingFriendRequests())
    })

    friendService.on('signaling:connected', () => {
      setIsConnectedToSignaling(true)
    })

    friendService.on('signaling:disconnected', () => {
      setIsConnectedToSignaling(false)
    })

    friendService.on('peers:discovered', (peers: any[]) => {
      setDiscoveredPeers(peers)
      setIsDiscovering(false)
    })

    return () => {
      // Cleanup event listeners would go here
    }
  }, [])

  const handleDiscoverPeers = async () => {
    setIsDiscovering(true)
    const peers = await friendService.discoverPeers()
    setDiscoveredPeers(peers)
    setIsDiscovering(false)
  }

  const handleSendFriendRequest = async (targetPublicKey: string) => {
    try {
      await friendService.sendFriendRequest(targetPublicKey, addFriendMessage || undefined)
      setAddFriendKey('')
      setAddFriendMessage('')
      showSuccess('Friend request sent!', 'Your friend request has been sent successfully.')
    } catch (error) {
      console.error('Failed to send friend request:', error)
      showError('Failed to send friend request', 'Please check the public key and try again.')
    }
  }

  const handleAcceptFriendRequest = async (requestId: string) => {
    try {
      await friendService.acceptFriendRequest(requestId)
      setFriendRequests(friendService.getPendingFriendRequests())
    } catch (error) {
      console.error('Failed to accept friend request:', error)
      showError('Failed to accept friend request', 'Please try again.')
    }
  }

  const handleRejectFriendRequest = async (requestId: string) => {
    try {
      await friendService.rejectFriendRequest(requestId)
      setFriendRequests(friendService.getPendingFriendRequests())
    } catch (error) {
      console.error('Failed to reject friend request:', error)
      showError('Failed to reject friend request', 'Please try again.')
    }
  }

  const handleRemoveFriend = (friend: Friend) => {
    setFriendToRemove(friend)
  }

  const confirmRemoveFriend = () => {
    if (friendToRemove) {
      friendService.removeFriend(friendToRemove.publicKey)
      setFriendToRemove(null)
    }
  }

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      showSuccess('Copied to clipboard!', 'The text has been copied to your clipboard.')
    } catch (error) {
      console.error('Failed to copy to clipboard:', error)
      showError('Failed to copy', 'Could not copy to clipboard. Please try again.')
    }
  }

  const tabs = [
    { id: 'friends', label: 'Friends', icon: Users, count: friends.length },
    { id: 'requests', label: 'Requests', icon: UserPlus, count: friendRequests.length },
    { id: 'discover', label: 'Discover', icon: Search, count: discoveredPeers.length },
    { id: 'add', label: 'Add Friend', icon: Key, count: 0 }
  ]

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center p-4 z-50"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="bg-slate-900/95 backdrop-blur-xl border border-slate-700/50 rounded-3xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-slate-700/50 bg-gradient-to-r from-slate-800 to-slate-900">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-white">Friends & Network</h2>
            <div className="flex items-center gap-4">
              <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium ${
                isConnectedToSignaling 
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                  : 'bg-red-500/20 text-red-400 border border-red-500/30'
              }`}>
                {isConnectedToSignaling ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
                {isConnectedToSignaling ? 'Connected' : 'Disconnected'}
              </div>
              <button
                onClick={onClose}
                className="p-2 text-slate-400 hover:text-white rounded-full hover:bg-slate-700/60 transition-all"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all ${
                  activeTab === tab.id
                    ? 'bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white shadow-sm'
                    : 'text-slate-400 hover:bg-slate-700/50 hover:text-white'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
                {tab.count > 0 && (
                  <span className="bg-white/20 text-white text-xs px-2 py-0.5 rounded-full">
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="p-6 max-h-[60vh] overflow-y-auto">
          <AnimatePresence mode="wait">
            {/* Friends Tab */}
            {activeTab === 'friends' && (
              <motion.div
                key="friends"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                {friends.length === 0 ? (
                  <div className="text-center py-12">
                    <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-gray-700 mb-2">No friends yet</h3>
                    <p className="text-gray-500 mb-6">Start by discovering peers or adding friends directly</p>
                    <div className="flex gap-3 justify-center">
                      <button
                        onClick={() => setActiveTab('discover')}
                        className="btn-primary"
                      >
                        Discover Peers
                      </button>
                      <button
                        onClick={() => setActiveTab('add')}
                        className="btn-secondary"
                      >
                        Add Friend
                      </button>
                    </div>
                  </div>
                ) : (
                  friends.map((friend) => (
                    <motion.div
                      key={friend.publicKey}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-all"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                            <Users className="w-6 h-6 text-white" />
                          </div>
                          <div>
                            <h4 className="font-semibold text-gray-900">
                              {friend.userInfo.displayName || friend.userInfo.username}
                            </h4>
                            <p className="text-sm text-gray-500">@{friend.userInfo.username}</p>
                            <div className="flex items-center gap-4 mt-1">
                              <div className={`flex items-center gap-1 text-xs ${
                                friend.connectionStatus === 'online' 
                                  ? 'text-green-600' 
                                  : 'text-gray-500'
                              }`}>
                                <div className={`w-2 h-2 rounded-full ${
                                  friend.connectionStatus === 'online' 
                                    ? 'bg-green-500' 
                                    : 'bg-gray-400'
                                }`} />
                                {friend.connectionStatus}
                              </div>
                              <span className="text-xs text-gray-400">
                                Added {new Date(friend.addedAt).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => copyToClipboard(friend.publicKey)}
                            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-all"
                            title="Copy public key"
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleRemoveFriend(friend)}
                            className="p-2 text-red-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-all"
                            title="Remove friend"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                          {friend.connectionStatus === 'online' && (
                            <button 
                              className="btn-primary text-sm"
                              onClick={() => setMessagingFriend(friend)}
                            >
                              Message
                            </button>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  ))
                )}
              </motion.div>
            )}

            {/* Friend Requests Tab */}
            {activeTab === 'requests' && (
              <motion.div
                key="requests"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                {friendRequests.length === 0 ? (
                  <div className="text-center py-12">
                    <UserPlus className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-gray-700 mb-2">No friend requests</h3>
                    <p className="text-gray-500">When someone sends you a friend request, it will appear here</p>
                  </div>
                ) : (
                  friendRequests.map((request) => (
                    <motion.div
                      key={request.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-white rounded-xl p-4 shadow-sm border border-gray-100"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-gradient-to-r from-green-500 to-blue-600 rounded-full flex items-center justify-center">
                            <UserPlus className="w-6 h-6 text-white" />
                          </div>
                          <div>
                            <h4 className="font-semibold text-gray-900">
                              {request.fromUserInfo.displayName || request.fromUserInfo.username}
                            </h4>
                            <p className="text-sm text-gray-500">@{request.fromUserInfo.username}</p>
                            {request.message && (
                              <p className="text-sm text-gray-600 mt-1 italic">"{request.message}"</p>
                            )}
                            <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
                              <Clock className="w-3 h-3" />
                              {new Date(request.timestamp).toLocaleString()}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleRejectFriendRequest(request.id)}
                            className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-all"
                            title="Reject request"
                          >
                            <X className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => handleAcceptFriendRequest(request.id)}
                            className="p-2 text-green-500 hover:text-green-700 hover:bg-green-50 rounded-lg transition-all"
                            title="Accept request"
                          >
                            <Check className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  ))
                )}
              </motion.div>
            )}

            {/* Discover Tab */}
            {activeTab === 'discover' && (
              <motion.div
                key="discover"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Discover Peers</h3>
                    <p className="text-sm text-gray-500">Find other users connected to the signaling server</p>
                  </div>
                  <button
                    onClick={handleDiscoverPeers}
                    disabled={!isConnectedToSignaling || isDiscovering}
                    className="btn-primary flex items-center gap-2"
                  >
                    {isDiscovering ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Discovering...
                      </>
                    ) : (
                      <>
                        <Search className="w-4 h-4" />
                        Discover
                      </>
                    )}
                  </button>
                </div>

                {discoveredPeers.length === 0 ? (
                  <div className="text-center py-12">
                    <Search className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-gray-700 mb-2">No peers discovered</h3>
                    <p className="text-gray-500 mb-6">
                      {isConnectedToSignaling 
                        ? 'Click "Discover" to find peers on the network'
                        : 'Connect to the signaling server to discover peers'
                      }
                    </p>
                  </div>
                ) : (
                  discoveredPeers
                    .filter(peer => peer.publicKey !== user.publicKey) // Don't show self
                    .filter(peer => !friendService.isFriend(peer.publicKey)) // Don't show existing friends
                    .map((peer) => (
                      <motion.div
                        key={peer.publicKey}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-all"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-gradient-to-r from-purple-500 to-pink-600 rounded-full flex items-center justify-center">
                              <Users className="w-6 h-6 text-white" />
                            </div>
                            <div>
                              <h4 className="font-semibold text-gray-900">
                                {peer.userInfo?.displayName || peer.userInfo?.username || 'Unknown User'}
                              </h4>
                              {peer.userInfo?.username && (
                                <p className="text-sm text-gray-500">@{peer.userInfo.username}</p>
                              )}
                              <div className="flex items-center gap-2 mt-1 text-xs text-gray-400">
                                <div className="w-2 h-2 bg-green-500 rounded-full" />
                                Online now
                              </div>
                            </div>
                          </div>
                          <button
                            onClick={() => handleSendFriendRequest(peer.publicKey)}
                            className="btn-primary text-sm flex items-center gap-2"
                          >
                            <UserPlus className="w-4 h-4" />
                            Add Friend
                          </button>
                        </div>
                      </motion.div>
                    ))
                )}
              </motion.div>
            )}

            {/* Add Friend Tab */}
            {activeTab === 'add' && (
              <motion.div
                key="add"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Add Friend by Public Key</h3>
                  <p className="text-sm text-gray-500 mb-6">
                    Enter a friend's public key to send them a friend request
                  </p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Friend's Public Key
                    </label>
                    <div className="relative">
                      <input
                        type={showAddFriendKey ? 'text' : 'password'}
                        value={addFriendKey}
                        onChange={(e) => setAddFriendKey(e.target.value)}
                        placeholder="Enter public key..."
                        className="input w-full pr-12"
                      />
                      <button
                        type="button"
                        onClick={() => setShowAddFriendKey(!showAddFriendKey)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showAddFriendKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Message (optional)
                    </label>
                    <textarea
                      value={addFriendMessage}
                      onChange={(e) => setAddFriendMessage(e.target.value)}
                      placeholder="Hi! I'd like to connect with you on PigeonSocial."
                      className="input w-full h-24 resize-none"
                      maxLength={200}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      {addFriendMessage.length}/200 characters
                    </p>
                  </div>

                  <button
                    onClick={() => handleSendFriendRequest(addFriendKey)}
                    disabled={!addFriendKey.trim() || !isConnectedToSignaling}
                    className="btn-primary w-full flex items-center justify-center gap-2"
                  >
                    <Send className="w-4 h-4" />
                    Send Friend Request
                  </button>
                </div>

                <div className="mt-8 p-4 bg-blue-50 rounded-xl">
                  <h4 className="font-semibold text-blue-900 mb-2">Your Public Key</h4>
                  <p className="text-sm text-blue-700 mb-3">
                    Share this key with others so they can add you as a friend:
                  </p>
                  <div className="bg-white p-3 rounded-lg border border-blue-200 font-mono text-sm break-all">
                    {user.publicKey}
                  </div>
                  <button
                    onClick={() => copyToClipboard(user.publicKey)}
                    className="btn-secondary w-full mt-3 flex items-center justify-center gap-2"
                  >
                    <Copy className="w-4 h-4" />
                    Copy Your Public Key
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
      
      {/* Messaging Modal */}
      {messagingFriend && (
        <Messaging
          user={user}
          friend={messagingFriend}
          onClose={() => setMessagingFriend(null)}
        />
      )}

      {/* Remove Friend Confirmation Dialog */}
      {friendToRemove && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-xl p-6 max-w-md w-full mx-4"
          >
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Remove Friend</h3>
            <p className="text-gray-600 mb-6">
              Are you sure you want to remove <strong>{friendToRemove.userInfo.displayName || friendToRemove.userInfo.username}</strong> from your friends? 
              This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setFriendToRemove(null)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmRemoveFriend}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                Remove
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </motion.div>
  )
}
