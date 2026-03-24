# Setup Instructions

## Prerequisites
- Node.js 18+ installed
- Firebase CLI installed: `npm install -g firebase-tools`
- Git installed

## Step 1: Firebase Project Setup
1. Go to https://console.firebase.google.com
2. Create a new project
3. Enable Google Analytics (optional)
4. Go to Project Settings > General
5. Copy your Firebase config values to `.env`

## Step 2: Enable Firebase Services
1. **Authentication**:
   - Go to Authentication > Sign-in method
   - Enable Email/Password
   
2. **Firestore Database**:
   - Go to Firestore Database
   - Create database in production mode
   - Choose a location (us-central1 recommended)
   
3. **Storage**:
   - Go to Storage
   - Get started with default security rules
   
4. **Functions**:
   - Go to Functions
   - Upgrade to Blaze plan (required for external API calls)

## Step 3: API Keys Setup

### Anthropic Claude API
1. Go to https://console.anthropic.com
2. Create account or sign in
3. Go to API Keys
4. Create new key
5. Add to `.env` as `VITE_ANTHROPIC_API_KEY`

### OpenAI API (for DALL-E)
1. Go to https://platform.openai.com
2. Create account or sign in
3. Go to API Keys
4. Create new secret key
5. Add to `.env` as `VITE_OPENAI_API_KEY`

### YouTube Data API
1. Go to https://console.cloud.google.com
2. Create project or select existing
3. Enable YouTube Data API v3
4. Create credentials (API key)
5. Add to `.env` as `VITE_YOUTUBE_API_KEY`

### DataForSEO API (for keyword research)
1. Go to https://dataforseo.com
2. Sign up for account
3. Go to Dashboard > API Access
4. Copy login and password
5. Add to `.env`

## Step 4: Install Dependencies
```bash
npm install
cd functions && npm install && cd ..
```

## Step 5: Firebase Login
```bash
firebase login
firebase init
```
Select:
- Firestore
- Functions
- Hosting
- Storage

## Step 6: Deploy Security Rules
```bash
firebase deploy --only firestore:rules
firebase deploy --only storage:rules
```

## Step 7: Start Development
```bash
npm run dev
```
