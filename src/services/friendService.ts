import { PeerPigeonMesh } from '../lib/peerpigeon-browser'
import { pigeonSocial } from './pigeonSocial'
import { config } from '../config'
import { encryptMessageWithMeta, decryptMessageWithMeta } from 'unsea'

export interface Friend {
  publicKey: string
  userInfo: {
    username: string
    displayName: string
    publicKey?: string  // Add the public key to userInfo
    epub?: string      // Add epub for encryption
  }
  connectionStatus: 'online' | 'offline' | 'connecting'
  addedAt: number
  lastSeen?: Date
}

export interface ChatMessage {
  id: string
  content: string | { ciphertext: string; iv: string; [key: string]: any } // Allow encrypted content objects
  timestamp: number
  fromPublicKey: string
  toPublicKey: string
  encrypted?: boolean
}

export interface FriendRequest {
  id: string
  from: string
  publicKey: string
  fromUserInfo: {
    username: string
    displayName?: string
  }
  message?: string
  timestamp: Date
  encryptedInvite?: string
}

export class FriendService {
  private static instance: FriendService
  private mesh: PeerPigeonMesh | null = null
  private friends: Friend[] = []
  private friendRequests: FriendRequest[] = []
  private pendingRequests: Set<string> = new Set()
  private eventListeners = new Map<string, Function[]>()
  private isInitialized = false
  
  // Map of publicKey -> actual PeerPigeon peer ID
  private peerIdMap = new Map<string, string>()
  
  // Connection monitoring
  private connectionMonitors = new Map<string, NodeJS.Timeout>() // Track monitoring intervals
  private lastPingSent = new Map<string, number>() // Track last ping times
  private lastPingReceived = new Map<string, number>() // Track last pong times
  private lastPongSent = new Map<string, number>() // Track last pong responses to rate limit
  private cleanupInterval: NodeJS.Timeout | null = null // Periodic cleanup
  private monitoringEnabled = true // Allow disabling monitoring if needed

  private constructor() {
    // Constructor is now clean since we use UnSea functions directly
  }

  static getInstance(): FriendService {
    if (!FriendService.instance) {
      FriendService.instance = new FriendService()
    }
    return FriendService.instance
  }

  async initialize() {
    if (this.isInitialized) {
      console.log('🔄 Friend service already initialized')
      return
    }

    // Load persisted friends and requests
    this.loadPersistedData()

    try {
      const currentUser = await pigeonSocial.getCurrentUser()
      if (!currentUser) {
        console.log('❌ Cannot initialize friend service - no current user')
        return
      }

      // Create PeerPigeon mesh with autodiscovery
      this.mesh = new PeerPigeonMesh({
        peerId: currentUser.publicKey.substring(0, 40), // Use first 40 chars of public key as peerId
        enableWebDHT: true,
        enableCrypto: false // We'll handle our own encryption
      })

      // Set up mesh event handlers
      this.setupMeshEventHandlers()

      // Initialize the mesh
      await this.mesh.init()

      // Connect to signaling server (this enables autodiscovery)
      await this.mesh.connect(config.signaling.serverUrl)

      this.isInitialized = true
      console.log('✅ Friend service initialized with PeerPigeon mesh')
      
      // Reset all friend connection statuses on initialization
      this.resetAllFriendStatuses()
      
      this.emit('initialized')

      // Add error handler for PeerPigeon internal errors
      window.addEventListener('error', (event) => {
        if (event.error?.message?.includes('_peerPigeonOrigin')) {
          console.warn('🔧 PeerPigeon internal error (non-critical):', event.error.message)
          event.preventDefault() // Prevent the error from breaking the app
        }
      })

    } catch (error) {
      console.error('❌ Failed to initialize friend service:', error)
      throw error
    }
  }

  private loadPersistedData() {
    try {
      // Load friends from localStorage
      const savedFriends = localStorage.getItem('pigeon_friends')
      if (savedFriends) {
        this.friends = JSON.parse(savedFriends)
        console.log('📋 Loaded', this.friends.length, 'friends from storage')
      }

      // Load friend requests from localStorage
      const savedRequests = localStorage.getItem('pigeon_friend_requests')
      if (savedRequests) {
        this.friendRequests = JSON.parse(savedRequests).map((req: any) => ({
          ...req,
          timestamp: new Date(req.timestamp)
        }))
        console.log('📋 Loaded', this.friendRequests.length, 'friend requests from storage')
      }
    } catch (error) {
      console.error('❌ Failed to load persisted data:', error)
    }
  }

  private persistFriends() {
    try {
      localStorage.setItem('pigeon_friends', JSON.stringify(this.friends))
    } catch (error) {
      console.error('❌ Failed to persist friends:', error)
    }
  }

  private persistFriendRequests() {
    try {
      localStorage.setItem('pigeon_friend_requests', JSON.stringify(this.friendRequests))
    } catch (error) {
      console.error('❌ Failed to persist friend requests:', error)
    }
  }

  // Utility function to clear corrupted or problematic messages
  async clearMessagesForFriend(friendPublicKey: string): Promise<void> {
    try {
      const currentUser = await pigeonSocial.getCurrentUser()
      if (!currentUser) return

      // Clear messages in both directions
      await this.clearMessagesBetween(currentUser.publicKey, friendPublicKey)
      await this.clearMessagesBetween(friendPublicKey, currentUser.publicKey)
      
      console.log('🧹 Cleared all messages for friend:', friendPublicKey.substring(0, 8) + '...')
    } catch (error) {
      console.error('❌ Failed to clear messages for friend:', error)
    }
  }

  private async clearMessagesBetween(fromPublicKey: string, toPublicKey: string): Promise<void> {
    try {
      // Get the message index first
      const messageIds = await pigeonSocial.getData(`messageIndex.${fromPublicKey}.${toPublicKey}`) || []
      
      // Delete each message by storing null
      for (const messageId of messageIds) {
        const messageKey = `messages.${fromPublicKey}.${toPublicKey}.${messageId}`
        await pigeonSocial.storeData(messageKey, null)
      }
      
      // Clear the message index by storing empty array
      await pigeonSocial.storeData(`messageIndex.${fromPublicKey}.${toPublicKey}`, [])
      
      console.log(`🧹 Cleared ${messageIds.length} messages between ${fromPublicKey.substring(0, 8)}... and ${toPublicKey.substring(0, 8)}...`)
    } catch (error) {
      console.error('❌ Failed to clear messages between users:', error)
    }
  }

