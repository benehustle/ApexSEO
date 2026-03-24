#!/bin/bash

# Production Deployment Script for Apex SEO
set -e

echo "🚀 Starting deployment process..."

# Check if .env.production exists
if [ ! -f .env.production ]; then
    echo "⚠️  Warning: .env.production not found"
    echo "📋 Creating .env.production from .env.local..."
    if [ -f .env.local ]; then
        cp .env.local .env.production
        echo "✅ Created .env.production from .env.local"
        echo "⚠️  Please review .env.production before deploying!"
    else
        echo "❌ Error: .env.local not found. Please create .env.production manually."
        exit 1
    fi
fi

# Check if Cloud Functions API key is set
echo "🔍 Checking Cloud Functions configuration..."
FUNCTIONS_CONFIG=$(firebase functions:config:get 2>/dev/null || echo "")
if [[ ! "$FUNCTIONS_CONFIG" == *"anthropic"* ]]; then
    echo "⚠️  Warning: Anthropic API key not set for Cloud Functions"
    echo "📝 Set it with: firebase functions:config:set anthropic.key=\"your-key\""
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Build the application
echo "🔨 Building application..."
npm run build

if [ ! -d "dist" ]; then
    echo "❌ Error: Build failed - dist folder not found"
    exit 1
fi

echo "✅ Build successful"

# Ask what to deploy
echo ""
echo "What would you like to deploy?"
echo "1) Everything (hosting + functions + rules)"
echo "2) Hosting only"
echo "3) Functions only"
echo "4) Rules only"
read -p "Enter choice (1-4): " choice

case $choice in
    1)
        echo "🚀 Deploying everything..."
        firebase deploy
        ;;
    2)
        echo "🚀 Deploying hosting only..."
        firebase deploy --only hosting
        ;;
    3)
        echo "🚀 Deploying functions only..."
        firebase deploy --only functions
        ;;
    4)
        echo "🚀 Deploying rules only..."
        firebase deploy --only firestore:rules,storage:rules
        ;;
    *)
        echo "❌ Invalid choice"
        exit 1
        ;;
esac

echo ""
echo "✅ Deployment complete!"
echo "🌐 Check your site at: https://console.firebase.google.com/project/apex-seo-ffbd0/hosting"
