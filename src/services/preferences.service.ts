import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { UserPreferences, DEFAULT_PREFERENCES } from '../types/preferences';

class PreferencesService {
  async getPreferences(userId: string): Promise<UserPreferences> {
    try {
      const prefsRef = doc(db, 'userPreferences', userId);
      const prefsDoc = await getDoc(prefsRef);

      if (!prefsDoc.exists()) {
        await this.createDefaultPreferences(userId);
        return DEFAULT_PREFERENCES;
      }

      // Merge with defaults to ensure all fields exist
      return { ...DEFAULT_PREFERENCES, ...prefsDoc.data() } as UserPreferences;
    } catch (error) {
      console.error('Failed to get preferences:', error);
      return DEFAULT_PREFERENCES;
    }
  }

  async updatePreferences(userId: string, updates: Partial<UserPreferences>): Promise<void> {
    const prefsRef = doc(db, 'userPreferences', userId);
    
    // Handle nested updates for emailNotifications
    if (updates.emailNotifications) {
      const currentDoc = await getDoc(prefsRef);
      const currentData = currentDoc.exists() 
        ? (currentDoc.data() as UserPreferences)
        : DEFAULT_PREFERENCES;
      
      await updateDoc(prefsRef, {
        ...updates,
        emailNotifications: {
          ...currentData.emailNotifications,
          ...updates.emailNotifications
        }
      });
    } else {
      await updateDoc(prefsRef, updates);
    }
  }

  async resetPreferences(userId: string): Promise<void> {
    const prefsRef = doc(db, 'userPreferences', userId);
    await setDoc(prefsRef, DEFAULT_PREFERENCES);
  }

  private async createDefaultPreferences(userId: string): Promise<void> {
    const prefsRef = doc(db, 'userPreferences', userId);
    await setDoc(prefsRef, DEFAULT_PREFERENCES);
  }
}

export const preferencesService = new PreferencesService();
