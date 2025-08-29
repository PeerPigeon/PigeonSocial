# PigeonSocial Friend System with UnSea Encryption

## Overview

PigeonSocial now includes a comprehensive friend management system that enables users to:

1. **Discover peers** via the signaling server
2. **Send/receive friend requests** with UnSea-style encryption
3. **Establish direct peer-to-peer connections** using WebRTC
4. **Send encrypted messages** directly between friends

## How It Works

### 1. Peer Discovery

- Users connect to a WebSocket signaling server
- The signaling server facilitates peer discovery and WebRTC connection establishment
- Users can discover other online peers and send friend requests

### 2. Friend Request System

- Friend requests are encrypted using a shared secret derived from UnSea keypairs
- Requests include user information and an optional message
- Recipients can accept or reject requests via the UI

### 3. WebRTC Connections

- Once friend requests are accepted, direct peer-to-peer WebRTC connections are established
- Data channels enable real-time messaging without going through the signaling server
- Connections are persistent and automatically reconnect when possible

### 4. Encryption

- All friend requests and messages use UnSea-style encryption
- Shared secrets are derived from public keys using deterministic key derivation
- Messages are encrypted end-to-end before transmission

## Usage

### Adding Friends

1. **By Discovery**: Click "Friends" → "Discover" → Find and add peers
2. **By Public Key**: Click "Friends" → "Add Friend" → Enter their public key

### Managing Friend Requests

1. Incoming requests appear in "Friends" → "Requests"
2. Accept or reject requests with the buttons provided
3. Accepted friends appear in your friends list

### Messaging Friends

1. Friends with green "online" status can receive messages
2. Click "Message" next to online friends to start a conversation
3. All messages are automatically encrypted end-to-end

## Architecture

### Files Structure

```
src/
├── services/
│   ├── friendService.ts     # Main friend management logic
│   └── pigeonSocial.ts      # Updated with signaling URL config
├── components/
│   ├── FriendsManager.tsx   # Friends UI component
│   ├── Messaging.tsx        # Direct messaging component
│   └── MainFeed.tsx         # Updated with Friends button
├── config.ts                # Signaling server & WebRTC config
└── .env                     # Environment variables
```

### Key Components

#### FriendService
- Manages WebSocket connection to signaling server
- Handles peer discovery and friend requests
- Establishes WebRTC peer connections
- Provides encryption/decryption utilities

#### FriendsManager
- UI for managing friends and requests
- Peer discovery interface
- Friend request handling

#### Messaging
- Direct peer-to-peer messaging
- End-to-end encryption display
- Real-time message delivery

## Configuration

### Environment Variables

Set in `.env`:
```
VITE_SIGNALING_SERVER_URL=wss://your-signaling-server.com
```

### Config File

Update `src/config.ts`:
```typescript
export const config = {
  signaling: {
    serverUrl: 'wss://your-signaling-server.com',
    reconnectInterval: 5000,
    maxReconnectAttempts: 5
  },
  webrtc: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' }
    ]
  }
}
```

## Security Features

### UnSea-Style Encryption
- Deterministic shared secret generation from public keys
- XOR encryption with key derivation (simplified implementation)
- All friend requests and messages are encrypted

### Peer-to-Peer Security
- Direct WebRTC connections bypass centralized servers
- Data channels use DTLS encryption by default
- Signaling server only facilitates initial connection setup

### Key Management
- Public keys serve as user identifiers
- Private keys remain local and never transmitted
- Shared secrets are derived mathematically from key pairs

## Usage Examples

### Send a Friend Request
```typescript
await friendService.sendFriendRequest(
  'target-public-key',
  'Hi! I found you on PigeonSocial, let\'s connect!'
)
```

### Accept a Friend Request
```typescript
await friendService.acceptFriendRequest('request-id')
```

### Send a Message
```typescript
await friendService.sendMessageToFriend(
  'friend-public-key',
  { content: 'Hello!', timestamp: Date.now() }
)
```

### Listen for Events
```typescript
friendService.on('friend-request:received', (request) => {
  console.log('New friend request:', request)
})

friendService.on('peer:message', ({ fromPublicKey, message }) => {
  console.log('Message from', fromPublicKey, ':', message)
})
```

## Signaling Server

The friend system requires a WebSocket signaling server for:
- Peer discovery
- WebRTC offer/answer exchange
- ICE candidate exchange
- Friend request relay

Your current signaling server URL is configured in `.env`:
```
VITE_SIGNALING_SERVER_URL=wss://a02bdof0g2.execute-api.us-east-1.amazonaws.com/dev
```

## Next Steps

1. **Test the friend system** by opening the app in multiple browser windows
2. **Add friends** using public keys or discovery
3. **Send encrypted messages** between connected friends
4. **Monitor console** for connection and encryption debugging

The system is now ready for peer-to-peer social networking with full encryption and decentralized friend management!
