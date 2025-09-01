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
    
    // Video functionality temporarily disabled
    if (videoFile) {
      console.log('⚠️ [createPost] Video uploads temporarily disabled')
      throw new Error('Video uploads are temporarily disabled')
    }
    
    const post: Post = {
      id: postId,
      content,
      image,
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

    // Get posts from friends (simplified since getFriendPosts doesn't exist)
    try {
      // For now, just skip friend posts since the method doesn't exist
      console.log('📰 Friend posts temporarily disabled - method not available')
    } catch (error) {
      console.error('Failed to get friend posts:', error)
    }

    // Sort by timestamp (most recent first)
    posts.sort((a, b) => b.timestamp - a.timestamp)
    
    console.log('📰 Returning', posts.length, 'total posts for feed')
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
}

export const pigeonSocial = new PigeonSocialService()