  // Message storage methods using PeerPigeon's distributed storage
  async saveMessage(message: ChatMessage): Promise<void> {
    try {
      const messageKey = `messages.${message.fromPublicKey}.${message.toPublicKey}.${message.id}`
      await pigeonSocial.storeData(messageKey, message)
      await this.updateMessageIndex(message.fromPublicKey, message.toPublicKey, message.id)
      console.log('💾 Saved message to distributed storage:', message.id)
    } catch (error) {
      console.error('❌ Failed to save message:', error)
    }
  }

  async getMessagesForFriend(friendPublicKey: string, currentUserPublicKey: string): Promise<ChatMessage[]> {
    try {
      // Get messages in both directions
      const sentMessages = await this.getMessagesBetween(currentUserPublicKey, friendPublicKey)
      const receivedMessages = await this.getMessagesBetween(friendPublicKey, currentUserPublicKey)
      
      // Combine and sort by timestamp
      const allMessages = [...sentMessages, ...receivedMessages]
      const sortedMessages = allMessages.sort((a, b) => a.timestamp - b.timestamp)
      
      console.log('📥 Processing stored messages:', {
        total: sortedMessages.length,
        encrypted: sortedMessages.filter(m => m.encrypted).length
      })
      
      // Decrypt messages for display
      const decryptedMessages = await Promise.all(sortedMessages.map(async (message, index) => {
        // Check if message is marked as encrypted and has proper encrypted structure
        if (message.encrypted && typeof message.content === 'object' && message.content && (message.content as any).ciphertext) {
          try {
            // Get current user's UnSea keypair for decryption
            const currentUserKeypair = await pigeonSocial.getCurrentUserUnSeaKeypair()
            if (currentUserKeypair) {
              const decryptedContent = await decryptMessageWithMeta(message.content as any, currentUserKeypair.epriv)
              return {
                ...message,
                content: decryptedContent // Replace encrypted content with decrypted for display
              }
            } else {
              return {
                ...message,
                content: '[Encrypted Message - Cannot Decrypt]'
              }
            }
          } catch (error) {
            console.error(`❌ Failed to decrypt message ${index + 1}:`, {
              messageId: message.id,
              error: (error as Error).message
            })
            return {
              ...message,
              content: '[Encrypted Message - Decryption Failed]'
            }
          }
        } else if (message.encrypted && typeof message.content !== 'object') {
          // Handle legacy messages that are marked as encrypted but stored as plaintext
          return {
            ...message,
            content: message.content // Return as-is since it's actually plaintext
          }
        }
        return message // Return unencrypted messages as-is
      }))
      
      return decryptedMessages
    } catch (error) {
      console.error('❌ Failed to get messages for friend:', error)
      return []
    }
  }

  private async getMessagesBetween(fromPublicKey: string, toPublicKey: string): Promise<ChatMessage[]> {
    try {
      // This is a simplified approach - in a real implementation, you'd want to
      // maintain an index of message keys for better performance
      const messagePrefix = `messages.${fromPublicKey}.${toPublicKey}.`
      
      // For now, we'll store a message index as well
      const messageIds = await pigeonSocial.getData(`messageIndex.${fromPublicKey}.${toPublicKey}`) || []
      
      const messages: ChatMessage[] = []
      for (const messageId of messageIds) {
        const messageKey = `${messagePrefix}${messageId}`
        const message = await pigeonSocial.getData(messageKey)
        if (message) {
          messages.push(message)
        }
      }
      
      return messages
    } catch (error) {
      console.error('❌ Failed to get messages between users:', error)
      return []
    }
  }

  private async updateMessageIndex(fromPublicKey: string, toPublicKey: string, messageId: string): Promise<void> {
    try {
      const indexKey = `messageIndex.${fromPublicKey}.${toPublicKey}`
      const existingIds = await pigeonSocial.getData(indexKey) || []
      
      if (!existingIds.includes(messageId)) {
        existingIds.push(messageId)
        await pigeonSocial.storeData(indexKey, existingIds)
      }
    } catch (error) {
      console.error('❌ Failed to update message index:', error)
    }
  }

