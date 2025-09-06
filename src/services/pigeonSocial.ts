// import { PeerPigeonMesh, DistributedStorageManager } from 'peerpigeon'

import { PeerPigeonMesh, DistributedStorageManager } from '../lib/peerpigeon-browser'
import { config } from '../config'
import { generateRandomPair, saveKeys, loadKeys, clearKeys } from 'unsea'

interface StorageInterface {
  get(key: string): Promise<any>
  put(key: string, value: any): Promise<void>
  delete(key: string): Promise<void>
  list(prefix?: string): Promise<string[]>
}

export interface UserProfile {
  id: string
  username: string
  displayName?: string
  avatar?: string
  createdAt: number
  publicKey: string
  posts?: Post[]
}

export interface Post {
  id: string
  author: string
  authorName?: string
  content: string
  image?: string // Base64 encoded image data
  video?: string // For future use (currently disabled)
  timestamp: number
  likes: number
  replies?: number
  comments?: Post[]
  parentId?: string // For replies
  sharedBy?: string // Username of the person who shared this post
  originalAuthor?: string // Original author for shared posts
}

export class PigeonSocialService {
  private mesh: PeerPigeonMesh | null = null
  private storage: StorageInterface | null = null
  private currentUser: UserProfile | null = null
  private isInitialized: boolean = false
  private signalingServerUrl: string
  private webtorrentClient: any = null
  private activeTorrents = new Map()
  private isReseeding: boolean = false
  private hasReseededThisSession: boolean = false

  constructor() {
    // Get signaling server URL from config
    this.signalingServerUrl = config.signaling.serverUrl
    console.log('Signaling server URL:', this.signalingServerUrl)
    
    // Initialize WebTorrent immediately - no complex async initialization
    this.initializeWebTorrent()
    
    // Load existing user immediately from localStorage (synchronous)
    this.loadExistingUserSync()
    
    // Load UnSea keys in background and validate/complete the user profile
    this.loadExistingUser().catch(console.error)
    
    // Initialize distributed storage in background for social features
    this.initializePeerPigeon()
  }

