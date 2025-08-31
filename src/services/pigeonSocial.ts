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

  constructor() {
    // Get signaling server URL from config
    this.signalingServerUrl = config.signaling.serverUrl
    console.log('Signaling server URL:', this.signalingServerUrl)
    
    // Load existing user immediately from localStorage (synchronous)
    this.loadExistingUserSync()
    
    // Load UnSea keys in background and validate/complete the user profile
    this.loadExistingUser().catch(console.error)
    
    // Initialize distributed storage in background for social features
    this.initializePeerPigeon()
  }

  private loadExistingUserSync() {
    try {
      // First check localStorage for user profile (synchronous)
      const storedProfile = localStorage.getItem('pigeon:user.profile')
      if (storedProfile) {
        this.currentUser = JSON.parse(storedProfile)
        console.log('✅ Loaded existing user from localStorage (sync):', this.currentUser?.username)
      }
    } catch (error) {
      console.error('Error loading existing user from localStorage:', error)
    }
  }

  private async loadExistingUser() {
    try {
      // Use UnSea's loadKeys function for persistent storage validation
      const storedKeypair = await loadKeys('user')
      if (storedKeypair) {
        console.log('✅ Validated UnSea keys for existing user')
        
        // If we don't have a user profile yet, but we have keys, there might be an issue
        if (!this.currentUser) {
          const storedProfile = localStorage.getItem('pigeon:user.profile')
          if (storedProfile) {
            this.currentUser = JSON.parse(storedProfile)
            console.log('✅ Recovered user profile with UnSea validation:', this.currentUser?.username)
          } else {
            console.warn('⚠️ UnSea keys found but no user profile - this is unusual')
          }
        }
      } else if (this.currentUser) {
        console.warn('⚠️ User profile found but no UnSea keys - user may need to re-login')
        // Clear the invalid profile
        this.currentUser = null
        localStorage.removeItem('pigeon:user.profile')
      } else {
        console.log('ℹ️ No existing user found in UnSea storage')
      }
    } catch (error) {
      console.error('Error loading existing user with UnSea:', error)
    }
  }

  private async initializePeerPigeon() {
    try {
      console.log('🔄 Initializing PeerPigeon distributed storage...')
      
      // Initialize mesh first if not already done by friendService
      if (!this.mesh) {
        this.mesh = new PeerPigeonMesh({
          enableWebDHT: true,
          enableCrypto: false
        })
        await this.mesh.init()
      }

      // Initialize distributed storage manager with the mesh
      const distributedStorage = new DistributedStorageManager(this.mesh)
      
      // Wait for storage crypto to initialize
      await distributedStorage.waitForCrypto()
      
      // Create a wrapper that provides the get/put interface
      this.storage = {
        get: async (key: string) => {
          return await distributedStorage.retrieve(key)
        },
        put: async (key: string, value: any) => {
          await distributedStorage.store(key, value)
        },
        delete: async (key: string) => {
          await distributedStorage.delete(key)
        },
        list: async (_prefix?: string) => {
          // DistributedStorageManager doesn't have list, so this is a no-op
          console.warn('list() not implemented for DistributedStorageManager')
          return []
        }
      }
      
      console.log('📊 Using DistributedStorageManager with store/retrieve API')
      
      // Test storage functionality
      console.log('🧪 Testing storage functionality...')
      if (this.storage) {
        await this.storage.put('test_key', 'test_value')
        const testResult = await this.storage.get('test_key')
        console.log('✅ Storage test successful:', testResult)
        await this.storage.delete('test_key')
      }
      
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
        list: async (_prefix?: string) => {
          const keys = []
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i)
            if (key?.startsWith(`pigeon:${_prefix || ''}`)) {
              keys.push(key.replace('pigeon:', ''))
            }
          }
          return keys
        }
      }
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

  async createPost(content: string): Promise<Post> {
    if (!this.currentUser) {
      throw new Error('Must be logged in to create posts')
    }

    const postId = crypto.randomUUID()
    const now = new Date()
    
    const post: Post = {
      id: postId,
      content,
      author: this.currentUser.publicKey,
      authorName: this.currentUser.displayName || this.currentUser.username || 'Anonymous',
      timestamp: now.getTime(),
      likes: 0,
      comments: []
    }

    console.log('📝 Creating post:', {
      id: postId,
      content: content.substring(0, 50) + '...',
      author: this.currentUser.publicKey.substring(0, 8) + '...'
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

  async getFeed(limit = 20): Promise<Post[]> {
    await this.ensureInitialized()
    
    if (!this.currentUser) {
      console.log('📥 No current user for feed')
      return []
    }

    const allPosts: Post[] = []
    console.log('📥 Getting feed for user:', this.currentUser.username)
    console.log('📥 User ID:', this.currentUser.id)
    console.log('📥 User publicKey:', this.currentUser.publicKey.substring(0, 16) + '...')

    // Get current user's posts from localStorage (like messages)
    const userPostsKey = `pigeon:user_posts.${this.currentUser.publicKey}`
    const userPostIds = JSON.parse(localStorage.getItem(userPostsKey) || '[]')
    console.log('📥 User has', userPostIds.length, 'post IDs in localStorage')
    
    for (const postId of userPostIds.slice(0, 10)) { // Get latest 10 posts
      const postKey = `pigeon:posts.${postId}`
      const postJson = localStorage.getItem(postKey)
      if (postJson) {
        const post = JSON.parse(postJson)
        allPosts.push(post)
        console.log('📥 Loaded user post from localStorage:', post.content.substring(0, 50) + '...')
      }
    }

    // Get posts from friends and follows (from distributed timelines)
    try {
      const { friendService } = await import('./friendService')
      const friends = friendService.getFriends()
      const follows = friendService.getFollows()
      
      console.log('📥 Getting posts from', friends.length, 'friends and', follows.length, 'follows')
      
      // Fetch recent posts from friends and follows
      for (const friend of friends) {
        console.log('📥 Fetching posts from friend:', friend.userInfo.username)
        const friendPosts = await this.getRecentPostsFromUser(friend.publicKey, 5)
        console.log('📥 Got', friendPosts.length, 'posts from friend:', friend.userInfo.username)
        allPosts.push(...friendPosts)
      }
      
      for (const follow of follows) {
        console.log('📥 Fetching posts from follow:', follow.userInfo.username)
        const followPosts = await this.getRecentPostsFromUser(follow.publicKey, 3)
        console.log('📥 Got', followPosts.length, 'posts from follow:', follow.userInfo.username)
        allPosts.push(...followPosts)
      }
    } catch (error) {
      console.error('Failed to fetch social posts:', error)
    }

    // Add posts from followed posts feed (shared posts) from localStorage
    try {
      const followedPostsKey = `pigeon:followed_posts.${this.currentUser.publicKey}`
      console.log('📥 Looking for followed posts at key:', followedPostsKey)
      const followedPosts = JSON.parse(localStorage.getItem(followedPostsKey) || '[]')
      console.log('📥 User has', followedPosts.length, 'followed post IDs')
      
      for (const postId of followedPosts.slice(0, 10)) { // Get first 10 instead of last 10
        console.log('📥 Loading followed post:', postId)
        const postKey = `pigeon:posts.${postId}`
        const postJson = localStorage.getItem(postKey)
        if (postJson) {
          const post = JSON.parse(postJson)
          if (!allPosts.find(p => p.id === post.id)) {
            allPosts.push(post)
            console.log('📥 Loaded followed post from localStorage:', post.content.substring(0, 50) + '...')
          } else {
            console.log('📥 Followed post already in feed:', postId)
          }
        } else {
          console.log('📥 Followed post not found in localStorage:', postId)
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
    
    console.log('🔍 Looking for posts from user:', publicKey.substring(0, 8) + '...')
    
    try {
      // Look in current and previous month's timeline
      for (let monthOffset = 0; monthOffset < 3; monthOffset++) {
        const date = new Date(now.getFullYear(), now.getMonth() - monthOffset, 1)
        const timelineKey = `timeline.${publicKey}.${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}`
        
        console.log('🔍 Checking timeline key:', timelineKey)
        const monthlyPosts = await this.storage?.get(timelineKey) || []
        console.log('🔍 Found', monthlyPosts.length, 'posts in timeline for', timelineKey)
        
        // Get the most recent posts from this month
        for (const postInfo of monthlyPosts.slice(0, limit)) {
          try {
            const fullPost = await this.storage?.get(`posts.${postInfo.id}`)
            if (fullPost) {
              posts.push(fullPost)
              console.log('🔍 Loaded post:', fullPost.content.substring(0, 50) + '...')
            } else {
              console.log('🔍 Post not found:', postInfo.id)
            }
          } catch (error) {
            // Post might not be available in distributed storage yet
            console.log('🔍 Post not found in distributed storage:', postInfo.id)
          }
        }
        
        if (posts.length >= limit) break
      }
    } catch (error) {
      console.error('Failed to fetch posts from user timeline:', error)
    }
    
    console.log('🔍 Total posts found for user:', posts.length)
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

    console.log('💾 Saving followed post:', post.id, 'from author:', post.author.substring(0, 8) + '...')
    
    try {
      // Save the post itself to localStorage (like messages)
      const postKey = `pigeon:posts.${post.id}`
      localStorage.setItem(postKey, JSON.stringify(post))
      console.log('💾 Saved post to localStorage')
      
      // Add to user's followed posts feed in localStorage
      const followedPostsKey = `pigeon:followed_posts.${this.currentUser.publicKey}`
      const followedPosts = JSON.parse(localStorage.getItem(followedPostsKey) || '[]')
      console.log('💾 Current followed posts count:', followedPosts.length)
      
      if (!followedPosts.includes(post.id)) {
        followedPosts.unshift(post.id) // Add to beginning
        localStorage.setItem(followedPostsKey, JSON.stringify(followedPosts.slice(0, 100))) // Keep only latest 100
        console.log('💾 Added post to followed posts feed, new count:', followedPosts.length)
      } else {
        console.log('💾 Post already in followed posts feed')
      }

      // Also try to save to distributed storage (fallback)
      try {
        await this.storage?.put(`posts.${post.id}`, post)
        console.log('💾 Also saved to distributed storage')
      } catch (error) {
        console.log('💾 Failed to save to distributed storage (continuing with localStorage):', error)
      }
    } catch (error) {
      console.error('Failed to save followed post:', error)
    }
  }

  private async sharePostWithFriends(post: Post): Promise<void> {
    console.log('📤 Sharing new post with friends:', post.id)
    try {
      // Import friendService dynamically to avoid circular dependencies
      const { friendService } = await import('./friendService')
      await friendService.sharePostWithFriends(post)
    } catch (error) {
      console.error('Failed to share post with friends:', error)
    }
  }

  // Public storage methods for other services
  async getData(key: string): Promise<any> {
    console.log('🔍 getData called for key:', key)
    if (!this.storage) {
      console.log('❌ Storage not initialized in getData')
      return null
    }
    const result = await this.storage.get(key)
    console.log('🔍 getData result:', result ? 'data found' : 'no data', typeof result)
    return result
  }

  async storeData(key: string, value: any): Promise<void> {
    console.log('💾 storeData called for key:', key, 'value type:', typeof value)
    if (!this.storage) {
      console.log('❌ Storage not initialized in storeData')
      return
    }
    await this.storage.put(key, value)
    console.log('💾 storeData completed for key:', key)
  }

  async deleteData(key: string): Promise<void> {
    console.log('🗑️ deleteData called for key:', key)
    if (!this.storage) {
      console.log('❌ Storage not initialized in deleteData')
      return
    }
    await this.storage.delete(key)
    console.log('🗑️ deleteData completed for key:', key)
  }

  // Comment functionality
  async addComment(postId: string, content: string): Promise<Post | null> {
    if (!this.currentUser) {
      throw new Error('Must be logged in to add comments')
    }

    console.log('💬 Adding comment to post:', postId)
    
    // Extract original post ID if this is a shared post
    let originalPostId = postId
    if (postId.startsWith('shared_')) {
      // Extract the original ID from shared_originalId_timestamp
      const parts = postId.split('_')
      if (parts.length >= 3) {
        // Remove 'shared' and timestamp, keep the middle part(s)
        originalPostId = parts.slice(1, -1).join('_')
        console.log('💬 Extracted original post ID from shared post:', originalPostId)
      }
    } else {
      console.log('💬 This is not a shared post, using original ID:', originalPostId)
    }

    const comment: Post = {
      id: crypto.randomUUID(),
      content,
      author: this.currentUser.publicKey,
      timestamp: Date.now(),
      likes: 0,
      comments: [],
      replies: 0
    }

    console.log('💬 Looking for post with original ID:', originalPostId)

    // Find the original post
    let originalPost: Post | null = null
    const postKey = `pigeon:posts.${originalPostId}`
    console.log('💬 Looking for post with key:', postKey)
    const postJson = localStorage.getItem(postKey)

    if (postJson) {
      originalPost = JSON.parse(postJson)
      console.log('💬 Found post in localStorage with key:', postKey)
      console.log('💬 Post has', originalPost?.comments?.length || 0, 'existing comments')
    } else {
      console.log('💬 Post not found in localStorage with key:', postKey)
      console.log('💬 Available localStorage keys:', Object.keys(localStorage).filter(k => k.includes('posts')))
      console.log('💬 Searching all posts...')
      
      // Search through user's own posts if not found
      const userPostsKey = `pigeon:user_posts.${this.currentUser.publicKey}`
      const userPostIds = JSON.parse(localStorage.getItem(userPostsKey) || '[]')
      console.log('💬 Searching through', userPostIds.length, 'user posts')
      
      for (const userPostId of userPostIds) {
        if (userPostId === originalPostId) {
          const userPostKey = `pigeon:posts.${userPostId}`
          const userPostJson = localStorage.getItem(userPostKey)
          if (userPostJson) {
            originalPost = JSON.parse(userPostJson)
            console.log('💬 Found post in user posts!')
            break
          }
        }
      }
      
      // Search through followed posts if still not found
      if (!originalPost) {
        const followedPostsKey = `pigeon:followed_posts.${this.currentUser.publicKey}`
        const followedPostIds = JSON.parse(localStorage.getItem(followedPostsKey) || '[]')
        console.log('💬 Searching through', followedPostIds.length, 'followed posts')
        
        for (const followedPostId of followedPostIds) {
          if (followedPostId === originalPostId) {
            const followedPostKey = `pigeon:posts.${followedPostId}`
            const followedPostJson = localStorage.getItem(followedPostKey)
            if (followedPostJson) {
              originalPost = JSON.parse(followedPostJson)
              console.log('💬 Found post in followed posts!')
              break
            }
          }
        }
      }
    }

    if (originalPost) {
      console.log('💬 Successfully found original post:', originalPost.content.substring(0, 50) + '...')
      
      // Initialize comments array if it doesn't exist
      if (!originalPost.comments) {
        originalPost.comments = []
      }
      
      // Add the comment to the post
      originalPost.comments.push(comment)
      
      // Update replies count
      originalPost.replies = (originalPost.replies || 0) + 1

      // Save the updated post back to storage using the same key format
      localStorage.setItem(postKey, JSON.stringify(originalPost))
      console.log('💬 Updated post saved to localStorage')
      
      try {
        await this.storage?.put(`posts.${originalPostId}`, originalPost)
        console.log('💬 Updated original post with comment in distributed storage')
      } catch (error) {
        console.log('💬 Failed to update original post in distributed storage, but saved locally')
      }

      console.log('💬 Comment added successfully. Post now has', originalPost.comments.length, 'comments')
    } else {
      console.error('❌ Could not find original post to add comment to. PostID:', postId)
      console.error('💬 Debug: Checked keys:', [
        postKey,
        `posts.${originalPostId}`,
        'User posts and followed posts'
      ])
      return null
    }

    // Share the comment with friends (they'll get the updated post)
    console.log('💬 Sharing updated post with', originalPost.comments.length, 'comments to friends')
    this.shareCommentWithFriends(comment, originalPost)

    return originalPost
  }

  async getComments(postId: string): Promise<Post[]> {
    console.log('💬 Getting comments for post:', postId)
    
    // First try to get the post with its comments
    let post: Post | null = null
    
    // Try localStorage first
    const postKey = `pigeon:posts.${postId}`
    const postJson = localStorage.getItem(postKey)
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
}

export const pigeonSocial = new PigeonSocialService()
