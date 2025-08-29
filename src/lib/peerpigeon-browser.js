// Browser-only PeerPigeon exports to avoid server-side imports
// This file only exports the client-side components needed for the browser

export { PeerPigeonMesh } from '../../node_modules/peerpigeon/src/PeerPigeonMesh.js'
export { PeerConnection } from '../../node_modules/peerpigeon/src/PeerConnection.js'
export { SignalingClient } from '../../node_modules/peerpigeon/src/SignalingClient.js'
export { WebDHT } from '../../node_modules/peerpigeon/src/WebDHT.js'
export { DistributedStorageManager } from '../../node_modules/peerpigeon/src/DistributedStorageManager.js'
export { default as DebugLogger } from '../../node_modules/peerpigeon/src/DebugLogger.js'

// Export environment detection utilities
export {
  EnvironmentDetector,
  environmentDetector,
  isBrowser,
  isNodeJS,
  isWorker,
  hasWebRTC,
  hasWebSocket,
  getEnvironmentReport
} from '../../node_modules/peerpigeon/src/EnvironmentDetector.js'

// DO NOT export PeerPigeonServer - it's Node.js only and causes WebSocketServer import issues
