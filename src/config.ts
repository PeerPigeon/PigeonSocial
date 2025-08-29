// Configuration for PigeonSocial
export const config = {
  signaling: {
    // Default signaling server URL
    serverUrl: 'wss://a02bdof0g2.execute-api.us-east-1.amazonaws.com/dev',
    
    // Fallback servers (in case primary is down)
    fallbackServers: [
      'ws://localhost:8081',
      'wss://signaling.pigeonsocial.com'
    ],
    
    // Connection settings
    reconnectInterval: 5000,
    maxReconnectAttempts: 5,
    pingInterval: 30000
  },
  
  webrtc: {
    // STUN servers for NAT traversal
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' }
    ]
  }
}

// Override with environment variables if available
if (typeof window !== 'undefined') {
  const envUrl = (import.meta as any).env?.VITE_SIGNALING_SERVER_URL
  if (envUrl) {
    console.log('🔧 Using signaling server from environment:', envUrl)
    config.signaling.serverUrl = envUrl
  } else {
    console.log('🔧 No environment variable found, using default:', config.signaling.serverUrl)
  }
}
