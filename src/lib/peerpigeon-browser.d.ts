// Type definitions for our browser-only PeerPigeon exports
export declare class PeerPigeonMesh {
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
}

export declare class PeerConnection {
  constructor(options?: any)
}

export declare class SignalingClient {
  constructor(options?: any)
}

export declare class WebDHT {
  constructor(options?: any)
}

export declare class DistributedStorageManager {
  constructor(mesh: PeerPigeonMesh)
  store(key: string, value: any, options?: any): Promise<boolean>
  retrieve(key: string, options?: any): Promise<any>
  delete(key: string): Promise<boolean>
  update(key: string, value: any, options?: any): Promise<boolean>
  waitForCrypto(): Promise<void>
}

export declare class DebugLogger {
  static enable(): void
  static disable(): void
}

export declare const EnvironmentDetector: any
export declare const environmentDetector: any
export declare const isBrowser: boolean
export declare const isNodeJS: boolean
export declare const isWorker: boolean
export declare const hasWebRTC: boolean
export declare const hasWebSocket: boolean
export declare function getEnvironmentReport(): any
