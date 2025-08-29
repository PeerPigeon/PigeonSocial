// import { PeerPigeonMesh, DistributedStorageManager } from 'peerpigeon'
import { config } from '../config'
import { generateRandomPair } from 'unsea'

// Temporary interfaces until PeerPigeon browser compatibility is fixed
interface PeerPigeonMesh {
  ready(): Promise<void>
  generateKeypair(): Promise<{ publicKey: string; privateKey: string }>
}

interface DistributedStorageManager {
  get(key: string): Promise<any>
  put(key: string, value: any): Promise<void>
}

export interface UserProfile {
  id: string
  username: string
  displayName?: string
  avatar?: string
  bio?: string
  createdAt: number
  publicKey: string
}

export interface Post {
  id: string
  authorId: string
  content: string
  timestamp: number
  likes: number
  replies: number
  parentId?: string // For replies
}

export class PigeonSocialService {
  private mesh: PeerPigeonMesh | null = null
  private storage: DistributedStorageManager | null = null
  private isInitialized = false
  private currentUser: UserProfile | null = null
  private signalingServerUrl: string

  constructor() {
    // Get signaling server URL from config
    this.signalingServerUrl = config.signaling.serverUrl
    console.log('Signaling server URL:', this.signalingServerUrl)
    this.initializePeerPigeon()
  }

  private async initializePeerPigeon() {
    try {
      // For now, use localStorage directly to avoid Node.js module issues
      // TODO: Fix PeerPigeon browser compatibility
      console.log('Initializing with localStorage fallback...')
      
      this.storage = {
        get: async (key: string) => {
          const stored = localStorage.getItem(`pigeon:${key}`)
          return stored ? JSON.parse(stored) : null
        },
        put: async (key: string, value: any) => {
          localStorage.setItem(`pigeon:${key}`, JSON.stringify(value))
        }
      } as DistributedStorageManager

      this.isInitialized = true
      
      // Check if user already exists
      await this.loadExistingUser()
    } catch (error) {
      console.error('Failed to initialize PeerPigeon:', error)
      // Fallback to local storage only
      this.isInitialized = true
      await this.loadExistingUser()
    }
  }

  private async loadExistingUser() {
    try {
      // Try to load existing user profile from storage
      const storedProfile = await this.storage?.get('user.profile')
      if (storedProfile) {
        this.currentUser = storedProfile
      }
    } catch (error) {
      console.error('No existing user found:', error)
    }
  }

  async ensureInitialized() {
    if (!this.isInitialized) {
      await this.initializePeerPigeon()
    }
  }

  async generateKeypair() {
    await this.ensureInitialized()
    
    try {
      // Try to use PeerPigeon's keypair generation
      if (this.mesh) {
        return await this.mesh.generateKeypair()
      }
    } catch (error) {
      console.error('Failed to generate keypair with PeerPigeon:', error)
    }
    
    // Fallback to a simple ID generation
    const id = crypto.randomUUID()
    return {
      publicKey: id,
      privateKey: id + '_private'
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

    // Store user profile
    await this.storage?.put('user.profile', user)
    await this.storage?.put('user.keypair', keypair)
    await this.storage?.put('user.unsea_keypair', unSeaKeypair)
    console.log('💾 Stored user profile and UnSea keypair')
    
    this.currentUser = user
    return user
  }

  async getCurrentUser(): Promise<UserProfile | null> {
    await this.ensureInitialized()
    
    // If we have a user but no UnSea keypair, generate one
    if (this.currentUser) {
      const unSeaKeypair = await this.getCurrentUserUnSeaKeypair()
      if (!unSeaKeypair) {
        console.log('🔐 Existing user has no UnSea keypair, generating one...')
        const newUnSeaKeypair = await generateRandomPair()
        await this.storage?.put('user.unsea_keypair', newUnSeaKeypair)
        console.log('✅ Generated and stored UnSea keypair for existing user')
      }
    }
    
    return this.currentUser
  }

  async getCurrentUserUnSeaKeypair(): Promise<any | null> {
    await this.ensureInitialized()
    try {
      const keypair = await this.storage?.get('user.unsea_keypair')
      return keypair || null
    } catch (error) {
      console.error('Failed to get UnSea keypair:', error)
      return null
    }
  }

  getCurrentUserPublicKey(): string | null {
    return this.currentUser?.publicKey || null
  }

  async logout(): Promise<void> {
    // Clear current user
    this.currentUser = null
    
    // Clear from localStorage
    try {
      localStorage.removeItem('pigeon_social_user')
      localStorage.removeItem('pigeon_social_keypair')
    } catch (error) {
      console.error('Failed to clear user data:', error)
    }
  }

  async updateProfile(updates: Partial<UserProfile>): Promise<UserProfile> {
    await this.ensureInitialized()
    
    if (!this.currentUser) {
      throw new Error('No user logged in')
    }

    const updatedUser = { ...this.currentUser, ...updates }
    await this.storage?.put('user.profile', updatedUser)
    this.currentUser = updatedUser
    
    return updatedUser
  }

  async createPost(content: string, parentId?: string): Promise<Post> {
    await this.ensureInitialized()
    
    if (!this.currentUser) {
      throw new Error('No user logged in')
    }

    const post: Post = {
      id: crypto.randomUUID(),
      authorId: this.currentUser.id,
      content,
      timestamp: Date.now(),
      likes: 0,
      replies: 0,
      parentId
    }

    // Store post
    await this.storage?.put(`posts.${post.id}`, post)
    
    // Add to user's posts list
    const userPosts = await this.storage?.get(`user.${this.currentUser.id}.posts`) || []
    userPosts.push(post.id)
    await this.storage?.put(`user.${this.currentUser.id}.posts`, userPosts)

    // If it's a reply, update parent post
    if (parentId) {
      const parentPost = await this.storage?.get(`posts.${parentId}`)
      if (parentPost) {
        parentPost.replies += 1
        await this.storage?.put(`posts.${parentId}`, parentPost)
      }
    }

    return post
  }

  async getFeed(limit = 20): Promise<Post[]> {
    await this.ensureInitialized()
    
    // For now, get posts from current user
    if (!this.currentUser) return []

    const userPosts = await this.storage?.get(`user.${this.currentUser.id}.posts`) || []
    const posts: Post[] = []

    for (const postId of userPosts.slice(-limit).reverse()) {
      const post = await this.storage?.get(`posts.${postId}`)
      if (post) posts.push(post)
    }

    return posts
  }

  async getPost(postId: string): Promise<Post | null> {
    await this.ensureInitialized()
    return await this.storage?.get(`posts.${postId}`) || null
  }

  async likePost(postId: string): Promise<void> {
    await this.ensureInitialized()
    
    const post = await this.storage?.get(`posts.${postId}`)
    if (post) {
      post.likes += 1
      await this.storage?.put(`posts.${postId}`, post)
    }
  }

  async isFirstTimeUser(): Promise<boolean> {
    await this.ensureInitialized()
    return this.currentUser === null
  }

  // Public storage methods for other services
  async storeData(key: string, value: any): Promise<void> {
    await this.ensureInitialized()
    await this.storage?.put(key, value)
  }

  async getData(key: string): Promise<any> {
    await this.ensureInitialized()
    return await this.storage?.get(key)
  }
}

// Singleton instance
export const pigeonSocial = new PigeonSocialService()
