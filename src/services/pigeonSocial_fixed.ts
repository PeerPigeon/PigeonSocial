// import { PeerPigeonMesh, DistributedStorageManager } from 'peerpigeon'
import { PeerPigeonMesh, DistributedStorageManager } from '../lib/peerpigeon-browser'
import { config } from '../config'
import { generateRandomPair, save, recall, clear, saveKeys, loadKeys, clearKeys } from 'unsea'

export interface UserProfile {
  id: string
  username: string
  displayName?: string
  avatar?: string
  createdAt: number
  publicKey: string
}

export interface Post {
  id: string
  author: string
  content: string
  timestamp: number
  likes: number
  replies: number
  parentId?: string // For replies
  sharedBy?: string // Username of the person who shared this post
  originalAuthor?: string // Original author for shared posts
}

export class PigeonSocialService {
  private mesh: PeerPigeonMesh | null = null
  private storage: DistributedStorageManager | null = null
  private currentUser: UserProfile | null = null
  private isInitialized: boolean = false
  private signalingServerUrl: string

  constructor() {
    // Get signaling server URL from config
    this.signalingServerUrl = config.signaling.serverUrl
    console.log('Signaling server URL:', this.signalingServerUrl)
    
    // Load existing user immediately using UnSea's recall function
    this.loadExistingUser()
    
    // Initialize distributed storage in background for social features
    this.initializePeerPigeon()
  }

  private loadExistingUser() {
    try {
      // Use UnSea's recall function - just like Gun's user.recall()!
      const recalledKeypair = recall('user')
      if (recalledKeypair) {
        // Also load the profile data from localStorage
        const storedProfile = localStorage.getItem('pigeon:user.profile')
        if (storedProfile) {
          this.currentUser = JSON.parse(storedProfile)
          console.log('✅ Recalled existing user with UnSea:', this.currentUser?.username)
        } else {
          console.log('ℹ️ Keypair found but no profile data')
        }
      } else {
        console.log('ℹ️ No existing user found in UnSea session storage')
      }
    } catch (error) {
      console.error('Error recalling existing user with UnSea:', error)
    }
  }

