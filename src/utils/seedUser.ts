/**
 * Utility function to seed user data in Firestore
 * This can be called from the browser console or used in development
 */

import { doc, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '../config/firebase';

export async function seedUser(userId: string, email: string) {
  try {
    const userRef = doc(db, 'users', userId);
    // Use merge: true to preserve existing fields like agencyId
    await setDoc(userRef, {
      uid: userId,
      email: email,
      updatedAt: Timestamp.now()
    }, { merge: true });
    
    console.log('✅ User document updated successfully!');
    console.log(`   User ID: ${userId}`);
    console.log(`   Email: ${email}`);
    console.log('   Note: Existing fields (like agencyId) were preserved');
    return true;
  } catch (error) {
    console.error('❌ Error seeding user:', error);
    throw error;
  }
}

// Make it available globally for console access
if (typeof window !== 'undefined') {
  (window as any).seedUser = seedUser;
}
