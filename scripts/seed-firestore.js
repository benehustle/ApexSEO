/**
 * Seed Firestore with user data
 * Run with: node scripts/seed-firestore.js
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize Firebase Admin
// Note: You'll need to download your service account key from Firebase Console
// and place it in the project root as 'service-account-key.json'
try {
  const serviceAccount = JSON.parse(
    readFileSync(join(__dirname, '../service-account-key.json'), 'utf8')
  );

  initializeApp({
    credential: cert(serviceAccount)
  });

  const db = getFirestore();

  const userId = 'XkMHFUavXVgGV6YfapK9wBYPrbK2';
  const userEmail = 'ben@spotonwebsites.com.au';

  async function seedUser() {
    try {
      // Create user document
      const userRef = db.collection('users').doc(userId);
      
      await userRef.set({
        email: userEmail,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      });

      console.log('✅ User document created successfully!');
      console.log(`   User ID: ${userId}`);
      console.log(`   Email: ${userEmail}`);
      
      return userId;
    } catch (error) {
      console.error('❌ Error seeding user:', error);
      throw error;
    }
  }

  // Run the seed function
  seedUser()
    .then(() => {
      console.log('\n✅ Seeding completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Seeding failed:', error);
      process.exit(1);
    });

} catch (error) {
  if (error.code === 'ENOENT') {
    console.error('❌ Error: service-account-key.json not found!');
    console.log('\nTo seed Firestore, you need to:');
    console.log('1. Go to Firebase Console > Project Settings > Service Accounts');
    console.log('2. Click "Generate new private key"');
    console.log('3. Save the JSON file as "service-account-key.json" in the project root');
    console.log('4. Run this script again');
  } else {
    console.error('❌ Error initializing Firebase Admin:', error);
  }
  process.exit(1);
}