  private async initializePeerPigeon() {
    try {
      console.log('🔄 Initializing PeerPigeon distributed storage...')
      
      // Initialize distributed storage manager
      this.storage = new DistributedStorageManager({
        enableWebDHT: true,
        persistToDisk: true,
        replicationFactor: 3 // Store on multiple peers for redundancy
      })
      
      // Debug: Check what methods are available
      console.log('📊 DistributedStorageManager methods:', Object.getOwnPropertyNames(this.storage))
      console.log('📊 DistributedStorageManager prototype methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(this.storage)))
      
      // Wait for storage to be ready if it has an init method
      if (typeof (this.storage as any).init === 'function') {
        await (this.storage as any).init()
      }
      
      // Test storage functionality
      console.log('🧪 Testing storage functionality...')
      if (typeof this.storage.get !== 'function' || typeof this.storage.put !== 'function') {
        throw new Error('Storage methods not available')
      }
      
      // Test with a simple operation
      await this.storage.put('test_key', 'test_value')
      const testResult = await this.storage.get('test_key')
      console.log('✅ Storage test successful:', testResult)
      await this.storage.delete('test_key')
      
      // Initialize mesh if not already done by friendService
      if (!this.mesh) {
        this.mesh = new PeerPigeonMesh({
          enableWebDHT: true,
          enableCrypto: false
        })
        await this.mesh.init()
      }

      this.isInitialized = true
      console.log('✅ PeerPigeon distributed storage initialized')
      
    } catch (error) {
      console.error('❌ Failed to initialize PeerPigeon distributed storage:', error)
      // Fallback to localStorage for development
      console.log('🔄 Falling back to localStorage...')
      this.storage = {
        get: async (key: string) => {
          const stored = localStorage.getItem(`pigeon:${key}`)
          return stored ? JSON.parse(stored) : null
        },
        put: async (key: string, value: any) => {
          localStorage.setItem(`pigeon:${key}`, JSON.stringify(value))
        },
        delete: async (key: string) => {
          localStorage.removeItem(`pigeon:${key}`)
        },
        list: async (prefix?: string) => {
          const keys = []
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i)
            if (key?.startsWith(`pigeon:${prefix || ''}`)) {
              keys.push(key.replace('pigeon:', ''))
            }
          }
          return keys
        }
      } as DistributedStorageManager
      this.isInitialized = true
    }
  }

  async ensureInitialized() {
    if (!this.isInitialized) {
      await this.initializePeerPigeon()
    }
  }

  async generateKeypair() {
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
    
    // Use UnSea's save function to store the keypair in session storage for recall
    save(unSeaKeypair, 'user')
    console.log('💾 Stored user profile locally and saved keypair with UnSea')
    
    this.currentUser = user
    return user
  }

  async getCurrentUser(): Promise<UserProfile | null> {
    return this.currentUser
  }

  async logout() {
    // Clear UnSea session storage
    clear('user')
    
    // Clear local storage
    localStorage.removeItem('pigeon:user.profile')
    localStorage.removeItem('pigeon:user.keypair')
    localStorage.removeItem('pigeon:user.unsea_keypair')
    
    this.currentUser = null
    console.log('👋 User logged out and session cleared')
  }

  async createPost(content: string, parentId?: string): Promise<Post> {
    await this.ensureInitialized()
    
    if (!this.currentUser) {
      throw new Error('No user logged in')
    }

    const post: Post = {
      id: `post_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      author: this.currentUser.username,
      content,
      timestamp: Date.now(),
      likes: 0,
      replies: 0,
      parentId
    }

    try {
      // Store post in distributed storage with multiple keys for efficient access
      await this.storage?.put(`posts.${post.id}`, post)
      
      // Store in user's timeline (organized by month for efficient retrieval)
      const date = new Date(post.timestamp)
      const timelineKey = `timeline.${this.currentUser.publicKey}.${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}`
      const timeline = await this.storage?.get(timelineKey) || []
      timeline.unshift({ id: post.id, timestamp: post.timestamp })
      await this.storage?.put(timelineKey, timeline)
      
      // Store in global timeline for discovery
      const globalKey = `global.posts.${date.toISOString().split('T')[0]}`
      const globalPosts = await this.storage?.get(globalKey) || []
      globalPosts.unshift({ id: post.id, author: post.author, timestamp: post.timestamp })
      await this.storage?.put(globalKey, globalPosts)
      
      // Update user's post list for backup
      const userPosts = await this.storage?.get(`user.${this.currentUser.id}.posts`) || []
      userPosts.push(post.id)
      await this.storage?.put(`user.${this.currentUser.id}.posts`, userPosts)
      
    } catch (error) {
      console.error('Failed to store post in distributed storage:', error)
    }

    console.log('📝 Created post:', post)
    return post
  }

  async getFeed(limit = 20): Promise<Post[]> {
    await this.ensureInitialized()
    
    if (!this.currentUser) return []

    const allPosts: Post[] = []

    // Get current user's posts
    const userPosts = await this.storage?.get(`user.${this.currentUser.id}.posts`) || []
    for (const postId of userPosts.slice(-10)) { // Limit own posts to recent 10
      const post = await this.storage?.get(`posts.${postId}`)
      if (post) allPosts.push(post)
    }

    // Get posts from friends and follows (from distributed timelines)
    try {
      const { friendService } = await import('./friendService')
      const friends = friendService.getFriends()
      const follows = friendService.getFollows()
      
      // Fetch recent posts from friends and follows
      for (const friend of friends) {
        const friendPosts = await this.getRecentPostsFromUser(friend.publicKey, 5)
        allPosts.push(...friendPosts)
      }
      
      for (const follow of follows) {
        const followPosts = await this.getRecentPostsFromUser(follow.publicKey, 3)
        allPosts.push(...followPosts)
      }
    } catch (error) {
      console.error('Failed to fetch social posts:', error)
    }

    // Add posts from followed posts feed (shared posts)
    try {
      const followedPosts = await this.storage?.get(`user.${this.currentUser.id}.followed_posts`) || []
      for (const postId of followedPosts.slice(-10)) {
        const post = await this.storage?.get(`posts.${postId}`)
        if (post && !allPosts.find(p => p.id === post.id)) {
          allPosts.push(post)
        }
      }
    } catch (error) {
      console.error('Failed to load followed posts:', error)
    }

    // Sort by timestamp (newest first) and limit
    allPosts.sort((a, b) => b.timestamp - a.timestamp)
    
    return allPosts.slice(0, limit)
  }

  // Get recent posts from a user's distributed timeline
  async getRecentPostsFromUser(publicKey: string, limit = 5): Promise<Post[]> {
    const posts: Post[] = []
    const now = new Date()
    
    try {
      // Look in current and previous month's timeline
      for (let monthOffset = 0; monthOffset < 3; monthOffset++) {
        const date = new Date(now.getFullYear(), now.getMonth() - monthOffset, 1)
        const timelineKey = `timeline.${publicKey}.${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}`
        
        const monthlyPosts = await this.storage?.get(timelineKey) || []
        
        // Get the most recent posts from this month
        for (const postInfo of monthlyPosts.slice(0, limit)) {
          try {
            const fullPost = await this.storage?.get(`posts.${postInfo.id}`)
            if (fullPost) {
              posts.push(fullPost)
            }
          } catch (error) {
            // Post might not be available in distributed storage yet
            console.log('Post not found in distributed storage:', postInfo.id)
          }
        }
        
        if (posts.length >= limit) break
      }
    } catch (error) {
      console.error('Failed to fetch posts from user timeline:', error)
    }
    
    return posts.slice(0, limit)
  }

  // Discover posts from the global timeline (for exploration)
  async discoverRecentPosts(days = 7, limit = 20): Promise<Post[]> {
    const posts: Post[] = []
    const now = new Date()
    
    try {
      for (let dayOffset = 0; dayOffset < days; dayOffset++) {
        const date = new Date(now.getTime() - dayOffset * 24 * 60 * 60 * 1000)
        const dateKey = `global.posts.${date.toISOString().split('T')[0]}`
        
        const dailyPosts = await this.storage?.get(dateKey) || []
        
        for (const postInfo of dailyPosts) {
          try {
            const fullPost = await this.storage?.get(`posts.${postInfo.id}`)
            if (fullPost && !posts.find(p => p.id === fullPost.id)) {
              posts.push(fullPost)
            }
          } catch (error) {
            // Skip posts that aren't available
          }
        }
        
        if (posts.length >= limit) break
      }
    } catch (error) {
      console.error('Failed to discover posts:', error)
    }
    
    // Sort by timestamp and limit
    posts.sort((a, b) => b.timestamp - a.timestamp)
    return posts.slice(0, limit)
  }

  // Refresh feed by pulling latest posts from friends/follows
  async refreshFeed(): Promise<void> {
    if (!this.currentUser) return

    try {
      const { friendService } = await import('./friendService')
      const friends = friendService.getFriends()
      const follows = friendService.getFollows()
      
      console.log('Refreshing feed for', friends.length, 'friends and', follows.length, 'follows')
      
      // Pre-fetch posts from friends and follows to cache them locally
      for (const friend of friends) {
        await this.getRecentPostsFromUser(friend.publicKey, 10)
      }
      
      for (const follow of follows) {
        await this.getRecentPostsFromUser(follow.publicKey, 5)
      }
      
      console.log('Feed refresh complete')
    } catch (error) {
      console.error('Failed to refresh feed:', error)
    }
  }

  async getPost(postId: string): Promise<Post | null> {
    await this.ensureInitialized()
    return await this.storage?.get(`posts.${postId}`) || null
  }

  async likePost(postId: string): Promise<void> {
    await this.ensureInitialized()
    
    const post = await this.getPost(postId)
    if (post) {
      post.likes++
      await this.storage?.put(`posts.${postId}`, post)
    }
  }

  async saveFollowedPost(post: Post): Promise<void> {
    if (!this.currentUser) return

    try {
      // Save the post itself
      await this.storage?.put(`posts.${post.id}`, post)
      
      // Add to user's followed posts feed
      const followedPosts = await this.storage?.get(`user.${this.currentUser.id}.followed_posts`) || []
      if (!followedPosts.includes(post.id)) {
        followedPosts.unshift(post.id) // Add to beginning
        await this.storage?.put(`user.${this.currentUser.id}.followed_posts`, followedPosts.slice(0, 100)) // Keep only latest 100
      }
    } catch (error) {
      console.error('Failed to save followed post:', error)
    }
  }
}

export const pigeonSocial = new PigeonSocialService()