  private setupMeshEventHandlers() {
    if (!this.mesh) return

    console.log('🔧 Setting up PeerPigeon mesh event handlers...')

    // First, let's intercept ALL events by monkey-patching addEventListener
    const originalAddEventListener = this.mesh.addEventListener.bind(this.mesh)
    
    // Override addEventListener to log all events being registered
    this.mesh.addEventListener = function(eventName: string, callback: any) {
      return originalAddEventListener(eventName, callback)
    }

    // Also try to capture events using a global listener approach
    if ((this.mesh as any).on) {
      const originalOn = (this.mesh as any).on.bind(this.mesh)
      ;(this.mesh as any).on = function(eventName: string, callback: any) {
        console.log('🎯 Registering .on() listener for:', eventName)
        return originalOn(eventName, (data: any) => {
          console.log(`🎯 .on() EVENT FIRED: ${eventName}`, data)
          callback(data)
        })
      }
    }

    // Now set up our event listeners
    console.log('🔧 Setting up peer connection events...')
    
    // Handle peer discovery
    this.mesh.addEventListener('peerConnected', (data: any) => {
      console.log('🤝 Peer connected via peerConnected:', data)
      this.handlePeerConnected(data.peerId || data.id || data)
      this.emit('peer:connected', data.peerId || data.id || data)
    })

    this.mesh.addEventListener('peerDisconnected', (data: any) => {
      console.log('👋 Peer disconnected via peerDisconnected:', data)
      this.handlePeerDisconnected(data.peerId || data.id || data)
      this.emit('peer:disconnected', data.peerId || data.id || data)
    })

    // Try ALL possible message event names for maximum compatibility
    const messageEvents = [
      'messageReceived', 'message', 'directMessage', 'onMessage', 'data',
      'receive', 'incoming', 'chat', 'text', 'content', 'payload',
      'directmessage', 'direct-message', 'msg', 'msgReceived'
    ]
    
    console.log('🔧 Setting up message event listeners for:', messageEvents)
    
    messageEvents.forEach(eventName => {
      this.mesh!.addEventListener(eventName, (data: any) => {
        this.handleIncomingMessage(data)
      })
    })

    // Handle connection status
    this.mesh.addEventListener('connected', () => {
      console.log('🌐 Connected to PeerPigeon mesh')
      this.emit('signaling:connected')
      this.emit('mesh:connected')
    })

    this.mesh.addEventListener('disconnected', () => {
      console.log('📴 Disconnected from PeerPigeon mesh')
      this.emit('signaling:disconnected')
      this.emit('mesh:disconnected')
    })

    // Try to capture any other events by intercepting the event system
    console.log('🔧 Setting up catch-all event monitoring...')
    
    // Check if the mesh has an EventTarget-like interface
    if (this.mesh instanceof EventTarget || (this.mesh as any)._events) {
      console.log('🎯 Mesh appears to use EventTarget or EventEmitter pattern')
      
      // Try to hook into the internal event system
      const meshProto = Object.getPrototypeOf(this.mesh)
      const originalDispatch = meshProto.dispatchEvent
      if (originalDispatch) {
        meshProto.dispatchEvent = function(event: any) {
          console.log('🎯 DISPATCHED EVENT:', event.type, event)
          return originalDispatch.call(this, event)
        }
      }
    }

    console.log('✅ PeerPigeon mesh event handlers set up')
    
    // Start periodic cleanup of stale connections
    this.startPeriodicCleanup()
    
    // CRITICAL DEBUG: Add extra message listeners
    setTimeout(() => {
    // Check if peers are already connected when we set up listeners
    const currentPeers = this.getConnectedPeers()
    console.log('🔍 Peers already connected when setting up listeners:', currentPeers)

    // Manually trigger peer connected for any already-connected peers
    if (currentPeers.length > 0) {
    console.log('⚡ Manually triggering handlePeerConnected for existing peers...')
    currentPeers.forEach(peerId => {
        console.log('⚡ Triggering for peer:', peerId)
        this.handlePeerConnected(peerId)
    })
    }        
      console.log('� ADDING EXTRA DEBUG LISTENERS')
      try {
        this.mesh!.addEventListener('data', (data: any) => console.log('🚨 DATA EVENT:', data))
        this.mesh!.addEventListener('receive', (data: any) => console.log('🚨 RECEIVE EVENT:', data))
        this.mesh!.addEventListener('incoming', (data: any) => console.log('🚨 INCOMING EVENT:', data))
      } catch (e) {
        console.log('Failed to add debug listeners:', e)
      }
    }, 500)
  }

  private handlePeerConnected(peerId: string) {
    // Update connection status for this peer
    this.updatePeerConnectionStatus(peerId, 'online')
    
    // Start monitoring this peer's connection
    this.startPeerMonitoring(peerId)
    // When a peer connects, we send them our user info (including our UnSea public key)
    // The peer will respond with their user info, and we'll map them in handleUserInfo()
    this.sendUserInfoToPeer(peerId)
    
    // DON'T map peers here - wait for user info exchange to do proper mapping
    console.log('📤 Sent user info to peer, waiting for their user info to establish mapping...')
    
    // Emit peer connected event for UI
    this.emit('peer:connected', { publicKey: peerId })
  }

  private handlePeerDisconnected(peerId: string) {
    console.log('👋 Handling peer disconnection:', peerId)
    
    // Find and remove from peerIdMap
    for (const [publicKey, mappedPeerId] of this.peerIdMap.entries()) {
      if (mappedPeerId === peerId) {
        console.log(`🗑️ Removing peer mapping for ${publicKey.substring(0, 8)}...`)
        this.peerIdMap.delete(publicKey)
        
        // Update friend status to offline
        const friend = this.friends.find(f => f.publicKey === publicKey)
        if (friend) {
          friend.connectionStatus = 'offline'
          friend.lastSeen = new Date()
          this.persistFriends()
          this.emit('friends:updated', this.friends)
          this.emit('friends:status-updated')
          console.log(`✅ Friend ${friend.userInfo.displayName} marked as offline`)
        }
        break
      }
    }
    
    // Emit peer disconnected event for UI
    this.emit('peer:disconnected', { publicKey: peerId })
  }

  private async sendUserInfoToPeer(peerId: string) {
    if (!this.mesh) return

    try {
      const currentUser = await pigeonSocial.getCurrentUser()
      if (!currentUser) return

      // Get our UnSea public keys to share
      const unSeaKeypair = await pigeonSocial.getCurrentUserUnSeaKeypair()
      
      const userInfo = {
        type: 'user_info',
        publicKey: currentUser.publicKey,
        username: currentUser.username,
        displayName: currentUser.displayName,
        // Include UnSea public keys for encryption
        unSeaPub: unSeaKeypair?.pub,
        unSeaEpub: unSeaKeypair?.epub
      }

      console.log('📤 Sending user info with UnSea public keys:', {
        hasUnSeaPub: !!userInfo.unSeaPub,
        hasUnSeaEpub: !!userInfo.unSeaEpub
      })

      await this.mesh.sendDirectMessage(peerId, JSON.stringify(userInfo))
    } catch (error) {
      console.error('❌ Failed to send user info to peer:', error)
    }
  }

  private handleIncomingMessage(data: any) {
    try {
      // Try to extract the actual message content from various possible formats
      let messageContent = data.content || data.message || data.data || data
      let fromPeerId = data.from || data.peerId || data.sender || data.id
      
      // If content is a string, try to parse it as JSON
      if (typeof messageContent === 'string') {
        try {
          messageContent = JSON.parse(messageContent)
        } catch (e) {
          // If it's not JSON, maybe it's a plain text message
          messageContent = { type: 'chat_message', content: messageContent, timestamp: Date.now() }
        }
      }
      
      // Ensure we have a message type
      if (!messageContent.type) {
        messageContent = { type: 'chat_message', content: messageContent, timestamp: Date.now() }
      }

      // Only log non-ping/pong messages to reduce noise
      if (messageContent.type !== 'ping' && messageContent.type !== 'pong') {
        console.log('�', messageContent.type, 'from:', fromPeerId.substring(0, 8) + '...')
      }

      switch (messageContent.type) {
        case 'user_info':
          this.handleUserInfo(messageContent, fromPeerId)
          break
        case 'friend_request':
          this.handleFriendRequest(messageContent, fromPeerId)
          break
        case 'friend_request_response':
          this.handleFriendRequestResponse(messageContent, fromPeerId)
          break
        case 'chat_message':
          this.handleChatMessage(messageContent, fromPeerId)
          break
        case 'shared_post':
          this.handleSharedPost(messageContent, fromPeerId)
          break
        case 'ping':
          this.handlePingMessage(messageContent, fromPeerId)
          break
        case 'pong':
          this.handlePongMessage(messageContent, fromPeerId)
          break
        default:
          if (messageContent.content) {
            this.handleChatMessage(messageContent, fromPeerId)
          }
      }
    } catch (error) {
      console.error('❌ Failed to handle incoming message:', error)
    }
  }

