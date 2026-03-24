# Seeding User Data in Firestore

## Quick Method (Browser Console)

1. Open your app in the browser (http://localhost:5173)
2. Sign in with your Firebase account (ben@spotonwebsites.com.au)
3. Open the browser console (F12 or Cmd+Option+I)
4. Paste and run this code:

```javascript
import { seedUser } from './src/utils/seedUser';
await seedUser('XkMHFUavXVgGV6YfapK9wBYPrbK2', 'ben@spotonwebsites.com.au');
```

Or use the global function (if available):
```javascript
await window.seedUser('XkMHFUavXVgGV6YfapK9wBYPrbK2', 'ben@spotonwebsites.com.au');
```

## Alternative: Direct Firestore Console

1. Go to Firebase Console: https://console.firebase.google.com
2. Select your project: apex-seo-ffbd0
3. Go to Firestore Database
4. Click "Start collection" or navigate to "users" collection
5. Add a document with ID: `XkMHFUavXVgGV6YfapK9wBYPrbK2`
6. Add fields:
   - `email` (string): `ben@spotonwebsites.com.au`
   - `createdAt` (timestamp): current time
   - `updatedAt` (timestamp): current time

## Using Firebase CLI

If you have Firebase CLI installed and authenticated:

```bash
firebase firestore:set users/XkMHFUavXVgGV6YfapK9wBYPrbK2 '{"email":"ben@spotonwebsites.com.au","createdAt":"2024-01-01T00:00:00Z","updatedAt":"2024-01-01T00:00:00Z"}'
```

## Verify

After seeding, verify the user document exists:
1. Go to Firestore Console
2. Navigate to `users` collection
3. Check for document ID: `XkMHFUavXVgGV6YfapK9wBYPrbK2`
