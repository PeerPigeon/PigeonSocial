// Friend management system with UnSea encryption
import { pigeonSocial } from './pigeonSocial'
import { config } from '../config'

// Fallback SHA1-like generation using crypto
function generatePeerId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(20)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

export interface FriendRequest {
  id: string
  fromPublicKey: string
  toPublicKey: string
  fromUserInfo: {
    username: string
    displayName?: string
  }
  message?: string
  timestamp: number
  status: 'pending' | 'accepted' | 'rejected' | 'expired'
  encryptedData?: string // Encrypted using UnSea
}

export interface Friend {
  publicKey: string
  userInfo: {
    username: string
    displayName?: string
    avatar?: string
  }
  connectionStatus: 'online' | 'offline' | 'connecting'
  addedAt: number
  lastSeen: number
  sharedSecret?: string // For end-to-end encryption
}

export interface PeerConnection {
  publicKey: string
  connection: RTCPeerConnection
  dataChannel: RTCDataChannel | null
  status: 'connecting' | 'connected' | 'disconnected' | 'failed'
}

export class FriendService {
  private ws: WebSocket | null = null
  private isConnected = false
  private currentPeerId: string | null = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectInterval = 5000
  private friends = new Map<string, Friend>()
  private friendRequests = new Map<string, FriendRequest>()
  private peerConnections = new Map<string, PeerConnection>()
  private eventListeners = new Map<string, Function[]>()

  constructor() {
    this.loadFriendsFromStorage()
    this.loadFriendRequestsFromStorage()
    // Don't connect immediately - wait for user to be available
    console.log('🔗 FriendService initialized, waiting for user...')
  }

  // Initialize connection after user is available
  async initialize() {
    if (!this.ws) {
      await this.connectToSignalingServer()
    }
  }

  public disconnectFromSignaling() {
    if (this.ws) {
      console.log('🔌 Disconnecting from signaling server')
      this.ws.close(1000, 'Normal disconnect')
      this.ws = null
      this.currentPeerId = null
      this.emit('signaling:disconnected')
    }
  }