  private handleUserInfo(message: any, fromPeerId: string) {
    console.log('👤 Received user info from:', message.username, 'publicKey:', message.publicKey.substring(0, 8) + '...')
    
    // Check if this public key matches any of our friends
    const friend = this.friends.find(f => f.publicKey === message.publicKey)
    
    if (friend) {
      console.log(`🎯 MATCHED FRIEND! ${friend.userInfo.displayName} connected with peer ID: ${fromPeerId}`)
      
      // Check if this friend was previously mapped to a different peer ID
      const oldPeerId = this.peerIdMap.get(message.publicKey)
      if (oldPeerId && oldPeerId !== fromPeerId) {
        console.log(`🔄 Friend ${friend.userInfo.displayName} switched from peer ${oldPeerId} to ${fromPeerId}`)
        // Clean up old peer monitoring
        this.stopPeerMonitoring(oldPeerId)
      }
      
      // Map the friend's public key to this peer ID (this updates existing mapping)
      this.peerIdMap.set(message.publicKey, fromPeerId)
      
      // Update friend's userInfo with the received public key and encryption key
      friend.userInfo.publicKey = message.publicKey
      if (message.epub) {
        friend.userInfo.epub = message.epub
      }
      
      // Store UnSea public keys for encryption
      if (message.unSeaPub) {
        friend.userInfo.publicKey = message.unSeaPub // Use UnSea pub as the main public key
        console.log('🔑 Stored friend\'s UnSea public key for encryption')
      }
      if (message.unSeaEpub) {
        friend.userInfo.epub = message.unSeaEpub
        console.log('🔑 Stored friend\'s UnSea epub key for encryption')
      }
      
      // Update friend status to online
      friend.connectionStatus = 'online'
      this.persistFriends()
      this.emit('friends:updated', this.friends)
      this.emit('friends:status-updated')
      
      console.log('✅ Friend mapped and status updated to online via user info exchange')
    } else {
      console.log('❌ User info from unknown peer:', message.username)
    }
    
    // Update peer info in discovered peers
    this.emit('peer:info_received', {
      peerId: fromPeerId,
      publicKey: message.publicKey,
      username: message.username,
      displayName: message.displayName
    })
  }

  private handleFriendRequest(message: any, fromPeerId: string) {
    const request: FriendRequest = {
      id: crypto.randomUUID(),
      from: fromPeerId,
      publicKey: message.publicKey,
      fromUserInfo: {
        username: message.username,
        displayName: message.displayName
      },
      message: message.message,
      timestamp: new Date()
    }

    this.friendRequests.push(request)
    this.persistFriendRequests()
    console.log('👋 Received friend request from:', message.username)
    this.emit('friend_requests:updated', this.friendRequests)
    this.emit('friend-request:received', request)
  }

  private handleFriendRequestResponse(message: any, fromPeerId: string) {
    if (message.accepted) {
      // Add as friend
      const friend: Friend = {
        publicKey: message.publicKey,
        userInfo: {
          username: message.username,
          displayName: message.displayName
        },
        connectionStatus: 'online',
        addedAt: Date.now()
      }

      this.friends.push(friend)
      this.persistFriends()
      console.log('✅ Friend request accepted by:', message.username)
      this.emit('friends:updated', this.friends)
      this.emit('friend-request:accepted', { friend })
    } else {
      console.log('❌ Friend request rejected by:', message.username)
    }

    // Remove from pending requests
    this.pendingRequests.delete(fromPeerId)
    this.emit('pending_requests:updated', Array.from(this.pendingRequests))
  }

  private async handleChatMessage(message: any, fromPeerId: string) {
    console.log('💬 Chat message from:', fromPeerId, ':', message.content)
    
    // Check if the message content is encrypted
    let displayContent = message.content
    let isEncrypted = false
    
    if (typeof message.content === 'object' && message.content.ciphertext) {
      console.log('🔓 Received encrypted message, attempting to decrypt...')
      console.log('🔍 Encrypted message structure:', Object.keys(message.content))
      try {
        // Get current user's UnSea keypair for decryption
        const currentUserKeypair = await pigeonSocial.getCurrentUserUnSeaKeypair()
        if (currentUserKeypair && currentUserKeypair.epriv) {
          console.log('🔑 Using current user UnSea keypair for decryption')
          
          // Decrypt the message using our ephemeral private key
          const decryptedContent = await decryptMessageWithMeta(message.content, currentUserKeypair.epriv)
          console.log('� Successfully decrypted message:', decryptedContent)
          
          displayContent = decryptedContent
          isEncrypted = true // Mark as encrypted but now decrypted for display
          console.log('✅ Message decrypted successfully')
        } else {
          displayContent = `[Encrypted Message - No Private Key Available]`
          isEncrypted = true
          console.log('❌ No UnSea keypair or epriv found for current user')
        }
      } catch (error) {
        console.error('❌ Failed to decrypt message:', error)
        console.error('🔍 Decryption error details:', (error as Error).message)
        displayContent = '[Encrypted Message - Decryption Failed]'
        isEncrypted = true
      }
    }
    
    // Find the friend by looking up the peerIdMap in reverse
    let fromPublicKey = fromPeerId // fallback
    let friend = null
    
    // Look through peerIdMap to find which friend has this peer ID
    for (const [publicKey, mappedPeerId] of this.peerIdMap.entries()) {
      if (mappedPeerId === fromPeerId) {
        fromPublicKey = publicKey
        friend = this.friends.find(f => f.publicKey === publicKey)
        console.log(`🎯 Found friend for peer ${fromPeerId}: ${friend?.userInfo.displayName}`)
        break
      }
    }
    
    // If not found in peerIdMap, try the old fallback method
    if (!friend) {
      friend = this.friends.find(f => f.publicKey.startsWith(fromPeerId))
      fromPublicKey = friend ? friend.publicKey : fromPeerId
      console.log(`🔍 Fallback friend lookup for ${fromPeerId}: ${friend?.userInfo.displayName || 'not found'}`)
    }
    
    // Save the incoming message to distributed storage
    const currentUser = await pigeonSocial.getCurrentUser()
    if (currentUser && friend) {
      const chatMessage: ChatMessage = {
        id: crypto.randomUUID(),
        content: message.content, // Store the original encrypted content, not decrypted
        timestamp: message.timestamp,
        fromPublicKey: fromPublicKey,
        toPublicKey: currentUser.publicKey,
        encrypted: isEncrypted
      }
      
      await this.saveMessage(chatMessage)
      console.log('💾 Saved incoming message to storage (encrypted)')
    }
    
    this.emit('chat:message_received', {
      from: fromPublicKey,
      content: displayContent, // Use displayContent for UI
      timestamp: new Date(message.timestamp)
    })
    
    // Also emit the event that Messaging component expects
    this.emit('peer:message', {
      fromPublicKey: fromPublicKey,
      message: {
        content: displayContent, // Use displayContent (decrypted) for UI
        timestamp: message.timestamp,
        encrypted: isEncrypted
      }
    })
    
    console.log('📢 Emitted peer:message event for:', friend ? friend.userInfo.username : fromPeerId)
  }

