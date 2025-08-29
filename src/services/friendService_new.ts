import { PeerPigeonMesh } from 'peerpigeon'
import { pigeonSocial } from './pigeonSocial'
import { config } from '../config'

interface Friend {
  publicKey: string
  username: string
  displayName: string
  status: 'online' | 'offline'
  lastSeen?: Date
}

interface FriendRequest {
  id: string
  from: string
  publicKey: string
  username: string
  displayName: string
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

  private constructor() {}

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
      this.emit('initialized')

    } catch (error) {
      console.error('❌ Failed to initialize friend service:', error)
      throw error
    }
  }

  private setupMeshEventHandlers() {
    if (!this.mesh) return

    // Handle peer discovery (automatic with PeerPigeon)
    this.mesh.addEventListener('peerConnected', (data: any) => {
      console.log('🤝 Peer connected:', data.peerId?.substring(0, 8) + '...')
      this.handlePeerConnected(data.peerId)
      this.emit('peer:connected', data.peerId)
    })

    this.mesh.addEventListener('peerDisconnected', (data: any) => {
      console.log('👋 Peer disconnected:', data.peerId?.substring(0, 8) + '...')
      this.handlePeerDisconnected(data.peerId)
      this.emit('peer:disconnected', data.peerId)
    })

    // Handle incoming messages
    this.mesh.addEventListener('messageReceived', (data: any) => {
      console.log('📨 Message received from:', data.from?.substring(0, 8) + '...')
      this.handleIncomingMessage(data)
    })

    // Handle connection status
    this.mesh.addEventListener('connected', () => {
      console.log('🌐 Connected to PeerPigeon mesh')
      this.emit('mesh:connected')
    })

    this.mesh.addEventListener('disconnected', () => {
      console.log('📴 Disconnected from PeerPigeon mesh')
      this.emit('mesh:disconnected')
    })
  }

  private handlePeerConnected(peerId: string) {
    // When a peer connects, we can send them our user info
    this.sendUserInfoToPeer(peerId)
  }

  private handlePeerDisconnected(peerId: string) {
    // Update friend status to offline
    const friend = this.friends.find(f => f.publicKey.startsWith(peerId))
    if (friend) {
      friend.status = 'offline'
      friend.lastSeen = new Date()
      this.emit('friends:updated', this.friends)
    }
  }

  private async sendUserInfoToPeer(peerId: string) {
    if (!this.mesh) return

    try {
      const currentUser = await pigeonSocial.getCurrentUser()
      if (!currentUser) return

      const userInfo = {
        type: 'user_info',
        publicKey: currentUser.publicKey,
        username: currentUser.username,
        displayName: currentUser.displayName
      }

      await this.mesh.sendDirectMessage(peerId, JSON.stringify(userInfo))
    } catch (error) {
      console.error('❌ Failed to send user info to peer:', error)
    }
  }

  private handleIncomingMessage(data: any) {
    try {
      const message = typeof data.content === 'string' ? JSON.parse(data.content) : data.content

      switch (message.type) {
        case 'user_info':
          this.handleUserInfo(message, data.from)
          break
        case 'friend_request':
          this.handleFriendRequest(message, data.from)
          break
        case 'friend_request_response':
          this.handleFriendRequestResponse(message, data.from)
          break
        case 'chat_message':
          this.handleChatMessage(message, data.from)
          break
        default:
          console.log('🤷 Unknown message type:', message.type)
      }
    } catch (error) {
      console.error('❌ Failed to handle incoming message:', error)
    }
  }

  private handleUserInfo(message: any, fromPeerId: string) {
    console.log('👤 Received user info from:', message.username)
    
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
      username: message.username,
      displayName: message.displayName,
      message: message.message,
      timestamp: new Date()
    }

    this.friendRequests.push(request)
    console.log('👋 Received friend request from:', message.username)
    this.emit('friend_requests:updated', this.friendRequests)
  }

  private handleFriendRequestResponse(message: any, fromPeerId: string) {
    if (message.accepted) {
      // Add as friend
      const friend: Friend = {
        publicKey: message.publicKey,
        username: message.username,
        displayName: message.displayName,
        status: 'online'
      }

      this.friends.push(friend)
      console.log('✅ Friend request accepted by:', message.username)
      this.emit('friends:updated', this.friends)
    } else {
      console.log('❌ Friend request rejected by:', message.username)
    }

    // Remove from pending requests
    this.pendingRequests.delete(fromPeerId)
    this.emit('pending_requests:updated', Array.from(this.pendingRequests))
  }

  private handleChatMessage(message: any, fromPeerId: string) {
    console.log('💬 Chat message from:', fromPeerId, ':', message.content)
    this.emit('chat:message_received', {
      from: fromPeerId,
      content: message.content,
      timestamp: new Date(message.timestamp)
    })
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
        username: request.username,
        displayName: request.displayName,
        status: 'online'
      }

      this.friends.push(friend)
      
      // Remove from requests
      this.friendRequests = this.friendRequests.filter(r => r.id !== requestId)
      
      console.log('✅ Accepted friend request from:', request.username)
      this.emit('friends:updated', this.friends)
      this.emit('friend_requests:updated', this.friendRequests)
      
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
      
      console.log('❌ Rejected friend request from:', request.username)
      this.emit('friend_requests:updated', this.friendRequests)
      
      return true
    } catch (error) {
      console.error('❌ Failed to reject friend request:', error)
      return false
    }
  }

  async sendMessage(friendPublicKey: string, content: string) {
    if (!this.mesh) {
      throw new Error('Mesh not initialized')
    }

    try {
      const peerId = friendPublicKey.substring(0, 40)
      
      const message = {
        type: 'chat_message',
        content: content,
        timestamp: Date.now()
      }

      await this.mesh.sendDirectMessage(peerId, JSON.stringify(message))
      console.log('💬 Sent message to:', peerId.substring(0, 8) + '...')
      
      return true
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

  getPendingRequests(): string[] {
    return Array.from(this.pendingRequests)
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

  // Event system
  on(event: string, callback: Function) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, [])
    }
    this.eventListeners.get(event)!.push(callback)
  }

  private emit(event: string, data?: any) {
    const listeners = this.eventListeners.get(event)
    if (listeners) {
      listeners.forEach(callback => callback(data))
    }
  }
}

// Export singleton instance
export const friendService = FriendService.getInstance()
