/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY: string
  readonly VITE_FIREBASE_AUTH_DOMAIN: string
  readonly VITE_FIREBASE_PROJECT_ID: string
  readonly VITE_FIREBASE_STORAGE_BUCKET: string
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string
  readonly VITE_FIREBASE_APP_ID: string
  readonly VITE_FIREBASE_MEASUREMENT_ID: string
  readonly VITE_ANTHROPIC_API_KEY: string
  readonly VITE_OPENAI_API_KEY: string
  readonly VITE_YOUTUBE_API_KEY: string
  readonly VITE_DATAFORSEO_LOGIN: string
  readonly VITE_DATAFORSEO_PASSWORD: string
  readonly VITE_APP_URL: string
  readonly VITE_CLOUD_FUNCTIONS_URL: string
  readonly VITE_ENABLE_EMAIL_NOTIFICATIONS: string
  readonly VITE_ENABLE_ANALYTICS: string
  readonly VITE_MAX_SITES_PER_USER: string
  readonly VITE_MAX_BLOGS_PER_GENERATION: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