  private handleSharedPost(message: any, fromPeerId: string) {
    console.log('📥 Received shared post from:', fromPeerId)
    
    // Find the friend's full public key
    const friend = this.friends.find(f => f.publicKey.startsWith(fromPeerId))
    
    if (friend) {
      // Emit event for the main feed to pick up
      this.emit('post:shared', {
        post: message.post,
        sharedBy: friend,
        sharedAt: message.sharedAt
      })
    }
  }

  // Public API methods
  async sendFriendRequest(publicKey: string, message?: string) {
    if (!this.mesh) {
      throw new Error('Mesh not initialized')
    }

    try {
      const currentUser = await pigeonSocial.getCurrentUser()
      if (!currentUser) {
        throw new Error('No current user')
      }

      // Find peer by public key (assuming peerId is derived from public key)
      const peerId = publicKey.substring(0, 40)
      
      const friendRequest = {
        type: 'friend_request',
        publicKey: currentUser.publicKey,
        username: currentUser.username,
        displayName: currentUser.displayName,
        message: message || ''
      }

      await this.mesh.sendDirectMessage(peerId, JSON.stringify(friendRequest))
      this.pendingRequests.add(peerId)
      
      console.log('📤 Sent friend request to:', peerId.substring(0, 8) + '...')
      this.emit('pending_requests:updated', Array.from(this.pendingRequests))
      
      return true
    } catch (error) {
      console.error('❌ Failed to send friend request:', error)
      return false
    }
  }

  async acceptFriendRequest(requestId: string) {
    const request = this.friendRequests.find(r => r.id === requestId)
    if (!request) {
      throw new Error('Friend request not found')
    }

    try {
      const currentUser = await pigeonSocial.getCurrentUser()
      if (!currentUser) {
        throw new Error('No current user')
      }

      // Send acceptance response
      const response = {
        type: 'friend_request_response',
        accepted: true,
        publicKey: currentUser.publicKey,
        username: currentUser.username,
        displayName: currentUser.displayName
      }

      await this.mesh!.sendDirectMessage(request.from, JSON.stringify(response))

      // Add as friend
      const friend: Friend = {
        publicKey: request.publicKey,
        userInfo: {
          username: request.fromUserInfo.username,
          displayName: request.fromUserInfo.displayName || request.fromUserInfo.username
        },
        connectionStatus: 'online',
        addedAt: Date.now()
      }

      this.friends.push(friend)
      this.persistFriends()
      
      // Remove from requests
      this.friendRequests = this.friendRequests.filter(r => r.id !== requestId)
      this.persistFriendRequests()
      
      console.log('✅ Accepted friend request from:', request.fromUserInfo.username)
      this.emit('friends:updated', this.friends)
      this.emit('friend_requests:updated', this.friendRequests)
      this.emit('friend-request:accepted', { friend })
      
      return true
    } catch (error) {
      console.error('❌ Failed to accept friend request:', error)
      return false
    }
  }

  async rejectFriendRequest(requestId: string) {
    const request = this.friendRequests.find(r => r.id === requestId)
    if (!request) {
      throw new Error('Friend request not found')
    }

    try {
      const currentUser = await pigeonSocial.getCurrentUser()
      if (!currentUser) {
        throw new Error('No current user')
      }

      // Send rejection response
      const response = {
        type: 'friend_request_response',
        accepted: false,
        publicKey: currentUser.publicKey,
        username: currentUser.username,
        displayName: currentUser.displayName
      }

      await this.mesh!.sendDirectMessage(request.from, JSON.stringify(response))
      
      // Remove from requests
      this.friendRequests = this.friendRequests.filter(r => r.id !== requestId)
      
      console.log('❌ Rejected friend request from:', request.fromUserInfo.username)
      this.emit('friend_requests:updated', this.friendRequests)
      
      return true
    } catch (error) {
      console.error('❌ Failed to reject friend request:', error)
      return false
    }
  }

