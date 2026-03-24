import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock Firebase
vi.mock('../config/firebase', () => ({
  auth: {
    onAuthStateChanged: vi.fn(),
    signInWithEmailAndPassword: vi.fn(),
    createUserWithEmailAndPassword: vi.fn(),
    signOut: vi.fn(),
  },
  db: {
    collection: vi.fn(),
    doc: vi.fn(),
  },
  storage: {
    ref: vi.fn(),
    uploadBytes: vi.fn(),
    getDownloadURL: vi.fn(),
  },
  functions: {
    httpsCallable: vi.fn(),
  },
}));

// Mock environment variables
vi.stubEnv('VITE_FIREBASE_API_KEY', 'test-api-key');
vi.stubEnv('VITE_FIREBASE_AUTH_DOMAIN', 'test.firebaseapp.com');
vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'test-project');
vi.stubEnv('VITE_FIREBASE_STORAGE_BUCKET', 'test.appspot.com');
vi.stubEnv('VITE_FIREBASE_MESSAGING_SENDER_ID', '123456789');
vi.stubEnv('VITE_FIREBASE_APP_ID', '1:123456789:web:test');
vi.stubEnv('VITE_FIREBASE_MEASUREMENT_ID', 'G-TEST123');
vi.stubEnv('VITE_ANTHROPIC_API_KEY', 'test-anthropic-key');
vi.stubEnv('VITE_OPENAI_API_KEY', 'test-openai-key');
vi.stubEnv('VITE_DATAFORSEO_LOGIN', 'test-login');
vi.stubEnv('VITE_DATAFORSEO_PASSWORD', 'test-password');
vi.stubEnv('VITE_YOUTUBE_API_KEY', 'test-youtube-key');
