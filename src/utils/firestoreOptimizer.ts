// import { query, collection, where, orderBy, limit, startAfter, DocumentSnapshot } from 'firebase/firestore';
// import { db } from '../config/firebase';

export class FirestoreOptimizer {
  private cache = new Map<string, any>();
  private cacheExpiry = new Map<string, number>();

  async queryWithCache(
    cacheKey: string,
    queryFn: () => Promise<any>,
    ttl: number = 5 * 60 * 1000
  ) {
    const now = Date.now();
    const expiry = this.cacheExpiry.get(cacheKey);

    if (this.cache.has(cacheKey) && expiry && expiry > now) {
      return this.cache.get(cacheKey);
    }

    const result = await queryFn();
    this.cache.set(cacheKey, result);
    this.cacheExpiry.set(cacheKey, now + ttl);

    return result;
  }

  clearCache(cacheKey?: string) {
    if (cacheKey) {
      this.cache.delete(cacheKey);
      this.cacheExpiry.delete(cacheKey);
    } else {
      this.cache.clear();
      this.cacheExpiry.clear();
    }
  }
}

export const firestoreOptimizer = new FirestoreOptimizer();