  async sendMessage(friendPublicKey: string, content: string): Promise<boolean> {
    if (!this.mesh) {
      console.error('❌ Cannot send message - mesh not initialized')
      return false
    }

    try {
      // Get the actual connected peer ID from our mapping
      let actualPeerId = this.peerIdMap.get(friendPublicKey)
      
      if (!actualPeerId) {
        console.error('❌ Cannot send message - friend is not connected or not in peer mapping')
        console.error('🔍 Friend public key:', friendPublicKey.substring(0, 8) + '...')
        console.error('🔍 Available peer mappings:', Array.from(this.peerIdMap.entries()).map(([pk, pid]) => 
          `${pk.substring(0, 8)}... -> ${pid}`
        ))
        console.error('🔍 Current connected peers:', this.getConnectedPeers())
        console.error('🔍 Current friends:', this.friends.map(f => ({
          publicKey: f.publicKey.substring(0, 8) + '...',
          status: f.connectionStatus,
          displayName: f.userInfo.displayName
        })))
        
        // EMERGENCY FALLBACK: If friend is marked as online but not in peerIdMap,
        // and we have connected peers, map them directly
        const connectedPeers = this.getConnectedPeers()
        const friend = this.friends.find(f => f.publicKey === friendPublicKey)
        
        if (friend && friend.connectionStatus === 'online' && connectedPeers.length > 0) {
          console.log('🚨 EMERGENCY MAPPING: Friend is online but not mapped, mapping to first connected peer')
          const emergencyPeerId = connectedPeers[0]
          this.peerIdMap.set(friendPublicKey, emergencyPeerId)
          console.log(`🚨 Emergency mapped ${friendPublicKey.substring(0, 8)}... -> ${emergencyPeerId}`)
          
          // Continue with the emergency peer ID
          actualPeerId = emergencyPeerId
        } else {
          return false
        }
      }
      
      const message: any = {
        type: 'chat_message',
        content: content,
        timestamp: Date.now(),
        from: this.mesh.peerId
      }

      // Encrypt the message content before sending
      let encryptedMessage = message
      let isEncrypted = false
      
      try {
        // Get the friend's public key for encryption
        const friend = this.friends.find(f => f.publicKey === friendPublicKey)
        if (friend && friend.userInfo.publicKey) {
          console.log('🔐 Encrypting message content...')
          console.log('🔍 Original message content:', content)
          
          // Get our current user's UnSea keypair
          const currentUserKeypair = await pigeonSocial.getCurrentUserUnSeaKeypair()
          if (currentUserKeypair) {
            console.log('� Using current user UnSea keypair for encryption')
            console.log('🔍 Current user keypair available:', {
              hasPub: !!currentUserKeypair.pub,
              hasEpub: !!currentUserKeypair.epub,
              hasPriv: !!currentUserKeypair.priv,
              hasEpriv: !!currentUserKeypair.epriv
            })
            
            // Create the friend's public keypair object for encryption
            const friendPublicKeypair = {
              pub: friend.userInfo.publicKey,
              epub: friend.userInfo.epub || friend.userInfo.publicKey // fallback
            }
            
            // Encrypt using the friend's public key so they can decrypt it
            const encryptedContent = await encryptMessageWithMeta(content, friendPublicKeypair)
            console.log('🔐 Encrypted message content (length):', encryptedContent.length)
            console.log('🔐 Encrypted content structure:', Object.keys(encryptedContent))
            
            encryptedMessage = {
              ...message,
              content: encryptedContent,
              encrypted: true
            }
            isEncrypted = true
            console.log('✅ Message content encrypted successfully with user keypair')
          } else {
            console.log('⚠️ No UnSea keypair found for current user, sending unencrypted')
          }
        } else {
          console.log('⚠️ Cannot encrypt - missing friend public key')
          console.log('🔍 Friend found:', !!friend)
          console.log('🔍 Friend has publicKey:', !!(friend?.userInfo?.publicKey))
        }
      } catch (error) {
        console.error('❌ Failed to encrypt message:', error)
        console.error('🔍 Error details:', (error as Error).message)
        // Continue with unencrypted message
      }

      console.log(`📤 🚨 SENDING MESSAGE using actual PeerPigeon peer ID`)
        console.log('📤 Friend public key:', friendPublicKey.substring(0, 8) + '...')
        console.log('📤 Mapped to actual peer ID:', actualPeerId)
        console.log('📤 Message data:', encryptedMessage)
        console.log('📤 Message encrypted:', isEncrypted)
      console.log('🔍 Current mesh connected status:', this.mesh.connected)
      console.log('🔍 Connected peers:', this.getConnectedPeers())
      
      // Verify the peer is still connected
      const connectedPeers = this.getConnectedPeers()
      if (!connectedPeers.includes(actualPeerId)) {
        console.error('❌ Target peer is no longer connected:', actualPeerId)
        return false
      }

      console.log('�🔧 Available mesh methods:', Object.keys(this.mesh))

      // Try different PeerPigeon methods
      let success = false

      // Method 1: sendDirectMessage (current approach)
      if (this.mesh.sendDirectMessage) {
        try {
          console.log('🔧 Trying mesh.sendDirectMessage() to actual peer:', actualPeerId)
          await this.mesh.sendDirectMessage(actualPeerId, JSON.stringify(encryptedMessage))
          success = true
          console.log('✅ Message sent via sendDirectMessage()')
        } catch (error) {
          console.log('❌ sendDirectMessage() failed:', error)
        }
      }

      // Method 2: sendMessage
      if (!success && this.mesh.sendMessage) {
        try {
          console.log('� Trying mesh.sendMessage()...')
          await this.mesh.sendMessage(JSON.stringify({ ...encryptedMessage, to: actualPeerId }))
          success = true
          console.log('✅ Message sent via sendMessage()')
        } catch (error) {
          console.log('❌ sendMessage() failed:', error)
        }
      }


      if (success) {
        console.log('💬 ✅ MESSAGE SUCCESSFULLY SENT TO ACTUAL PEER:', actualPeerId, 'Content:', content)
        
        // Save the outgoing message to distributed storage
        const currentUser = await pigeonSocial.getCurrentUser()
        if (currentUser) {
          const chatMessage: ChatMessage = {
            id: crypto.randomUUID(),
            content: isEncrypted ? encryptedMessage.content : content, // Store encrypted content if available
            timestamp: message.timestamp,
            fromPublicKey: currentUser.publicKey,
            toPublicKey: friendPublicKey,
            encrypted: isEncrypted
          }
          
          await this.saveMessage(chatMessage)
          console.log('💾 Saved outgoing message to storage (encrypted:', isEncrypted, ')')
        }
      } else {
        console.error('❌ All message send methods failed for actual peer:', actualPeerId)
      }
      
      return success
    } catch (error) {
      console.error('❌ Failed to send message:', error)
      return false
    }
  }

  // Getters
  getFriends(): Friend[] {
    return [...this.friends]
  }

  getFriendRequests(): FriendRequest[] {
    return [...this.friendRequests]
  }

  // Get message history for a friend
  async getMessageHistory(friendPublicKey: string): Promise<ChatMessage[]> {
    const currentUser = await pigeonSocial.getCurrentUser()
    if (!currentUser) {
      return []
    }
    
    return await this.getMessagesForFriend(friendPublicKey, currentUser.publicKey)
  }

