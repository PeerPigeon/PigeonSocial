import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, X, Lock } from 'lucide-react'
import { friendService, Friend } from '../services/friendService'
import { UserProfile } from '../services/pigeonSocial'
import { useNotifications } from '../contexts/NotificationContext'

interface MessagingProps {
  user: UserProfile
  friend: Friend
  onClose: () => void
}

interface Message {
  id: string
  content: string
  image?: string // Base64 encoded image data
  timestamp: number
  fromSelf: boolean
  encrypted?: boolean
}

export function Messaging({ user, friend, onClose }: MessagingProps) {
  const { showError } = useNotifications()
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [messageImage, setMessageImage] = useState<string | null>(null)
  const [isSending, setIsSending] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when messages change
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  useEffect(() => {
    // Check initial connection status using friend's status instead of getPeerConnectionStatus
    setIsConnected(friend.connectionStatus === 'online')
    console.log('💬 Initial connection status for', friend.userInfo.username, ':', friend.connectionStatus)

    // Load message history from storage
    const loadMessageHistory = async () => {
      try {
        console.log('📜 Loading message history for', friend.userInfo.displayName)
        const chatMessages = await friendService.getMessageHistory(friend.publicKey)
        console.log('📜 Loaded', chatMessages.length, 'messages from storage')
        
        // Convert ChatMessage[] to Message[]
        const uiMessages: Message[] = chatMessages.map(msg => ({
          id: msg.id,
          content: typeof msg.content === 'string' ? msg.content : '[Encrypted Message]',
          image: msg.image,
          timestamp: msg.timestamp,
          fromSelf: msg.fromPublicKey === user.publicKey,
          encrypted: msg.encrypted || false
        }))
        
        setMessages(uiMessages)
        console.log('📜 Set', uiMessages.length, 'messages in UI')
      } catch (error) {
        console.error('❌ Failed to load message history:', error)
      }
    }
    
    loadMessageHistory()

    // Listen for incoming messages
    const handleMessage = ({ fromPublicKey, message }: any) => {
      if (fromPublicKey === friend.publicKey) {
        const newMsg: Message = {
          id: crypto.randomUUID(),
          content: message.content || message.data,
          image: message.image,
          timestamp: message.timestamp || Date.now(),
          fromSelf: false,
          encrypted: message.encrypted
        }
        setMessages(prev => [...prev, newMsg])
      }
    }

    // Listen for friend status changes
    const handleFriendsStatusUpdated = () => {
      // Check if this friend's status changed
      const updatedFriends = friendService.getFriends()
      const updatedFriend = updatedFriends.find(f => f.publicKey === friend.publicKey)
      if (updatedFriend) {
        const isOnline = updatedFriend.connectionStatus === 'online'
        console.log('💬 Friend status updated:', friend.userInfo.username, 'is', isOnline ? 'online' : 'offline')
        setIsConnected(isOnline)
      }
    }

    // Listen for missed messages being received
    const handleMissedMessages = async () => {
      console.log('📥 Received missed messages, reloading conversation')
      // Reload message history to include the missed messages
      await loadMessageHistory()
    }

    friendService.on('peer:message', handleMessage)
    friendService.on('friends:status-updated', handleFriendsStatusUpdated)
    friendService.on('messages:missed-received', handleMissedMessages)

    // Cleanup
    return () => {
      friendService.off('peer:message', handleMessage)
      friendService.off('friends:status-updated', handleFriendsStatusUpdated)
      friendService.off('messages:missed-received', handleMissedMessages)
    }
  }, [friend.publicKey, friend.userInfo.username])

  const handleSendMessage = async () => {
    if (!newMessage.trim() && !messageImage || isSending) return

    setIsSending(true)
    
    try {
      const message = newMessage.trim()
      
      // Add message to UI immediately
      const newMsg: Message = {
        id: crypto.randomUUID(),
        content: message,
        image: messageImage || undefined,
        timestamp: Date.now(),
        fromSelf: true
      }
      setMessages(prev => [...prev, newMsg])
      
      // Send message (this will queue it if friend is offline)
      const success = await friendService.sendMessageToFriend(friend.publicKey, message, messageImage || undefined)
      
      if (!success && !isConnected) {
        // Message was queued for offline delivery - show a subtle indicator
        console.log('📤 Message queued for delivery when friend comes online')
      }
      
      setNewMessage('')
      setMessageImage(null)
    } catch (error) {
      console.error('Failed to send message:', error)
      showError('Failed to send message', 'Please try again.')
    } finally {
      setIsSending(false)
    }
  }

  const handleMessagePaste = async (e: React.ClipboardEvent) => {
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
            setMessageImage(base64)
          }
          reader.readAsDataURL(file)
        }
        break
      }
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center p-4 z-50"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ opacity: 0, y: 50, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 50, scale: 0.95 }}
        className="bg-slate-900/95 backdrop-blur-xl border border-slate-700/50 shadow-2xl rounded-2xl w-full max-w-lg h-[600px] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 bg-gradient-to-r from-slate-800 to-slate-900 border-b border-slate-700/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-lg">
                {friend.userInfo.displayName.charAt(0).toUpperCase()}
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">{friend.userInfo.displayName}</h2>
                <p className="text-slate-300 text-sm">@{friend.userInfo.username}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg p-2 transition-all duration-200"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          
          {/* Connection Status */}
          <div className="mt-4 flex items-center gap-2">
            <Lock className="w-4 h-4 text-emerald-400" />
            <span className="text-sm text-emerald-400 font-medium">End-to-end encrypted</span>
          </div>
          
          <div className="mt-3 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
            <p className="text-sm text-emerald-200">
              <strong className="text-emerald-100">Secure conversation</strong><br />
              Your messages are encrypted end-to-end and sent directly peer-to-peer
            </p>
          </div>
          
          {!isConnected && (
            <div className="mt-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
              <p className="text-sm text-amber-200">
                <strong className="text-amber-100">Not connected to {friend.userInfo.displayName}</strong><br />
                Make sure you're both online and connected to the signaling server
              </p>
            </div>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 p-4 bg-slate-950/50 overflow-y-auto">
          <AnimatePresence>
            {messages.map((message) => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className={`mb-4 flex ${message.fromSelf ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-xs lg:max-w-md px-4 py-3 rounded-2xl shadow-lg ${
                  message.fromSelf 
                    ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white' 
                    : 'bg-slate-700 text-slate-100 border border-slate-600'
                }`}>
                  {message.image && (
                    <img
                      src={message.image}
                      alt="Message image"
                      className="max-w-full max-h-48 rounded mb-2 border border-slate-500"
                    />
                  )}
                  <p className="text-sm leading-relaxed">
                    {typeof message.content === 'string' 
                      ? message.content 
                      : message.encrypted 
                        ? '[Encrypted Message]' 
                        : JSON.stringify(message.content)
                    }
                  </p>
                  <p className={`text-xs mt-2 ${
                    message.fromSelf ? 'text-indigo-100' : 'text-slate-400'
                  }`}>
                    {new Date(message.timestamp).toLocaleTimeString()}
                  </p>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          
          {/* Auto-scroll target */}
          <div ref={messagesEndRef} />
          
          {messages.length === 0 && (
            <div className="text-center text-slate-400 mt-8">
              <div className="w-16 h-16 mx-auto mb-4 bg-slate-800 rounded-full flex items-center justify-center">
                <Send className="w-8 h-8 text-slate-500" />
              </div>
              <p className="text-lg font-medium">No messages yet</p>
              <p className="text-sm text-slate-500 mt-1">Start the conversation!</p>
            </div>
          )}
        </div>

        {/* Message Input */}
        <div className="p-4 bg-slate-800 border-t border-slate-700/50">
          {messageImage && (
            <div className="mb-3 relative">
              <img
                src={messageImage}
                alt="Message image"
                className="max-w-full max-h-32 rounded border border-slate-600"
              />
              <button
                onClick={() => setMessageImage(null)}
                className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-red-600"
              >
                ×
              </button>
            </div>
          )}
          <div className="flex gap-3">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onPaste={handleMessagePaste}
              onKeyPress={handleKeyPress}
              placeholder={isConnected ? "Type a message..." : "Type a message (will be delivered when online)..."}
              disabled={isSending}
              className="flex-1 bg-slate-700 border border-slate-600 rounded-xl px-4 py-3 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            />
            <button
              onClick={handleSendMessage}
              disabled={!(newMessage.trim() || messageImage) || isSending}
              className="bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white rounded-xl px-4 py-3 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-xl flex items-center justify-center min-w-[50px]"
            >
              {isSending ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}
