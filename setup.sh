#!/bin/bash

# PigeonSocial Development Setup Script

echo "🐦 Setting up PigeonSocial development environment..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version 18+ required. Current version: $(node -v)"
    exit 1
fi

echo "✅ Node.js $(node -v) detected"

# Install dependencies
echo "📦 Installing dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo "❌ Failed to install dependencies"
    exit 1
fi

echo "✅ Dependencies installed successfully"

# Start development server
echo "🚀 Starting development server..."
echo "📱 Your PigeonSocial app will be available at http://localhost:3000"
echo ""
echo "Features ready:"
echo "  - ✅ Login-less identity creation"
echo "  - ✅ Decentralized post storage"
echo "  - ✅ Mobile-optimized UI"
echo "  - ✅ PWA capabilities"
echo ""
echo "Next steps:"
echo "  - Open http://localhost:3000 in your browser"
echo "  - Create your first identity"
echo "  - Start posting!"
echo ""

npm run dev
