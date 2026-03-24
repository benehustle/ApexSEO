/**
 * Simple Firestore seeding script using the Firebase client SDK
 * This can be run in the browser console or as a Node script
 * 
 * To use: Copy and paste this into your browser console while logged into the app
 */

const userId = 'XkMHFUavXVgGV6YfapK9wBYPrbK2';
const userEmail = 'ben@spotonwebsites.com.au';

// This function should be run in the browser console after importing Firebase
async function seedUser() {
  const { collection, doc, setDoc, Timestamp } = await import('firebase/firestore');
  const { db } = await import('../src/config/firebase.js');
  
  try {
    const userRef = doc(db, 'users', userId);
    await setDoc(userRef, {
      email: userEmail,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    });
    
    console.log('✅ User document created successfully!');
    console.log(`   User ID: ${userId}`);
    console.log(`   Email: ${userEmail}`);
  } catch (error) {
    console.error('❌ Error seeding user:', error);
  }
}

// Export for use
if (typeof window !== 'undefined') {
  window.seedUser = seedUser;
}

export { seedUser };