  private initializeWebTorrent() {
    try {
      // Simple initialization like wt.js - just create the client with proper config
      if ((window as any).WebTorrent) {
        // Configure WebTorrent with proper STUN servers and disable autoplay
        const webTorrentConfig = {
          tracker: {
            rtcConfig: {
              iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
              ]
            }
          },
          // Disable autoplay at the WebTorrent level
          autoplay: false
        }
        
        this.webtorrentClient = new (window as any).WebTorrent(webTorrentConfig)
        console.log('✅ WebTorrent client initialized with proper STUN config')
      } else {
        console.log('⏳ Waiting for WebTorrent to load...')
        // Wait for WebTorrent to load
        const checkWebTorrent = () => {
          if ((window as any).WebTorrent) {
            const webTorrentConfig = {
              tracker: {
                rtcConfig: {
                  iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' }
                  ]
                }
              },
              // Disable autoplay at the WebTorrent level
              autoplay: false
            }
            
            this.webtorrentClient = new (window as any).WebTorrent(webTorrentConfig)
            console.log('✅ WebTorrent client initialized (delayed) with proper STUN config')
          } else {
            setTimeout(checkWebTorrent, 100)
          }
        }
        setTimeout(checkWebTorrent, 100)
      }
    } catch (error) {
      console.error('❌ Failed to initialize WebTorrent:', error)
    }
  }

  private loadExistingUserSync() {
    try {
      const userProfile = localStorage.getItem('pigeon:user.profile')
      if (userProfile) {
        this.currentUser = JSON.parse(userProfile)
        console.log('👤 Loaded existing user from localStorage:', this.currentUser?.username)
      }
    } catch (error) {
      console.error('Failed to load user from localStorage:', error)
    }
  }

  private async loadExistingUser() {
    try {
      console.log('🔐 Loading existing user...')
      
      // Try localStorage first for quick access
      const userProfile = localStorage.getItem('pigeon:user.profile')
      if (userProfile) {
        this.currentUser = JSON.parse(userProfile)
        console.log('👤 Loaded user profile from localStorage:', this.currentUser?.username)
      }
      
      // Validate UnSea keys exist
      const unSeaKeypair = await loadKeys('user')
      if (unSeaKeypair) {
        console.log('🔐 Validated UnSea keypair exists')
      } else if (this.currentUser) {
        console.log('⚠️ User profile exists but no UnSea keypair found')
      }
      
    } catch (error) {
      console.error('Failed to load existing user:', error)
    }
  }

  private async initializePeerPigeon() {
    try {
      console.log('🕊️ Initializing PeerPigeon mesh...')
      console.log('🌐 Using signaling server:', this.signalingServerUrl)
      
      // Initialize the mesh
      this.mesh = new PeerPigeonMesh()
      
      // Create distributed storage manager 
      const storageManager = new DistributedStorageManager(this.mesh)
      
      // Use the storage manager methods that actually exist
      this.storage = {
        get: (key: string) => storageManager.retrieve(key),
        put: async (key: string, value: any) => { 
          await storageManager.store(key, value)
        },
        delete: async (key: string) => { 
          await storageManager.delete(key)
        },
        list: async (_prefix?: string) => {
          // Fallback implementation since list might not exist
          return []
        }
      }
      
      console.log('✅ PeerPigeon mesh initialized successfully')
      this.isInitialized = true
      
    } catch (error) {
      console.error('❌ Failed to initialize PeerPigeon mesh:', error)
      this.storage = this.createFallbackStorage()
      this.isInitialized = true
    }
  }

  private createFallbackStorage(): StorageInterface {
    return {
      async get(key: string): Promise<any> {
        const value = localStorage.getItem(`pigeon:storage.${key}`)
        return value ? JSON.parse(value) : null
      },
      
      async put(key: string, value: any): Promise<void> {
        localStorage.setItem(`pigeon:storage.${key}`, JSON.stringify(value))
      },
      
      async delete(key: string): Promise<void> {
        localStorage.removeItem(`pigeon:storage.${key}`)
      },
      
      async list(prefix?: string): Promise<string[]> {
        const keys: string[] = []
        const storagePrefix = `pigeon:storage.${prefix || ''}`
        
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i)
          if (key && key.startsWith(storagePrefix)) {
            keys.push(key.replace('pigeon:storage.', ''))
          }
        }
        
        return keys
      }
    }
  }

  private async ensureInitialized() {
    if (!this.isInitialized) {
      await this.initializePeerPigeon()
    }
  }

  async generateKeypair(): Promise<{publicKey: string, privateKey: string}> {
    // Generate UnSea keypair instead since PeerPigeon mesh doesn't have generateKeypair
    const keypair = await generateRandomPair()
    return {
      publicKey: keypair.pub,
      privateKey: keypair.priv
    }
  }

  async createUser(username: string, displayName?: string): Promise<UserProfile> {
    await this.ensureInitialized()

    // Generate new keypair for the user
    const keypair = await this.generateKeypair()
    
    // Generate UnSea keypair for encryption
    console.log('🔐 Generating UnSea keypair for user...')
    const unSeaKeypair = await generateRandomPair()
    console.log('✅ UnSea keypair generated:', {
      hasPub: !!unSeaKeypair.pub,
      hasEpub: !!unSeaKeypair.epub,
      hasPriv: !!unSeaKeypair.priv,
      hasEpriv: !!unSeaKeypair.epriv
    })
    
    const user: UserProfile = {
      id: keypair.publicKey, // Use public key as user ID
      username,
      displayName: displayName || username,
      createdAt: Date.now(),
      publicKey: keypair.publicKey
    }

    // Store user profile LOCALLY - this should never depend on distributed storage!
    localStorage.setItem('pigeon:user.profile', JSON.stringify(user))
    localStorage.setItem('pigeon:user.keypair', JSON.stringify(keypair))
    localStorage.setItem('pigeon:user.unsea_keypair', JSON.stringify(unSeaKeypair))
    
    // Use UnSea's saveKeys function to store the keypair persistently
    await saveKeys('user', unSeaKeypair)
    console.log('💾 Stored user profile locally and saved keypair with UnSea persistent storage')
    
    this.currentUser = user
    return user
  }

  async getCurrentUser(): Promise<UserProfile | null> {
    return this.currentUser
  }

  async getCurrentUserUnSeaKeypair(): Promise<any | null> {
    try {
      // Try to get from UnSea persistent storage first
      const unSeaKeypair = await loadKeys('user')
      if (unSeaKeypair) {
        return unSeaKeypair
      }
      
      // Fallback to localStorage if UnSea fails
      const stored = localStorage.getItem('pigeon:user.unsea_keypair')
      if (stored) {
        return JSON.parse(stored)
      }
      
      return null
    } catch (error) {
      console.error('Error getting current user UnSea keypair:', error)
      return null
    }
  }

  async isFirstTimeUser(): Promise<boolean> {
    // Quick synchronous check first
    const hasLocalProfile = localStorage.getItem('pigeon:user.profile') !== null
    if (hasLocalProfile) {
      return false // Definitely not first time if we have local profile
    }
    
    // If no local profile, check UnSea storage for validation
    try {
      const hasUnSeaKeys = await loadKeys('user') !== null
      return !hasUnSeaKeys
    } catch (error) {
      // If there's an error loading, assume first time user
      return true
    }
  }

  async logout() {
    // Clear UnSea persistent storage
    await clearKeys('user')
    
    // Clear local storage
    localStorage.removeItem('pigeon:user.profile')
    localStorage.removeItem('pigeon:user.keypair')
    localStorage.removeItem('pigeon:user.unsea_keypair')
    
    this.currentUser = null
    console.log('👋 User logged out and storage cleared')
  }

  async createPost(content: string, image?: string, videoFile?: File): Promise<Post> {
    if (!this.currentUser) {
      throw new Error('Must be logged in to create posts')
    }

    const postId = crypto.randomUUID()
    const now = new Date()
    
    console.log('📝 [createPost] Creating post with:', {
      content: content.substring(0, 30) + '...',
      hasImage: !!image,
      hasVideoFile: !!videoFile,
      videoFileName: videoFile?.name,
      videoFileSize: videoFile?.size
    })
    
    // Handle video upload if provided
    let videoMagnetURI: string | undefined = undefined
    if (videoFile) {
      console.log('🎥 [createPost] Processing video file...')
      try {
        videoMagnetURI = await this.createVideoTorrent(videoFile)
        console.log('🎥 [createPost] Video torrent created:', videoMagnetURI.substring(0, 50) + '...')
      } catch (error) {
        console.error('❌ [createPost] Failed to create video torrent:', error)
        throw new Error('Failed to process video file')
      }
    }
    
    const post: Post = {
      id: postId,
      content,
      image,
      video: videoMagnetURI,
      author: this.currentUser.publicKey,
      authorName: this.currentUser.displayName || this.currentUser.username || 'Anonymous',
      timestamp: now.getTime(),
      likes: 0,
      comments: []
    }

    console.log('📝 [createPost] Created post object:', {
      id: postId,
      content: content.substring(0, 50) + '...',
      author: this.currentUser.publicKey.substring(0, 8) + '...',
      hasVideo: !!post.video
    })

    // Store the post in localStorage (like messages)
    const postKey = `pigeon:posts.${postId}`
    localStorage.setItem(postKey, JSON.stringify(post))
    console.log('📝 Stored post in localStorage')

    // Add to user's post index in localStorage
    const userPostsKey = `pigeon:user_posts.${this.currentUser.publicKey}`
    const existingPosts = JSON.parse(localStorage.getItem(userPostsKey) || '[]')
    existingPosts.unshift(postId)
    localStorage.setItem(userPostsKey, JSON.stringify(existingPosts.slice(0, 100))) // Keep only latest 100
    console.log('📝 Updated user posts index, total:', existingPosts.length)

    // Also store in distributed storage for sharing (fallback)
    try {
      await this.storage?.put(`posts.${postId}`, post)
      console.log('📝 Also stored in distributed storage for sharing')
      
      // Update user's timeline in distributed storage
      const timelineKey = `timeline.${this.currentUser.publicKey}.${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}`
      const existingTimeline = await this.storage?.get(timelineKey) || []
      
      existingTimeline.unshift({
        id: postId,
        timestamp: now.getTime(),
        summary: content.substring(0, 100)
      })

      await this.storage?.put(timelineKey, existingTimeline)
      console.log('📝 Updated distributed timeline:', timelineKey, 'with', existingTimeline.length, 'posts')
    } catch (error) {
      console.log('📝 Failed to store in distributed storage (continuing with localStorage):', error)
    }

    // Update local user posts for immediate display
    if (this.currentUser) {
      if (!this.currentUser.posts) this.currentUser.posts = []
      this.currentUser.posts.unshift(post)
      console.log('📝 Updated local user posts, total:', this.currentUser.posts.length)
    }

    // Share this post with connected friends automatically
    this.sharePostWithFriends(post)

    return post
  }

  private async sharePostWithFriends(post: Post): Promise<void> {
    try {
      console.log('📤 Sharing post with friends via friendService')
      const { friendService } = await import('./friendService')
      await friendService.sharePostWithFriends(post)
      console.log('📤 Post shared with friends successfully')
    } catch (error) {
      console.error('Failed to share post with friends:', error)
    }
  }

  async getFeedPosts(): Promise<Post[]> {
    console.log('📰 Getting feed posts...')
    
    const posts: Post[] = []
    const postIds = new Set<string>()

    // Get current user's posts first
    if (this.currentUser) {
      const userPostsKey = `pigeon:user_posts.${this.currentUser.publicKey}`
      const userPostIds = JSON.parse(localStorage.getItem(userPostsKey) || '[]')
      
      for (const postId of userPostIds) {
        const postJson = localStorage.getItem(`pigeon:posts.${postId}`)
        if (postJson && !postIds.has(postId)) {
          const post = JSON.parse(postJson)
          posts.push(post)
          postIds.add(postId)
        }
      }
      console.log('📰 Added', userPostIds.length, 'posts from current user')
    }

    // Get posts from friends/shared posts
    try {
      // Load shared posts from localStorage
      const sharedPostsKey = `pigeon:shared_posts`
      const sharedPostIds = JSON.parse(localStorage.getItem(sharedPostsKey) || '[]')
      
      for (const postId of sharedPostIds) {
        const postJson = localStorage.getItem(`pigeon:posts.${postId}`)
        if (postJson && !postIds.has(postId)) {
          const post = JSON.parse(postJson)
          posts.push(post)
          postIds.add(postId)
        }
      }
      console.log('📰 Added', sharedPostIds.length, 'shared posts from friends/followers')
    } catch (error) {
      console.error('Failed to get shared posts:', error)
    }

    // Sort by timestamp (most recent first)
    posts.sort((a, b) => b.timestamp - a.timestamp)
    
    console.log('📰 Returning', posts.length, 'total posts for feed')
    
    // Only re-seed videos once per session, not every time getFeedPosts is called
    if (!this.hasReseededThisSession) {
      this.hasReseededThisSession = true
      // Re-seed any video posts after loading feed (async, don't block)
      this.reseedVideos().catch(error => {
        console.error('Failed to re-seed videos:', error)
      })
    }
    
    return posts.slice(0, 50) // Limit to 50 posts
  }

  async getPostsByUser(publicKey: string): Promise<Post[]> {
    console.log('👤 Getting posts by user:', publicKey.substring(0, 8) + '...')
    
    const posts: Post[] = []
    const userPostsKey = `pigeon:user_posts.${publicKey}`
    const postIds = JSON.parse(localStorage.getItem(userPostsKey) || '[]')
    
    for (const postId of postIds) {
      const postJson = localStorage.getItem(`pigeon:posts.${postId}`)
      if (postJson) {
        posts.push(JSON.parse(postJson))
      }
    }
    
    // Try distributed storage as fallback
    try {
      const distributedPosts = await this.storage?.get(`user_posts.${publicKey}`) || []
      for (const post of distributedPosts) {
        if (!posts.find(p => p.id === post.id)) {
          posts.push(post)
        }
      }
    } catch (error) {
      console.log('Failed to get posts from distributed storage:', error)
    }
    
    // Sort by timestamp (most recent first)
    posts.sort((a, b) => b.timestamp - a.timestamp)
    
    console.log('👤 Found', posts.length, 'posts for user')
    return posts
  }

  // Re-seed all video posts after refresh (both poster and followers)
  async reseedVideos(): Promise<void> {
    // Prevent multiple simultaneous re-seeding attempts
    if (this.isReseeding) {
      console.log('🌱 Re-seeding already in progress, skipping...')
      return
    }
    
    this.isReseeding = true
    console.log('🌱 Re-seeding all video posts after refresh...')
    
    try {
      if (!this.webtorrentClient) {
        console.log('❌ WebTorrent client not available for re-seeding')
        return
      }

      // Get all posts from localStorage
      const allPosts: Post[] = []
      
      // Get current user's posts
      if (this.currentUser) {
        const userPostsKey = `pigeon:user_posts.${this.currentUser.publicKey}`
        const userPostIds = JSON.parse(localStorage.getItem(userPostsKey) || '[]')
        
        for (const postId of userPostIds) {
          const postJson = localStorage.getItem(`pigeon:posts.${postId}`)
          if (postJson) {
            const post = JSON.parse(postJson)
            if (post.video) {
              allPosts.push(post)
            }
          }
        }
      }

      // Also check for shared posts with videos
      const sharedPostsKey = `pigeon:shared_posts`
      const sharedPostIds = JSON.parse(localStorage.getItem(sharedPostsKey) || '[]')
      
      for (const postId of sharedPostIds) {
        const postJson = localStorage.getItem(`pigeon:posts.${postId}`)
        if (postJson) {
          try {
            const post = JSON.parse(postJson)
            if (post.video && !allPosts.find(p => p.video === post.video)) {
              allPosts.push(post)
            }
          } catch (error) {
            console.error('Failed to parse shared post:', error)
          }
        }
      }

      console.log(`🌱 Found ${allPosts.length} video posts with potentially duplicate magnet URIs`)

      // Track which magnet URIs we've already processed to avoid duplicates
      const processedMagnets = new Set<string>()

      // Re-seed each unique video torrent (not each post)
      for (const post of allPosts) {
        try {
          const magnetUri = post.video
          if (!magnetUri) {
            console.log(`⚠️ Post ${post.id} has no video magnet URI, skipping`)
            continue
          }
          
          // Skip if we've already processed this magnet URI
          if (processedMagnets.has(magnetUri)) {
            console.log(`🔄 Magnet URI already processed for another post, skipping ${post.id}`)
            continue
          }
          
          processedMagnets.add(magnetUri)
          console.log(`🌱 Re-seeding video for post ${post.id}:`, magnetUri.substring(0, 50) + '...')
          
          // Check if already being torrented
          const existingTorrent = this.webtorrentClient.get(magnetUri)
          if (existingTorrent) {
            console.log(`🌱 Post ${post.id} already being seeded, ensuring it has the video file`)
            
            // Make sure the existing torrent actually has video files
            if (existingTorrent.files && existingTorrent.files.length > 0) {
              const videoFile = existingTorrent.files.find((file: any) => 
                file.name.toLowerCase().match(/\.(mp4|avi|mkv|mov|wmv|flv|webm)$/)
              )
              if (videoFile) {
                console.log(`✅ Post ${post.id} is already properly seeded with video file`)
                continue
              }
            }
            
            // If torrent exists but is broken, destroy and re-seed
            console.log(`🔧 Post ${post.id} torrent exists but is broken, destroying and re-seeding`)
            existingTorrent.destroy()
            this.activeTorrents.delete(existingTorrent.infoHash)
          }

          // Try to get the stored video file from IndexedDB for re-seeding
          const storedFile = await this.getStoredVideoFile(magnetUri)
          
          if (storedFile) {
            console.log(`🌱 Found stored video file for post ${post.id}, re-seeding from storage`)
            
            // Re-seed using the stored file
            const torrent = this.webtorrentClient.seed(storedFile, {
              name: storedFile.name,
              announce: [
                'wss://tracker.btorrent.xyz',
                'wss://tracker.openwebtorrent.com'
              ]
            })

            torrent.on('ready', () => {
              console.log(`🌱 Successfully re-seeding post ${post.id} from stored file (${torrent.files.length} files)`)
            })

            torrent.on('error', (error: any) => {
              console.error(`❌ Error re-seeding post ${post.id} from stored file:`, error)
            })

            this.activeTorrents.set(post.id, torrent)
          } else {
            // For shared posts (followers), don't try to re-seed, just add for potential streaming
            if (post.id.startsWith('shared_')) {
              console.log(`ℹ️ Post ${post.id} is a shared post - adding torrent for streaming only (no re-seeding)`)
              
              try {
                // Add torrent for streaming without expecting to seed
                const torrent = this.webtorrentClient.add(magnetUri, {
                  announce: [
                    'wss://tracker.btorrent.xyz',
                    'wss://tracker.openwebtorrent.com'
                  ]
                })
                
                torrent.on('ready', () => {
                  console.log(`📺 Shared post ${post.id} ready for streaming (${torrent.files.length} files)`)
                })
                
                torrent.on('error', (error: any) => {
                  console.error(`❌ Error adding shared post ${post.id} for streaming:`, error)
                })
                
                this.activeTorrents.set(post.id, torrent)
              } catch (error) {
                console.error(`❌ Failed to add shared post ${post.id} for streaming:`, error)
              }
            } else {
              console.log(`⚠️ No stored video file found for user post ${post.id}, cannot re-seed after refresh`)
              console.log(`ℹ️ This is expected for videos you haven't created yourself`)
            }
          }

        } catch (error) {
          console.error(`❌ Failed to re-seed post ${post.id}:`, error)
        }
      }
      
      console.log(`✅ Re-seeding completed: processed ${processedMagnets.size} unique magnet URIs from ${allPosts.length} posts`)
    } finally {
      this.isReseeding = false
    }
  }

  // Store video file persistently for re-seeding
  private async storeVideoFile(magnetUri: string, file: File | Blob, fileName: string): Promise<void> {
    try {
      const db = await this.openVideoStorage()
      const transaction = db.transaction(['videos'], 'readwrite')
      const store = transaction.objectStore('videos')
      
      return new Promise((resolve, reject) => {
        const request = store.put({
          magnetUri,
          file,
          fileName,
          storedAt: Date.now()
        })
        
        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          console.log(`💾 Stored video file for re-seeding:`, fileName)
          resolve()
        }
      })
    } catch (error) {
      console.error('Failed to store video file:', error)
      throw error
    }
  }

  // Get stored video file for re-seeding
  private async getStoredVideoFile(magnetUri: string): Promise<File | null> {
    try {
      const db = await this.openVideoStorage()
      const transaction = db.transaction(['videos'], 'readonly')
      const store = transaction.objectStore('videos')
      
      return new Promise((resolve, reject) => {
        const request = store.get(magnetUri)
        
        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          const result = request.result
          if (result && result.file) {
            console.log(`💾 Retrieved stored video file:`, result.fileName)
            resolve(new File([result.file], result.fileName))
          } else {
            resolve(null)
          }
        }
      })
    } catch (error) {
      console.error('Failed to get stored video file:', error)
      return null
    }
  }

  // Open IndexedDB for video storage
  private async openVideoStorage(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('PigeonSocialVideos', 1)
      
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result)
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        if (!db.objectStoreNames.contains('videos')) {
          const store = db.createObjectStore('videos', { keyPath: 'magnetUri' })
          store.createIndex('fileName', 'fileName', { unique: false })
        }
      }
    })
  }

  async updatePost(postId: string, updates: Partial<Post>): Promise<void> {
    // Get the post from localStorage
    const postJson = localStorage.getItem(`pigeon:posts.${postId}`)
    if (!postJson) {
      throw new Error('Post not found')
    }

    const post = JSON.parse(postJson)
    const updatedPost = { ...post, ...updates }

    // Update in localStorage
    localStorage.setItem(`pigeon:posts.${postId}`, JSON.stringify(updatedPost))

    // Also update in distributed storage
    try {
      await this.storage?.put(`posts.${postId}`, updatedPost)
    } catch (error) {
      console.error('Failed to update post in distributed storage:', error)
    }
  }

  async addComment(postId: string, content: string): Promise<void> {
    if (!this.currentUser) {
      throw new Error('Must be logged in to comment')
    }

    const comment: Post = {
      id: crypto.randomUUID(),
      content,
      author: this.currentUser.publicKey,
      authorName: this.currentUser.displayName || this.currentUser.username || 'Anonymous',
      timestamp: Date.now(),
      likes: 0,
      parentId: postId,
      comments: []
    }

    // Get the original post
    const postJson = localStorage.getItem(`pigeon:posts.${postId}`)
    if (!postJson) {
      throw new Error('Post not found')
    }

    const post = JSON.parse(postJson)
    if (!post.comments) {
      post.comments = []
    }
    post.comments.push(comment)

    // Update the post with the new comment
    localStorage.setItem(`pigeon:posts.${postId}`, JSON.stringify(post))

    // Also store the comment separately for easy retrieval
    localStorage.setItem(`pigeon:posts.${comment.id}`, JSON.stringify(comment))

    // Update in distributed storage
    try {
      await this.storage?.put(`posts.${postId}`, post)
      await this.storage?.put(`posts.${comment.id}`, comment)
    } catch (error) {
      console.error('Failed to store comment in distributed storage:', error)
    }

    // Share the updated post with friends
    this.shareCommentWithFriends(comment, post)
  }

  async getComments(postId: string): Promise<Post[]> {
    console.log('💬 Getting comments for post:', postId)

    // First try to get the post and its embedded comments
    let post: Post | null = null
    const postJson = localStorage.getItem(`pigeon:posts.${postId}`)
    if (postJson) {
      post = JSON.parse(postJson)
    } else {
      // Try distributed storage
      post = await this.storage?.get(`posts.${postId}`) || null
    }

    if (post && post.comments) {
      console.log('💬 Found', post.comments.length, 'comments in post object')
      return post.comments
    }

    // Fallback: search for comments by parentId (less efficient but comprehensive)
    const comments: Post[] = []
    
    try {
      // This is not ideal but we'll search through known posts for comments
      // In a real implementation, you'd have a comments index
      console.log('💬 Searching for orphaned comments (fallback method)')
      
      // This is a simplified search - in production you'd want a proper index
      return comments
    } catch (error) {
      console.error('Failed to get comments:', error)
      return []
    }
  }

  private async shareCommentWithFriends(_comment: Post, originalPost: Post): Promise<void> {
    try {
      console.log('💬 Sharing comment with friends')
      const { friendService } = await import('./friendService')
      
      // Share the updated original post (which now contains the new comment)
      await friendService.sharePostWithFriends(originalPost)
      console.log('💬 Updated post with comment shared with friends')
    } catch (error) {
      console.error('Failed to share comment with friends:', error)
    }
  }

  // Video torrent methods following wt.js pattern exactly
  private async createVideoTorrent(videoFile: File): Promise<string> {
    if (!this.webtorrentClient) {
      throw new Error('WebTorrent client not initialized')
    }

    console.log('🎥 Creating video torrent for file:', videoFile.name, 'size:', videoFile.size)

    // First, check if we already have a torrent for this exact file
    // Create a simple hash from file properties to check for duplicates
    const fileKey = `${videoFile.name}-${videoFile.size}-${videoFile.lastModified}`
    
    // Check if we already have this torrent
    for (const [, torrentInfo] of this.activeTorrents.entries()) {
      if (torrentInfo.fileKey === fileKey) {
        console.log('🎥 Reusing existing torrent for file:', videoFile.name)
        return torrentInfo.magnetURI
      }
    }

    // Also check the WebTorrent client's existing torrents
    for (const torrent of this.webtorrentClient.torrents) {
      if (torrent.files && torrent.files.length > 0) {
        const torrentFile = torrent.files[0]
        if (torrentFile.name === videoFile.name && torrentFile.length === videoFile.size) {
          console.log('🎥 Found existing torrent in WebTorrent client:', torrent.magnetURI.substring(0, 50) + '...')
          
          // Store it in our activeTorrents for future reference
          this.activeTorrents.set(torrent.infoHash, {
            magnetURI: torrent.magnetURI,
            fileName: videoFile.name,
            fileSize: videoFile.size,
            fileKey,
            createdAt: new Date()
          })
          
          return torrent.magnetURI
        }
      }
    }

    // ADDITIONAL CHECK: Look for torrents by name, but only if they have files
    // Sometimes torrents exist but are broken
    for (const torrent of this.webtorrentClient.torrents) {
      // Check if this torrent was created from the same file by comparing name
      if (torrent.name === videoFile.name) {
        // CRITICAL: Only reuse if the torrent actually has files
        if (torrent.files && torrent.files.length > 0) {
          console.log('🎥 Found existing working torrent by name:', torrent.magnetURI.substring(0, 50) + '...')
          
          // Store it in our activeTorrents for future reference
          this.activeTorrents.set(torrent.infoHash, {
            magnetURI: torrent.magnetURI,
            fileName: videoFile.name,
            fileSize: videoFile.size,
            fileKey,
            createdAt: new Date()
          })
          
          return torrent.magnetURI
        } else {
          // This torrent is broken - destroy it and create a new one
          console.log('🔧 Found broken torrent by name, destroying it:', torrent.magnetURI.substring(0, 50) + '...')
          torrent.destroy()
          this.activeTorrents.delete(torrent.infoHash)
          // Continue to create a new one
        }
      }
    }

    return new Promise((resolve, reject) => {
      // Set a timeout for torrent creation
      const timeout = setTimeout(() => {
        reject(new Error('Torrent creation timeout'))
      }, 30000) // 30 second timeout

      let resolved = false

      // Define torrent options
      const torrentOpts = {
        name: videoFile.name,
        comment: 'PigeonSocial Video',
        createdBy: 'PigeonSocial v1.0',
        private: false,
        announceList: [
          ['wss://tracker.btorrent.xyz'],
          ['wss://tracker.openwebtorrent.com'],
          ['wss://tracker.fastcast.nz']
        ]
      }

      try {
        // Seed the file directly like wt.js does
        this.webtorrentClient.seed(videoFile, torrentOpts, (torrent: any) => {
          if (resolved) return
          resolved = true
          clearTimeout(timeout)
          
          const magnetURI = torrent.magnetURI
          const infoHash = torrent.infoHash
          
          // CRITICAL: Verify the torrent was seeded correctly with files
          console.log('🎥 Verifying seeded torrent - files:', torrent.files?.length || 0, 'ready:', torrent.ready)
          if (!torrent.files || torrent.files.length === 0) {
            console.error('❌ CRITICAL: Seeded torrent has no files immediately after creation!')
            reject(new Error('Torrent seeding failed - no files in created torrent'))
            return
          }
          
          // Verify we can find the video file
          const videoFileCheck = torrent.files.find((file: any) => 
            file.name.toLowerCase().match(/\.(mp4|avi|mkv|mov|wmv|flv|webm)$/)
          )
          
          if (!videoFileCheck) {
            console.error('❌ CRITICAL: Seeded torrent has files but no video file!')
            reject(new Error('Torrent seeding failed - no video file found'))
            return
          }
          
          console.log('✅ Torrent seeded correctly with video file:', videoFileCheck.name)
          
          // Store torrent info like wt.js
          this.activeTorrents.set(infoHash, {
            magnetURI,
            fileName: videoFile.name,
            fileSize: videoFile.size,
            fileKey, // Add the file key for duplicate detection
            createdAt: new Date()
          })

          console.log('✅ Video torrent created successfully:', {
            infoHash: infoHash.substring(0, 16) + '...',
            magnetURI: magnetURI.substring(0, 50) + '...',
            fileName: videoFile.name
          })
          
          // Store the video file for re-seeding after refresh
          this.storeVideoFile(magnetURI, videoFile, videoFile.name).catch(error => {
            console.error('Failed to store video file for re-seeding:', error)
          })
          
          resolve(magnetURI)
        })

        // Handle torrent creation errors specifically
        const errorHandler = (error: any) => {
          if (resolved) return
          resolved = true
          clearTimeout(timeout)
          console.error('❌ WebTorrent client error during torrent creation:', error)
          
          // If it's a duplicate torrent error, try to find and return the existing one
          if (error.message && error.message.includes('duplicate torrent')) {
            console.log('🎥 Duplicate torrent detected, searching for existing...')
            
            // Extract infoHash from error message
            const infoHashMatch = error.message.match(/([a-fA-F0-9]{40})/)
            if (infoHashMatch) {
              const infoHash = infoHashMatch[1]
              const existingTorrent = this.webtorrentClient.get(infoHash)
              
              if (existingTorrent) {
                console.log('🎥 Found existing torrent with infoHash:', infoHash)
                console.log('🎥 Existing torrent state - ready:', existingTorrent.ready, 'files:', existingTorrent.files?.length || 0, 'progress:', existingTorrent.progress)
                
                // Check if the existing torrent is broken (seeded but no files)
                if (existingTorrent.progress === 1 && (!existingTorrent.files || existingTorrent.files.length === 0)) {
                  console.log('🔧 Existing torrent is broken (no files despite progress=1), destroying and retrying...')
                  existingTorrent.destroy()
                  
                  // Wait a moment and retry the seed operation
                  setTimeout(() => {
                    console.log('🔧 Retrying seed operation after destroying broken torrent...')
                    this.webtorrentClient.seed(videoFile, torrentOpts, (newTorrent: any) => {
                      if (resolved) return
                      resolved = true
                      clearTimeout(timeout)
                      
                      const magnetURI = newTorrent.magnetURI
                      const infoHash = newTorrent.infoHash
                      
                      // Store torrent info like wt.js
                      this.activeTorrents.set(infoHash, {
                        magnetURI,
                        fileName: videoFile.name,
                        fileSize: videoFile.size,
                        fileKey,
                        createdAt: new Date()
                      })

                      console.log('✅ Video torrent recreated successfully after fixing broken duplicate')
                      resolve(magnetURI)
                    })
                  }, 1000)
                  return
                }
                
                // Store it in our activeTorrents for future reference
                this.activeTorrents.set(infoHash, {
                  magnetURI: existingTorrent.magnetURI,
                  fileName: videoFile.name,
                  fileSize: videoFile.size,
                  fileKey,
                  createdAt: new Date()
                })
                
                resolve(existingTorrent.magnetURI)
                return
              }
            }
            
            // Search through existing torrents to find a match
            for (const [, torrentInfo] of this.activeTorrents.entries()) {
              if (torrentInfo.fileName === videoFile.name && torrentInfo.fileSize === videoFile.size) {
                console.log('🎥 Found existing torrent for duplicate file')
                resolve(torrentInfo.magnetURI)
                return
              }
            }
          }
          
          reject(error)
        }

        // Listen for errors temporarily - use once to avoid accumulating listeners
        this.webtorrentClient.once('error', errorHandler)

      } catch (error) {
        if (resolved) return
        resolved = true
        clearTimeout(timeout)
        reject(error)
      }
    })
  }

  async addTorrentFromMagnet(magnetURI: string): Promise<void> {
    console.log('📥 addTorrentFromMagnet: FULL magnet URI:', magnetURI)
    
    if (!this.webtorrentClient) {
      throw new Error('WebTorrent client not initialized')
    }

    // Check if we already have this torrent
    const existingTorrent = this.webtorrentClient.get(magnetURI)
    if (existingTorrent) {
      console.log('📥 Torrent already exists:', existingTorrent.infoHash, 'for magnet:', magnetURI)
      console.log('📥 Existing torrent state:', {
        ready: existingTorrent.ready,
        files: existingTorrent.files?.length || 0,
        progress: existingTorrent.progress,
        numPeers: existingTorrent.numPeers
      })
      
      // If the torrent exists but has no files, it might be broken - destroy and re-add
      if (existingTorrent.ready && (!existingTorrent.files || existingTorrent.files.length === 0)) {
        console.log('🔧 Existing torrent is ready but broken (no files), destroying and re-adding...')
        existingTorrent.destroy()
        this.activeTorrents.delete(existingTorrent.infoHash)
        // Continue to add it again
      } else if (!existingTorrent.ready && existingTorrent.numPeers === 0) {
        console.log('🔧 Existing torrent not ready and no peers - might be stuck, destroying and re-adding...')
        existingTorrent.destroy()
        this.activeTorrents.delete(existingTorrent.infoHash)
        // Continue to add it again
      } else {
        // Torrent exists and is either working or still initializing
        console.log('📥 Using existing torrent - it seems to be working')
        return
      }
    } else {
      console.log('📥 No existing torrent found - this is likely a page refresh, will add new torrent')
    }

    console.log('📥 Adding/downloading torrent from magnet URI:', magnetURI.substring(0, 50) + '...')

    return new Promise((resolve, reject) => {
      this.webtorrentClient.add(magnetURI, (torrent: any) => {
        const infoHash = torrent.infoHash
        
        console.log('✅ Torrent added successfully:', {
          infoHash: infoHash.substring(0, 16) + '...',
          fileName: torrent.name || 'Unknown',
          files: torrent.files?.length || 0,
          ready: torrent.ready
        })
        
        // Store torrent info
        if (!this.activeTorrents.has(infoHash)) {
          this.activeTorrents.set(infoHash, {
            magnetURI,
            fileName: torrent.name || 'Unknown',
            fileSize: torrent.length || 0,
            createdAt: new Date()
          })
        }
        
        resolve()
      })

      // Longer timeout for downloading from peers
      setTimeout(() => {
        reject(new Error('Torrent add/download timeout - no peers available'))
      }, 45000) // 45 second timeout for downloading
    })
  }

  getTorrentStreamUrl(magnetURI: string): string | null {
    if (!this.webtorrentClient) {
      console.log('🎥 WebTorrent client not initialized')
      return null
    }

    const torrent = this.webtorrentClient.get(magnetURI)
    if (!torrent) {
      console.log('🎥 Torrent not found in client')
      return null
    }

    console.log('🎥 Torrent found, files:', torrent.files.length, 'ready:', torrent.ready)

    // Find the video file like wt.js does
    const videoFile = torrent.files.find((file: any) => 
      file.name.toLowerCase().match(/\.(mp4|avi|mkv|mov|wmv|flv|webm)$/)
    )

    if (!videoFile) {
      console.log('🎥 No video file found in torrent')
      return null
    }

    console.log('🎥 Video file found:', videoFile.name, 'length:', videoFile.length)

    // Check if torrent is ready and has sufficient data
    if (!torrent.ready) {
      console.log('🎥 Torrent not ready yet')
      throw new Error('Video is still downloading, please wait...')
    }

    try {
      // Follow wt.js pattern EXACTLY - NO BLOBS, NO renderTo, NO getBlobURL
      // In browser WebTorrent, we need to append the file to a video element
      console.log('🎥 Creating video stream using WebTorrent file.appendTo method')
      
      // WebTorrent browser files support appendTo method
      if (typeof videoFile.appendTo === 'function') {
        console.log('🎥 Using appendTo method')
        // Return a special marker that tells VideoPlayer to use appendTo
        return `webtorrent-file://${torrent.infoHash}/${videoFile.name}`
      }
      
      // If appendTo not available, try streamTo
      if (typeof videoFile.streamTo === 'function') {
        console.log('🎥 Using streamTo method')
        return `webtorrent-stream://${torrent.infoHash}/${videoFile.name}`
      }
      
      console.log('🎥 Available videoFile methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(videoFile)))
      throw new Error('No P2P streaming method available - need appendTo or streamTo')
      
    } catch (error) {
      console.error('❌ Failed to create stream URL:', error)
      throw new Error('Failed to prepare video for streaming: ' + (error as Error).message)
    }
  }

  // Get the actual video file for direct streaming - EXACTLY like wt.js
  getVideoFile(magnetURI: string): any | null {
    console.log('🎥 getVideoFile: FULL magnet URI:', magnetURI)
    
    if (!this.webtorrentClient) {
      console.log('🎥 getVideoFile: WebTorrent client not initialized')
      return null
    }

    const torrent = this.webtorrentClient.get(magnetURI)
    if (!torrent) {
      console.log('🎥 getVideoFile: Torrent not found in client for magnet:', magnetURI)
      return null
    }

    console.log('🎥 getVideoFile: Torrent found, ready:', torrent.ready, 'files:', torrent.files?.length || 0)
    console.log('🎥 getVideoFile: Torrent progress:', torrent.progress, 'downloaded:', torrent.downloaded, 'uploaded:', torrent.uploaded)
    console.log('🎥 getVideoFile: Torrent peers:', torrent.numPeers, 'wire count:', torrent.wires?.length || 0)

    // Don't destroy torrents that are still initializing!
    // Only destroy if it's been ready for a while but still has no files
    if (!torrent.files || torrent.files.length === 0) {
      if (torrent.ready) {
        // Torrent is ready but has no files - this is truly broken
        console.log('🎥 getVideoFile: Torrent is ready but has no files - this is BROKEN')
        console.log('🔧 getVideoFile: Destroying broken ready torrent with no files')
        torrent.destroy()
        this.activeTorrents.delete(torrent.infoHash)
        return null
      } else {
        // Torrent is still initializing - this is normal, just return null without destroying
        console.log('🎥 getVideoFile: Torrent is still initializing (not ready yet)')
        return null
      }
    }

    const videoFile = torrent.files.find((file: any) => 
      file.name.toLowerCase().match(/\.(mp4|avi|mkv|mov|wmv|flv|webm)$/)
    )

    if (videoFile) {
      console.log('🎥 getVideoFile: Found video file:', videoFile.name, 'length:', videoFile.length, 'downloaded:', videoFile.downloaded)
      console.log('🎥 getVideoFile: Video file methods available:', Object.getOwnPropertyNames(Object.getPrototypeOf(videoFile)))
    } else {
      console.log('🎥 getVideoFile: No video file found in torrent files')
      if (torrent.files?.length > 0) {
        console.log('🎥 getVideoFile: Available files:', torrent.files.map((f: any) => f.name))
      }
    }

    return videoFile || null
  }

  // Method to check if we have the original file for re-seeding
  canReseedVideo(magnetURI: string): boolean {
    // Check if we have this torrent info in our cache
    const torrent = this.webtorrentClient?.get(magnetURI)
    if (!torrent) return false

    // Check our activeTorrents cache for the file info
    const torrentInfo = this.activeTorrents.get(torrent.infoHash)
    return !!torrentInfo
  }

  // Check if torrent is currently being seeded (has files and is available for streaming)
  isTorrentBeingSeeded(magnetURI: string): boolean {
    if (!this.webtorrentClient) return false
    
    const torrent = this.webtorrentClient.get(magnetURI)
    if (!torrent) return false
    
    // Check if torrent has files and is ready for streaming
    return torrent.files && torrent.files.length > 0 && torrent.ready
  }

  // Enhanced method to wait for video file to be available
  async waitForVideoFile(magnetURI: string, timeoutMs: number = 10000): Promise<any | null> {
    if (!this.webtorrentClient) {
      throw new Error('WebTorrent client not initialized')
    }

    const torrent = this.webtorrentClient.get(magnetURI)
    if (!torrent) {
      throw new Error('Torrent not found in client')
    }

    console.log('🎥 waitForVideoFile: Waiting for video file to be available...')
    console.log('🎥 waitForVideoFile: Torrent state - ready:', torrent.ready, 'files:', torrent.files?.length || 0, 'progress:', torrent.progress)

    // CRITICAL FIX: If this is a seeded torrent (progress = 1), the files should be immediately available
    // If files is 0 but progress is 1, something is wrong with the torrent state
    if (torrent.progress === 1 && (!torrent.files || torrent.files.length === 0)) {
      console.log('❌ waitForVideoFile: Seeded torrent has no files - attempting to fix...')
      
      // Try to remove and re-add the torrent to fix the broken state
      try {
        console.log('🔧 waitForVideoFile: Removing broken torrent and will re-add...')
        torrent.destroy()
        
        // Wait a moment for cleanup
        await new Promise(resolve => setTimeout(resolve, 1000))
        
        // Re-add the torrent
        console.log('🔧 waitForVideoFile: Re-adding torrent from magnet URI...')
        await this.addTorrentFromMagnet(magnetURI)
        
        // Get the new torrent instance
        const newTorrent = this.webtorrentClient.get(magnetURI)
        if (newTorrent && newTorrent.files && newTorrent.files.length > 0) {
          const videoFile = newTorrent.files.find((file: any) => 
            file.name.toLowerCase().match(/\.(mp4|avi|mkv|mov|wmv|flv|webm)$/)
          )
          if (videoFile) {
            console.log('✅ waitForVideoFile: Fixed broken torrent!')
            return videoFile
          }
        }
        
        console.log('❌ waitForVideoFile: Failed to fix broken torrent')
        throw new Error('Unable to recover broken seeded torrent')
        
      } catch (error) {
        console.error('❌ waitForVideoFile: Error trying to fix broken torrent:', error)
        throw new Error('Seeded torrent has no accessible files and cannot be recovered')
      }
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        console.log('❌ waitForVideoFile: Timeout reached')
        reject(new Error('Timeout waiting for video file'))
      }, timeoutMs)

      const checkForFile = () => {
        const videoFile = this.getVideoFile(magnetURI)
        if (videoFile) {
          clearTimeout(timeout)
          console.log('✅ waitForVideoFile: Video file is now available!')
          resolve(videoFile)
          return
        }

        // If torrent has files but no video file, it's not a video torrent
        if (torrent.files && torrent.files.length > 0) {
          clearTimeout(timeout)
          console.log('❌ waitForVideoFile: Torrent has files but no video file found')
          console.log('🎥 waitForVideoFile: Available files:', torrent.files.map((f: any) => f.name))
          reject(new Error('No video file found in torrent'))
          return
        }

        // Keep checking
        setTimeout(checkForFile, 500)
      }

      // Start checking immediately
      checkForFile()

      // Listen for various torrent events that might help
      const onReady = () => {
        console.log('🎥 waitForVideoFile: Torrent ready event fired')
        checkForFile()
      }

      const onMetadata = () => {
        console.log('🎥 waitForVideoFile: Torrent metadata event fired')
        checkForFile()
      }

      const onDone = () => {
        console.log('🎥 waitForVideoFile: Torrent done event fired')
        checkForFile()
      }

      // Add event listeners
      if (!torrent.ready) {
        torrent.once('ready', onReady)
      }
      
      torrent.once('metadata', onMetadata)
      torrent.once('done', onDone)

      // Cleanup function
      const cleanup = () => {
        torrent.removeListener('ready', onReady)
        torrent.removeListener('metadata', onMetadata)
        torrent.removeListener('done', onDone)
      }

      // Clean up on timeout
      setTimeout(cleanup, timeoutMs + 1000)
    })
  }

  // Add method to handle video streaming like wt.js
  async streamVideo(infoHash: string, range?: string): Promise<ReadableStream | null> {
    if (!this.webtorrentClient) {
      return null
    }

    const torrent = this.webtorrentClient.get(infoHash)
    if (!torrent) {
      return null
    }

    const videoFile = torrent.files.find((file: any) => 
      file.name.toLowerCase().match(/\.(mp4|avi|mkv|mov|wmv|flv|webm)$/)
    )

    if (!videoFile) {
      return null
    }

    try {
      // Create read stream like wt.js does
      if (range) {
        const parts = range.replace(/bytes=/, "").split("-")
        const start = parseInt(parts[0], 10)
        const end = parts[1] ? parseInt(parts[1], 10) : videoFile.length - 1
        
        return videoFile.createReadStream({ start, end })
      } else {
        return videoFile.createReadStream()
      }
    } catch (error) {
      console.error('❌ Failed to create video stream:', error)
      return null
    }
  }

  // Add a method to get torrent download progress
  getTorrentProgress(magnetURI: string): { progress: number; downloaded: number; total: number } | null {
    if (!this.webtorrentClient) {
      return null
    }

    const torrent = this.webtorrentClient.get(magnetURI)
    if (!torrent) {
      return null
    }

    return {
      progress: torrent.progress,
      downloaded: torrent.downloaded,
      total: torrent.length
    }
  }
}

export const pigeonSocial = new PigeonSocialService()
