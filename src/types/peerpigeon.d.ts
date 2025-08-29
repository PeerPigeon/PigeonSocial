declare module 'peerpigeon' {
  export class PeerPigeonMesh {
    constructor(options?: {
      enableWebDHT?: boolean
      enableCrypto?: boolean
      peerId?: string
    })
    init(): Promise<void>
    connect(signalingUrl: string): Promise<void>
    sendMessage(content: string): string | null
    sendDirectMessage(targetPeerId: string, content: string): string | null
    getPeers(): any[]
    connected: boolean
    peerId: string
    addEventListener(event: string, callback: (data: any) => void): void
    removeEventListener(event: string, callback: (data: any) => void): void
    ready(): Promise<void>
    get(key: string): Promise<any>
    put(key: string, value: any): Promise<void>
    generateKeypair(): Promise<{ publicKey: string; privateKey: string }>
  }

  export class DistributedStorageManager {
    constructor(options?: any)
    get(key: string): Promise<any>
    put(key: string, value: any): Promise<void>
  }

  export class PeerConnection {
    constructor(options?: any)
  }

  export class SignalingClient {
    constructor(options?: any)
  }

  export class WebDHT {
    constructor(options?: any)
  }

  export default class DebugLogger {
    static enable(): void
    static disable(): void
  }

  export const EnvironmentDetector: any
  export const environmentDetector: any
  export const isBrowser: boolean
  export const isNodeJS: boolean
  export const isWorker: boolean
  export const hasWebRTC: boolean
  export const hasWebSocket: boolean
  export function getEnvironmentReport(): any
  export function generatePeerId(): string
}
