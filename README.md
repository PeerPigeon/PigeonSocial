# PigeonSocial

A login-less, decentralized social network built on PeerPigeon with modern UI for mobile and PWA capabilities.

## Features

- **No Login Required**: Uses cryptographic keypairs for identity management via PeerPigeon's UnSea module
- **Decentralized**: Built on PeerPigeon for true peer-to-peer communication
- **Mobile-First**: Responsive design optimized for iOS and Android
- **PWA Ready**: Progressive Web App capabilities for offline usage
- **Native Apps**: Can be deployed as native iOS/Android apps using Capacitor

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite
- **UI**: Tailwind CSS + Framer Motion
- **Mobile**: Capacitor for native deployment
- **Backend**: PeerPigeon for decentralized storage and networking
- **Identity**: UnSea module for cryptographic identity generation

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- For mobile development: Xcode (iOS) or Android Studio (Android)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/draeder/PigeonSocial.git
cd PigeonSocial
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

4. Open your browser to `http://localhost:3000`

### First Time Setup

When you first open the app:

1. You'll see the welcome screen with features overview
2. Click "Get Started" to create your identity
3. Enter a username (required) and optional display name
4. Your cryptographic keypair will be generated automatically
5. Start posting and interacting!

## Mobile Development

### PWA (Progressive Web App)

The app automatically works as a PWA. Users can:
- Install it from their mobile browser
- Use it offline (basic functionality)
- Get native app-like experience

### Native Apps

To build native mobile apps:

1. Build the web app:
```bash
npm run build
```

2. Add mobile platforms:
```bash
npm run add:android  # For Android
npm run add:ios      # For iOS
```

3. Sync the web build with native projects:
```bash
npm run sync
```

4. Run on devices:
```bash
npm run android     # For Android
npm run ios         # For iOS
```

## How It Works

### Identity Management

- No traditional signup/login process
- Each user gets a cryptographic keypair on first use
- Public key serves as the user ID
- Private key stays local for signing messages

### Data Storage

- Uses PeerPigeon's persistent storage layer
- Data is stored locally and synchronized peer-to-peer
- No central servers required

### Social Features

Currently implemented:
- ✅ User profile creation
- ✅ Post creation and viewing
- ✅ Like functionality
- ✅ Real-time feed updates

Planned features:
- 🚧 Follow/unfollow users
- 🚧 Reply to posts
- 🚧 Image/media sharing
- 🚧 Direct messaging
- 🚧 Content discovery

## Architecture

```
├── src/
│   ├── components/          # React components
│   │   ├── WelcomeScreen.tsx    # First-time user onboarding
│   │   ├── MainFeed.tsx         # Main social feed
│   │   ├── PostCard.tsx         # Individual post display
│   │   ├── CreatePost.tsx       # Post creation modal
│   │   └── LoadingScreen.tsx    # Loading states
│   ├── services/
│   │   └── pigeonSocial.ts      # PeerPigeon integration
│   ├── App.tsx             # Main app component
│   ├── main.tsx            # App entry point
│   └── index.css           # Global styles
├── public/                 # Static assets
├── capacitor.config.ts     # Capacitor configuration
├── vite.config.ts         # Vite configuration
└── tailwind.config.js     # Tailwind CSS configuration
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Signal Server

The signal server integration will be added in the next iteration once the core UI and PeerPigeon integration is stable.

## License

ISC License - see LICENSE file for details