  getPendingFriendRequests(): FriendRequest[] {
    return [...this.friendRequests]
  }

  getPendingRequests(): string[] {
    return Array.from(this.pendingRequests)
  }

  async discoverPeers(): Promise<any[]> {
    // In PeerPigeon, peers are automatically discovered when connected to signaling server
    // Return the connected peers
    return this.getConnectedPeers().map(peerId => ({
      peerId,
      publicKey: peerId // Assuming peerId is derived from public key
    }))
  }

  isFriend(publicKey: string): boolean {
    return this.friends.some(f => f.publicKey === publicKey)
  }

  getPeerConnectionStatus(publicKey: string): 'connected' | 'disconnected' | 'connecting' {
    const peerId = publicKey.substring(0, 40)
    const connectedPeers = this.getConnectedPeers()
    return connectedPeers.includes(peerId) ? 'connected' : 'disconnected'
  }

  async sendMessageToFriend(publicKey: string, message: string): Promise<boolean> {
    console.log('📤 Sending message to friend with key:', publicKey.substring(0, 8) + '...', 'Message:', message)
    const result = await this.sendMessage(publicKey, message)
    console.log('📤 Send result:', result ? 'Success' : 'Failed')
    return result
  }

  getConnectedPeers(): string[] {
    if (!this.mesh) return []
    
    try {
      // Get connected peer IDs from the mesh
      const peers = this.mesh.getPeers()
      return peers.map((peer: any) => peer.peerId)
    } catch (error) {
      console.error('❌ Failed to get connected peers:', error)
      return []
    }
  }

  isConnected(): boolean {
    return this.mesh?.connected || false
  }

  isConnectedToSignaling(): boolean {
    return this.mesh?.connected || false
  }

  async sharePost(post: any) {
    if (!this.mesh) {
      console.log('❌ Cannot share post - mesh not initialized')
      return
    }

    try {
      const postMessage = {
        type: 'shared_post',
        post: post,
        sharedAt: Date.now()
      }

      // Share post with all online friends
      for (const friend of this.friends) {
        if (friend.connectionStatus === 'online') {
          const peerId = friend.publicKey.substring(0, 40)
          try {
            await this.mesh.sendDirectMessage(peerId, JSON.stringify(postMessage))
            console.log('📤 Shared post with:', friend.userInfo.username)
          } catch (error) {
            console.error('❌ Failed to share post with', friend.userInfo.username, ':', error)
          }
        }
      }
    } catch (error) {
      console.error('❌ Failed to share post:', error)
    }
  }

  async broadcastPost(post: any) {
    // Alias for sharePost for compatibility
    return this.sharePost(post)
  }

