import { collection, addDoc, updateDoc, doc, getDocs, getDoc, query, where, Timestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../config/firebase';
import { Site } from '../types/site';

export const siteService = {
  async createSite(siteData: Omit<Site, 'id' | 'createdAt' | 'updatedAt'>) {
    const sitesRef = collection(db, 'sites');
    const docRef = await addDoc(sitesRef, {
      ...siteData,
      isActive: true,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    });
    return docRef.id;
  },

  async updateSite(siteId: string, updates: Partial<Site>) {
    const siteRef = doc(db, 'sites', siteId);
    await updateDoc(siteRef, {
      ...updates,
      updatedAt: Timestamp.now()
    });
  },

  /**
   * Get sites by agencyId (strictly required)
   * @param _userId - Kept for backward compatibility, not used
   * @param agencyId - Required: The agency ID to query sites for
   */
  async getUserSites(_userId: string, agencyId: string | null | undefined): Promise<Site[]> {
    const sitesRef = collection(db, 'sites');
    
    // Strictly require agencyId - no fallback
    if (!agencyId) {
      console.warn('[siteService] getUserSites called without agencyId, returning empty array');
      return [];
    }
    
    console.log('[siteService] Querying sites for agencyId:', agencyId);
    const q = query(sitesRef, where('agencyId', '==', agencyId));
    const snapshot = await getDocs(q);
    
    const sites = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt.toDate(),
      updatedAt: doc.data().updatedAt.toDate()
    })) as Site[];
    
    console.log(`[siteService] Found ${sites.length} sites for agencyId: ${agencyId}`);
    return sites;
  },

  async getSite(siteId: string): Promise<Site | null> {
    const siteRef = doc(db, 'sites', siteId);
    const snapshot = await getDoc(siteRef);
    
    if (!snapshot.exists()) return null;
    
    return {
      id: snapshot.id,
      ...snapshot.data(),
      createdAt: snapshot.data().createdAt.toDate(),
      updatedAt: snapshot.data().updatedAt.toDate()
    } as Site;
  },

  /**
   * Delete a site completely (site document and all related data: content calendar,
   * targeted keywords, analytics, blogs, page views). Uses a callable to perform
   * server-side deletion. Only allowed for the site's agency or app owners.
   */
  async deleteSite(siteId: string): Promise<void> {
    const deleteSiteFn = httpsCallable<{ siteId: string }, { success: boolean; message?: string }>(
      functions,
      'deleteSiteCompletelyCallable'
    );
    await deleteSiteFn({ siteId });
  }
};