  // Event system for UI updates
  on(event: string, callback: Function) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, [])
    }
    this.eventListeners.get(event)!.push(callback)
  }

  private emit(event: string, data?: any) {
    const callbacks = this.eventListeners.get(event)
    if (callbacks) {
      callbacks.forEach(callback => callback(data))
    }
  }

  // Signaling server connection
  private async connectToSignalingServer() {
    // Prevent multiple concurrent connections
    if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
      console.log('🔗 Already connected or connecting to signaling server')
      return
    }

    try {
      const currentUser = await pigeonSocial.getCurrentUser()
      
      // Generate a 40-character SHA1 hash as peerId with session uniqueness
      let peerId: string
      if (currentUser) {
        // Add session timestamp to ensure unique peerId per browser tab/window
        const sessionId = Date.now().toString()
        const uniqueString = `${currentUser.publicKey}_${sessionId}`
        peerId = await this.generateSHA1HashFromString(uniqueString)
      } else {
        // Generate random peerId for anonymous connection
        peerId = generatePeerId()
      }
      
      console.log('🔗 Attempting to connect to signaling server:', config.signaling.serverUrl)
      console.log('🆔 Using peerId (SHA1):', peerId)
      
      // Store the peerId for later use
      this.currentPeerId = peerId
      
      // Some signaling servers expect peerId as a query parameter
      const wsUrl = `${config.signaling.serverUrl}?peerId=${peerId}`
      this.ws = new WebSocket(wsUrl)
      
      this.ws.onopen = () => {
        console.log('✅ Connected to signaling server successfully')
        this.isConnected = true
        this.reconnectAttempts = 0
        
        // Ensure WebSocket is actually in OPEN state before proceeding
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          // Small delay to ensure connection is fully established
          setTimeout(() => {
            this.announcePresence()
          }, 100)
        } else {
          console.log('⚠️ WebSocket not in OPEN state despite onopen event')
        }
        
        this.emit('signaling:connected')
      }

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data)
          console.log('📨 Received signaling message:', message.type)
          this.handleSignalingMessage(message)
        } catch (error) {
          console.error('Failed to parse signaling message:', error)
        }
      }

      this.ws.onclose = (event) => {
        console.log('📴 Disconnected from signaling server. Code:', event.code, 'Reason:', event.reason)
        this.isConnected = false
        this.emit('signaling:disconnected')
        
        // Handle specific error codes
        if (event.code === 1008 && event.reason === 'Peer already connected') {
          console.log('⚠️ Peer already connected - not attempting reconnection')
          // Don't reconnect if peer is already connected
          return
        }
        
        this.scheduleReconnect()
      }

      this.ws.onerror = (error) => {
        console.error('❌ Signaling server error:', error)
        this.emit('signaling:error', error)
      }

    } catch (error) {
      console.error('Failed to connect to signaling server:', error)
      this.scheduleReconnect()
    }
  }

  private scheduleReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++
      console.log(`🔄 Reconnecting to signaling server (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`)
      
      // Clean up existing connection before reconnecting
      if (this.ws) {
        this.ws.close()
        this.ws = null
      }
      
      setTimeout(() => this.connectToSignalingServer(), this.reconnectInterval)
    } else {
      console.error('❌ Max reconnection attempts reached')
      this.emit('signaling:max-reconnects-reached')
    }
  }

  private async announcePresence() {
    if (!this.isConnected || !this.ws) {
      console.log('❌ Cannot announce presence - not connected to signaling server')
      return
    }

    // More reliable WebSocket state check
    if (this.ws.readyState !== WebSocket.OPEN) {
      console.log(`❌ Cannot announce presence - WebSocket state: ${this.ws.readyState} (expected: ${WebSocket.OPEN})`)
      // Retry after a short delay if we're still connected
      if (this.isConnected && this.ws.readyState === WebSocket.CONNECTING) {
        setTimeout(() => this.announcePresence(), 50)
      }
      return
    }

    const currentUser = await pigeonSocial.getCurrentUser()
    if (!currentUser) {
      console.log('❌ Cannot announce presence - no current user')
      return
    }

    const message = {
      type: 'announce',
      publicKey: currentUser.publicKey,
      userInfo: {
        username: currentUser.username,
        displayName: currentUser.displayName
      }
    }

    try {
      console.log('📢 Announcing presence as:', currentUser.username)
      this.ws.send(JSON.stringify(message))
    } catch (error) {
      console.error('❌ Failed to announce presence:', error)
    }
  }

  private handleSignalingMessage(message: any) {
    switch (message.type) {
      case 'connected':
        console.log('✅ Signaling server confirmed connection')
        break
      
      case 'peer-discovered':
        console.log('🔍 Peer discovered:', message.peer || message)
        this.handlePeerDiscovered(message)
        break
      
      case 'peers':
        this.handlePeerDiscovery(message.peers)
        break
      
      case 'peer-list-update':
        this.handlePeerListUpdate(message.peers)
        break
      
      case 'error':
        console.error('❌ Signaling server error:', message.error || message.message || message)
        this.handleSignalingError(message)
        break
      
      case 'friend-request':
        this.handleIncomingFriendRequest(message)
        break
      
      case 'friend-request-response':
        this.handleFriendRequestResponse(message)
        break
      
      case 'webrtc-offer':
        this.handleWebRTCOffer(message)
        break
      
      case 'webrtc-answer':
        this.handleWebRTCAnswer(message)
        break
      
      case 'webrtc-ice':
        this.handleWebRTCIce(message)
        break
      
      default:
        console.log('Unknown signaling message:', message.type, message)
    }
  }

  private handlePeerDiscovered(message: any) {
    // Handle individual peer discovery
    if (message.peer) {
      console.log('🔍 New peer discovered:', message.peer)
      this.emit('peer:discovered', message.peer)
    }
  }

  private handleSignalingError(message: any) {
    // Handle signaling errors
    const error = message.error || message.message || 'Unknown signaling error'
    console.error('❌ Signaling error:', error)
    this.emit('signaling:error', error)
  }

  // Peer discovery
  async discoverPeers(): Promise<any[]> {
    return new Promise((resolve) => {
      if (!this.isConnected || !this.ws) {
        resolve([])
        return
      }

      // Set up temporary listener for peer response
      const handlePeers = (message: any) => {
        if (message.type === 'peers') {
          resolve(message.peers || [])
        }
      }

      this.ws.addEventListener('message', handlePeers, { once: true })
      
      // Request peer discovery - try different formats based on PeerPigeon protocol
      console.log('📡 Requesting peer discovery...')
      this.ws.send(JSON.stringify({ 
        type: 'discover-peers',
        peerId: this.currentPeerId
      }))
      
      // Also try the simpler format
      setTimeout(() => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ type: 'discover' }))
        }
      }, 100)
      
      // Timeout after 5 seconds
      setTimeout(() => resolve([]), 5000)
    })
  }

  private handlePeerDiscovery(peers: any[]) {
    console.log(`🔍 Discovered ${peers.length} peers`)
    this.emit('peers:discovered', peers)
  }

  private handlePeerListUpdate(peers: any[]) {
    // Update online status of friends
    peers.forEach(peer => {
      const friend = this.friends.get(peer.publicKey)
      if (friend) {
        friend.connectionStatus = 'online'
        friend.lastSeen = Date.now()
      }
    })
    
    this.emit('friends:status-updated')
  }

  // Friend requests with UnSea encryption
  async sendFriendRequest(targetPublicKey: string, message?: string): Promise<void> {
    const currentUser = await pigeonSocial.getCurrentUser()
    if (!currentUser || !this.isConnected || !this.ws) {
      throw new Error('Not connected or no current user')
    }

    // Generate shared secret using UnSea (simplified)
    const sharedSecret = await this.generateSharedSecret(currentUser.publicKey, targetPublicKey)
    
    // Encrypt the friend request data
    const requestData = {
      fromPublicKey: currentUser.publicKey,
      fromUserInfo: {
        username: currentUser.username,
        displayName: currentUser.displayName
      },
      message: message || `Hi! I'd like to connect with you on PigeonSocial.`,
      timestamp: Date.now()
    }

    const encryptedData = await this.encryptData(JSON.stringify(requestData), sharedSecret)

    const friendRequest: FriendRequest = {
      id: crypto.randomUUID(),
      fromPublicKey: currentUser.publicKey,
      toPublicKey: targetPublicKey,
      fromUserInfo: requestData.fromUserInfo,
      message: requestData.message,
      timestamp: requestData.timestamp,
      status: 'pending',
      encryptedData
    }

    // Send via signaling server
    const signalingMessage = {
      type: 'friend-request',
      targetPublicKey,
      fromPublicKey: currentUser.publicKey,
      encryptedData,
      requestId: friendRequest.id
    }

    this.ws.send(JSON.stringify(signalingMessage))
    
    // Store outgoing request
    this.friendRequests.set(friendRequest.id, friendRequest)
    await this.saveFriendRequestsToStorage()
    
    this.emit('friend-request:sent', friendRequest)
  }

  private async handleIncomingFriendRequest(message: any) {
    const currentUser = await pigeonSocial.getCurrentUser()
    if (!currentUser) return

    try {
      // Generate shared secret to decrypt the request
      const sharedSecret = await this.generateSharedSecret(currentUser.publicKey, message.fromPublicKey)
      const decryptedData = await this.decryptData(message.encryptedData, sharedSecret)
      const requestData = JSON.parse(decryptedData)

      const friendRequest: FriendRequest = {
        id: message.requestId,
        fromPublicKey: message.fromPublicKey,
        toPublicKey: currentUser.publicKey,
        fromUserInfo: requestData.fromUserInfo,
        message: requestData.message,
        timestamp: requestData.timestamp,
        status: 'pending',
        encryptedData: message.encryptedData
      }

      this.friendRequests.set(friendRequest.id, friendRequest)
      await this.saveFriendRequestsToStorage()
      
      this.emit('friend-request:received', friendRequest)
    } catch (error) {
      console.error('Failed to process friend request:', error)
    }
  }

  async acceptFriendRequest(requestId: string): Promise<void> {
    const request = this.friendRequests.get(requestId)
    if (!request) {
      throw new Error('Friend request not found')
    }

    const currentUser = await pigeonSocial.getCurrentUser()
    if (!currentUser) {
      throw new Error('No current user')
    }

    // Update request status
    request.status = 'accepted'
    this.friendRequests.set(requestId, request)

    // Add to friends list
    const friend: Friend = {
      publicKey: request.fromPublicKey,
      userInfo: request.fromUserInfo,
      connectionStatus: 'offline',
      addedAt: Date.now(),
      lastSeen: request.timestamp,
      sharedSecret: await this.generateSharedSecret(currentUser.publicKey, request.fromPublicKey)
    }

    this.friends.set(request.fromPublicKey, friend)
    
    // Send acceptance response
    if (this.isConnected && this.ws) {
      const response = {
        type: 'friend-request-response',
        targetPublicKey: request.fromPublicKey,
        fromPublicKey: currentUser.publicKey,
        requestId,
        status: 'accepted',
        timestamp: Date.now()
      }

      this.ws.send(JSON.stringify(response))
    }

    // Save to storage
    await this.saveFriendsToStorage()
    await this.saveFriendRequestsToStorage()

    // Establish WebRTC connection
    await this.establishPeerConnection(request.fromPublicKey)

    this.emit('friend-request:accepted', { request, friend })
  }

  async rejectFriendRequest(requestId: string): Promise<void> {
    const request = this.friendRequests.get(requestId)
    if (!request) {
      throw new Error('Friend request not found')
    }

    const currentUser = await pigeonSocial.getCurrentUser()
    if (!currentUser) {
      throw new Error('No current user')
    }

    // Update request status
    request.status = 'rejected'
    this.friendRequests.set(requestId, request)

    // Send rejection response
    if (this.isConnected && this.ws) {
      const response = {
        type: 'friend-request-response',
        targetPublicKey: request.fromPublicKey,
        fromPublicKey: currentUser.publicKey,
        requestId,
        status: 'rejected',
        timestamp: Date.now()
      }

      this.ws.send(JSON.stringify(response))
    }

    await this.saveFriendRequestsToStorage()
    this.emit('friend-request:rejected', request)
  }

  private async handleFriendRequestResponse(message: any) {
    const request = this.friendRequests.get(message.requestId)
    if (!request) return

    request.status = message.status
    this.friendRequests.set(message.requestId, request)

    if (message.status === 'accepted') {
      // Add to friends list
      const currentUser = await pigeonSocial.getCurrentUser()
      if (!currentUser) return

      const friend: Friend = {
        publicKey: message.fromPublicKey,
        userInfo: request.fromUserInfo, // We have this from the original request
        connectionStatus: 'offline',
        addedAt: Date.now(),
        lastSeen: message.timestamp,
        sharedSecret: await this.generateSharedSecret(currentUser.publicKey, message.fromPublicKey)
      }

      this.friends.set(message.fromPublicKey, friend)
      await this.saveFriendsToStorage()

      // Establish WebRTC connection
      await this.establishPeerConnection(message.fromPublicKey)

      this.emit('friend-request:response', { request, status: 'accepted', friend })
    } else {
      this.emit('friend-request:response', { request, status: message.status })
    }

    await this.saveFriendRequestsToStorage()
  }

  // WebRTC peer connections
  private async establishPeerConnection(targetPublicKey: string): Promise<void> {
    const currentUser = await pigeonSocial.getCurrentUser()
    if (!currentUser || !this.isConnected || !this.ws) return

    try {
      const peerConnection = new RTCPeerConnection({
        iceServers: config.webrtc.iceServers
      })

      // Create data channel for direct communication
      const dataChannel = peerConnection.createDataChannel('pigeonsocial', {
        ordered: true
      })

      dataChannel.onopen = () => {
        console.log(`📡 Data channel opened with ${targetPublicKey}`)
        const connection = this.peerConnections.get(targetPublicKey)
        if (connection) {
          connection.status = 'connected'
          const friend = this.friends.get(targetPublicKey)
          if (friend) {
            friend.connectionStatus = 'online'
          }
          this.emit('peer:connected', { publicKey: targetPublicKey })
        }
      }

      dataChannel.onmessage = (event) => {
        this.handlePeerMessage(targetPublicKey, event.data)
      }

      dataChannel.onclose = () => {
        console.log(`📴 Data channel closed with ${targetPublicKey}`)
        const friend = this.friends.get(targetPublicKey)
        if (friend) {
          friend.connectionStatus = 'offline'
        }
        this.emit('peer:disconnected', { publicKey: targetPublicKey })
      }

      // Handle ICE candidates
      peerConnection.onicecandidate = (event) => {
        if (event.candidate && this.ws) {
          this.ws.send(JSON.stringify({
            type: 'webrtc-ice',
            targetPublicKey,
            fromPublicKey: currentUser.publicKey,
            candidate: event.candidate
          }))
        }
      }

      // Store connection
      this.peerConnections.set(targetPublicKey, {
        publicKey: targetPublicKey,
        connection: peerConnection,
        dataChannel,
        status: 'connecting'
      })

      // Create and send offer
      const offer = await peerConnection.createOffer()
      await peerConnection.setLocalDescription(offer)

      this.ws.send(JSON.stringify({
        type: 'webrtc-offer',
        targetPublicKey,
        fromPublicKey: currentUser.publicKey,
        offer
      }))

    } catch (error) {
      console.error('Failed to establish peer connection:', error)
    }
  }

  private async handleWebRTCOffer(message: any) {
    const currentUser = await pigeonSocial.getCurrentUser()
    if (!currentUser || !this.isConnected || !this.ws) return

    try {
      const peerConnection = new RTCPeerConnection({
        iceServers: config.webrtc.iceServers
      })

      // Handle incoming data channel
      peerConnection.ondatachannel = (event) => {
        const dataChannel = event.channel
        
        dataChannel.onopen = () => {
          console.log(`📡 Data channel opened with ${message.fromPublicKey}`)
          const connection = this.peerConnections.get(message.fromPublicKey)
          if (connection) {
            connection.status = 'connected'
            connection.dataChannel = dataChannel
            const friend = this.friends.get(message.fromPublicKey)
            if (friend) {
              friend.connectionStatus = 'online'
            }
            this.emit('peer:connected', { publicKey: message.fromPublicKey })
          }
        }

        dataChannel.onmessage = (event) => {
          this.handlePeerMessage(message.fromPublicKey, event.data)
        }

        dataChannel.onclose = () => {
          console.log(`📴 Data channel closed with ${message.fromPublicKey}`)
          const friend = this.friends.get(message.fromPublicKey)
          if (friend) {
            friend.connectionStatus = 'offline'
          }
          this.emit('peer:disconnected', { publicKey: message.fromPublicKey })
        }
      }

      // Handle ICE candidates
      peerConnection.onicecandidate = (event) => {
        if (event.candidate && this.ws) {
          this.ws.send(JSON.stringify({
            type: 'webrtc-ice',
            targetPublicKey: message.fromPublicKey,
            fromPublicKey: currentUser.publicKey,
            candidate: event.candidate
          }))
        }
      }

      // Store connection
      this.peerConnections.set(message.fromPublicKey, {
        publicKey: message.fromPublicKey,
        connection: peerConnection,
        dataChannel: null, // Will be set when data channel opens
        status: 'connecting'
      })

      // Set remote description and create answer
      await peerConnection.setRemoteDescription(message.offer)
      const answer = await peerConnection.createAnswer()
      await peerConnection.setLocalDescription(answer)

      // Send answer
      this.ws.send(JSON.stringify({
        type: 'webrtc-answer',
        targetPublicKey: message.fromPublicKey,
        fromPublicKey: currentUser.publicKey,
        answer
      }))

    } catch (error) {
      console.error('Failed to handle WebRTC offer:', error)
    }
  }

  private async handleWebRTCAnswer(message: any) {
    const connection = this.peerConnections.get(message.fromPublicKey)
    if (!connection) return

    try {
      await connection.connection.setRemoteDescription(message.answer)
    } catch (error) {
      console.error('Failed to handle WebRTC answer:', error)
    }
  }

  private async handleWebRTCIce(message: any) {
    const connection = this.peerConnections.get(message.fromPublicKey)
    if (!connection) return

    try {
      await connection.connection.addIceCandidate(message.candidate)
    } catch (error) {
      console.error('Failed to handle ICE candidate:', error)
    }
  }

  private handlePeerMessage(fromPublicKey: string, data: string) {
    try {
      const message = JSON.parse(data)
      console.log(`💬 Message from ${fromPublicKey}:`, message)
      this.emit('peer:message', { fromPublicKey, message })
    } catch (error) {
      console.error('Failed to parse peer message:', error)
    }
  }

  // Send encrypted message to friend
  async sendMessageToFriend(friendPublicKey: string, message: any): Promise<void> {
    const connection = this.peerConnections.get(friendPublicKey)
    const friend = this.friends.get(friendPublicKey)
    
    if (!connection || !connection.dataChannel || connection.status !== 'connected') {
      throw new Error('No active connection to friend')
    }

    try {
      // Encrypt message using shared secret
      let messageToSend = message
      if (friend?.sharedSecret) {
        messageToSend = {
          ...message,
          encrypted: true,
          data: await this.encryptData(JSON.stringify(message), friend.sharedSecret)
        }
      }

      connection.dataChannel.send(JSON.stringify(messageToSend))
    } catch (error) {
      console.error('Failed to send message to friend:', error)
      throw error
    }
  }

  // Encryption helpers (simplified UnSea-style)
  private async generateSHA1HashFromString(input: string): Promise<string> {
    const encoder = new TextEncoder()
    const data = encoder.encode(input)
    const hashBuffer = await crypto.subtle.digest('SHA-1', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  }

  private async generateSharedSecret(publicKey1: string, publicKey2: string): Promise<string> {
    // This is a simplified version. In real UnSea, you'd use proper ECDH
    const combined = [publicKey1, publicKey2].sort().join('')
    const encoder = new TextEncoder()
    const data = encoder.encode(combined)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  }

  private async encryptData(data: string, secret: string): Promise<string> {
    // Simplified encryption - use real AES-GCM in production
    const encoder = new TextEncoder()
    const dataBytes = encoder.encode(data)
    const secretBytes = encoder.encode(secret)
    
    // XOR encryption (simplified - use proper AES-GCM in production)
    const encrypted = new Uint8Array(dataBytes.length)
    for (let i = 0; i < dataBytes.length; i++) {
      encrypted[i] = dataBytes[i] ^ secretBytes[i % secretBytes.length]
    }
    
    return btoa(String.fromCharCode(...encrypted))
  }

  private async decryptData(encryptedData: string, secret: string): Promise<string> {
    // Simplified decryption - use real AES-GCM in production
    const encoder = new TextEncoder()
    const secretBytes = encoder.encode(secret)
    const encryptedBytes = new Uint8Array(atob(encryptedData).split('').map(c => c.charCodeAt(0)))
    
    // XOR decryption
    const decrypted = new Uint8Array(encryptedBytes.length)
    for (let i = 0; i < encryptedBytes.length; i++) {
      decrypted[i] = encryptedBytes[i] ^ secretBytes[i % secretBytes.length]
    }
    
    return new TextDecoder().decode(decrypted)
  }

  // Storage helpers
  private async saveFriendsToStorage() {
    const friendsArray = Array.from(this.friends.entries())
    localStorage.setItem('pigeon:friends', JSON.stringify(friendsArray))
  }

  private async loadFriendsFromStorage() {
    try {
      const stored = localStorage.getItem('pigeon:friends')
      if (stored) {
        const friendsArray = JSON.parse(stored)
        this.friends = new Map(friendsArray)
      }
    } catch (error) {
      console.error('Failed to load friends from storage:', error)
    }
  }

  private async saveFriendRequestsToStorage() {
    const requestsArray = Array.from(this.friendRequests.entries())
    localStorage.setItem('pigeon:friend-requests', JSON.stringify(requestsArray))
  }

  private async loadFriendRequestsFromStorage() {
    try {
      const stored = localStorage.getItem('pigeon:friend-requests')
      if (stored) {
        const requestsArray = JSON.parse(stored)
        this.friendRequests = new Map(requestsArray)
      }
    } catch (error) {
      console.error('Failed to load friend requests from storage:', error)
    }
  }

  // Public getters
  getFriends(): Friend[] {
    return Array.from(this.friends.values())
  }

  getFriendRequests(): FriendRequest[] {
    return Array.from(this.friendRequests.values())
  }

  getPendingFriendRequests(): FriendRequest[] {
    return this.getFriendRequests().filter(req => req.status === 'pending')
  }

  isFriend(publicKey: string): boolean {
    return this.friends.has(publicKey)
  }

  getFriend(publicKey: string): Friend | undefined {
    return this.friends.get(publicKey)
  }

  isConnectedToSignaling(): boolean {
    return this.isConnected
  }

  getPeerConnectionStatus(publicKey: string): string {
    const connection = this.peerConnections.get(publicKey)
    return connection?.status || 'disconnected'
  }
}

// Singleton instance
export const friendService = new FriendService()