  // Event system
  on(event: string, callback: Function) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, [])
    }
    this.eventListeners.get(event)!.push(callback)
  }

  off(event: string, callback: Function) {
    const listeners = this.eventListeners.get(event)
    if (listeners) {
      const index = listeners.indexOf(callback)
      if (index > -1) {
        listeners.splice(index, 1)
      }
    }
  }

  private emit(event: string, data?: any) {
    const listeners = this.eventListeners.get(event)
    if (listeners) {
      listeners.forEach(callback => callback(data))
    }
  }

  // Peer connection monitoring methods
  private updatePeerConnectionStatus(peerId: string, status: 'online' | 'offline') {
    // Find which friend this peer belongs to and update their status
    for (const [publicKey, mappedPeerId] of this.peerIdMap.entries()) {
      if (mappedPeerId === peerId) {
        const friend = this.friends.find(f => f.publicKey === publicKey)
        if (friend && friend.connectionStatus !== status) {
          friend.connectionStatus = status
          friend.lastSeen = new Date()
          
          console.log(`🔄 ${friend.userInfo.displayName || friend.userInfo.username}: ${status}`)
          this.emit('friends:updated', this.friends)
          
          if (status === 'offline') {
            this.stopPeerMonitoring(peerId)
          }
        }
        break
      }
    }
  }

  private startPeerMonitoring(peerId: string) {
    if (!this.monitoringEnabled) {
      return
    }
    
    // Clear any existing monitor for this peer
    this.stopPeerMonitoring(peerId)
    
    // Start periodic ping/connectivity check - reduced frequency to prevent spam
    const monitor = setInterval(() => {
      this.checkPeerConnection(peerId)
    }, 30000) // Check every 30 seconds instead of 10
    
    this.connectionMonitors.set(peerId, monitor)
  }

  private stopPeerMonitoring(peerId: string) {
    const monitor = this.connectionMonitors.get(peerId)
    if (monitor) {
      clearInterval(monitor)
      this.connectionMonitors.delete(peerId)
    }
  }

  private async checkPeerConnection(peerId: string) {
    if (!this.mesh || !this.monitoringEnabled) return
    
    try {
      // Check if peer is still in connected peers list
      const connectedPeers = this.getConnectedPeers()
      if (!connectedPeers.includes(peerId)) {
        this.updatePeerConnectionStatus(peerId, 'offline')
        return
      }

      // Rate limit pings - don't send if we sent one recently
      const lastPing = this.lastPingSent.get(peerId) || 0
      const timeSinceLastPing = Date.now() - lastPing
      if (timeSinceLastPing < 25000) { // Don't ping more than once every 25 seconds
        return
      }

      // Try to send a ping message to verify connectivity
      const pingMessage = {
        type: 'ping',
        timestamp: Date.now(),
        from: this.mesh.peerId
      }

      this.lastPingSent.set(peerId, Date.now())
      
      try {
        await this.mesh.sendDirectMessage(peerId, JSON.stringify(pingMessage))
        
        // Set a timeout to check if we get a response
        setTimeout(() => {
          const lastPing = this.lastPingSent.get(peerId) || 0
          const lastPong = this.lastPingReceived.get(peerId) || 0
          
          // If no pong received within 10 seconds of the last ping, consider offline
          if (lastPong < lastPing && Date.now() - lastPing > 10000) {
            this.updatePeerConnectionStatus(peerId, 'offline')
          }
        }, 10000) // Increased timeout to 10 seconds
        
      } catch (error) {
        this.updatePeerConnectionStatus(peerId, 'offline')
      }
      
    } catch (error) {
      // Silent error handling for ping checks
    }
  }

  private handlePingMessage(message: any, fromPeerId: string) {
    // Rate limit pong responses - don't respond to pings too frequently
    const lastPong = this.lastPongSent.get(fromPeerId) || 0
    const timeSinceLastPong = Date.now() - lastPong
    if (timeSinceLastPong < 20000) { // Don't respond more than once every 20 seconds
      return
    }
    
    // Send pong response
    if (this.mesh) {
      const pongMessage = {
        type: 'pong',
        timestamp: Date.now(),
        originalPing: message.timestamp,
        from: this.mesh.peerId
      }
      
      try {
        this.mesh.sendDirectMessage(fromPeerId, JSON.stringify(pongMessage))
        this.lastPongSent.set(fromPeerId, Date.now())
      } catch (error) {
        console.error('❌ Failed to send pong:', error)
      }
    }
  }

  private handlePongMessage(_message: any, fromPeerId: string) {
    this.lastPingReceived.set(fromPeerId, Date.now())
    
    // Update connection status to ensure peer is marked as online
    this.updatePeerConnectionStatus(fromPeerId, 'online')
  }

  private startPeriodicCleanup() {
    // Clear any existing cleanup interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
    }
    
    // Run cleanup every 60 seconds instead of 30
    this.cleanupInterval = setInterval(() => {
      this.cleanupStaleConnections()
    }, 60000)
  }

  private cleanupStaleConnections() {
    if (!this.mesh) return

    const connectedPeers = this.getConnectedPeers()

    // First, mark ALL friends as offline, then mark only connected ones as online
    this.friends.forEach(friend => {
      if (friend.connectionStatus === 'online') {
        // Check if this friend has any connected peer
        const friendHasConnectedPeer = Array.from(this.peerIdMap.entries())
          .some(([publicKey, peerId]) => publicKey === friend.publicKey && connectedPeers.includes(peerId))
        
        if (!friendHasConnectedPeer) {
          friend.connectionStatus = 'offline'
          friend.lastSeen = new Date()
          console.log(`🔄 ${friend.userInfo.displayName || friend.userInfo.username}: offline`)
        }
      }
    })

    // Check each mapped peer to see if they're still connected
    // If not connected, remove the stale mapping (but keep friend record)
    const staleEntries: string[] = []
    for (const [publicKey, peerId] of this.peerIdMap.entries()) {
      if (!connectedPeers.includes(peerId)) {
        this.updatePeerConnectionStatus(peerId, 'offline')
        staleEntries.push(publicKey)
      }
    }

    // Remove stale mappings so friend can reconnect with new peer ID
    staleEntries.forEach(publicKey => {
      const oldPeerId = this.peerIdMap.get(publicKey)
      if (oldPeerId) {
        console.log(`🧹 Removing stale mapping: ${publicKey.substring(0, 8)}... -> ${oldPeerId}`)
        this.peerIdMap.delete(publicKey)
      }
    })

    // Clean up monitoring for peers that are no longer connected
    for (const [peerId, _monitor] of this.connectionMonitors.entries()) {
      if (!connectedPeers.includes(peerId)) {
        this.stopPeerMonitoring(peerId)
      }
    }
    
    // Emit update to refresh UI
    this.emit('friends:updated', this.friends)
  }

  // Cleanup method to call when service is being destroyed
  // @ts-ignore - Utility method for future use
  private cleanup() {
    // Clear all monitoring intervals
    for (const [peerId, _monitor] of this.connectionMonitors.entries()) {
      this.stopPeerMonitoring(peerId)
    }

    // Clear periodic cleanup
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }

    console.log('🧹 FriendService cleanup completed')
  }

  // Public method to disable monitoring if ping storms occur
  disableMonitoring() {
    console.log('⏸️ Disabling peer monitoring')
    this.monitoringEnabled = false
    
    // Stop all existing monitors
    for (const [peerId, _monitor] of this.connectionMonitors.entries()) {
      this.stopPeerMonitoring(peerId)
    }
    
    // Stop cleanup interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
  }

  // Public method to re-enable monitoring
  enableMonitoring() {
    console.log('▶️ Enabling peer monitoring')
    this.monitoringEnabled = true
    this.startPeriodicCleanup()
  }

  // Reset all friend statuses to offline (useful on startup)
  private resetAllFriendStatuses() {
    let statusChanged = false
    
    this.friends.forEach(friend => {
      if (friend.connectionStatus !== 'offline') {
        friend.connectionStatus = 'offline'
        friend.lastSeen = new Date()
        statusChanged = true
      }
    })
    
    if (statusChanged) {
      console.log('🔄 Reset all friends to offline status')
      this.emit('friends:updated', this.friends)
    }
  }

  // Public method to refresh friend connection statuses
  refreshFriendStatuses() {
    console.log('🔄 Refreshing friend connection statuses...')
    this.cleanupStaleConnections()
  }

  // Remove a friend permanently
  removeFriend(publicKey: string) {
    const friendIndex = this.friends.findIndex(f => f.publicKey === publicKey)
    if (friendIndex === -1) {
      console.warn('❌ Friend not found for removal:', publicKey.substring(0, 8) + '...')
      return false
    }

    const friend = this.friends[friendIndex]
    const friendName = friend.userInfo.displayName || friend.userInfo.username

    // Stop monitoring if they're connected
    const peerId = this.peerIdMap.get(publicKey)
    if (peerId) {
      this.stopPeerMonitoring(peerId)
      this.peerIdMap.delete(publicKey)
    }

    // Remove from friends list
    this.friends.splice(friendIndex, 1)
    
    // Persist the change
    this.persistFriends()
    
    console.log(`🗑️ Removed friend: ${friendName}`)
    this.emit('friends:updated', this.friends)
    this.emit('friend:removed', { publicKey, name: friendName })
    
    return true
  }

  // Debug method to clear all peer mappings and force fresh connections
  clearAllMappings() {
    console.log('🧹 Clearing all peer mappings - friends will need to reconnect')
    this.peerIdMap.clear()
    this.friends.forEach(friend => {
      friend.connectionStatus = 'offline'
      friend.lastSeen = new Date()
    })
    this.emit('friends:updated', this.friends)
  }
}

// Export singleton instance
export const friendService = FriendService.getInstance()
