import { doc, getDoc, setDoc, updateDoc, increment, Timestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
// import { RateLimitError } from '../types/errors';

interface RateLimit {
  limit: number;
  window: number; // milliseconds
}

export const RATE_LIMITS: Record<string, RateLimit> = {
  BLOG_GENERATION: { limit: 50, window: 24 * 60 * 60 * 1000 }, // 50 per day
  KEYWORD_RESEARCH: { limit: 100, window: 60 * 60 * 1000 }, // 100 per hour
  IMAGE_GENERATION: { limit: 30, window: 24 * 60 * 60 * 1000 }, // 30 per day
  WORDPRESS_PUBLISH: { limit: 20, window: 60 * 60 * 1000 }, // 20 per hour
};

class RateLimiterService {
  async checkRateLimit(userId: string, action: string): Promise<boolean> {
    const rateLimit = RATE_LIMITS[action];
    if (!rateLimit) return true;

    const rateLimitRef = doc(db, 'rateLimits', `${userId}_${action}`);
    const rateLimitDoc = await getDoc(rateLimitRef);

    if (!rateLimitDoc.exists()) {
      await setDoc(rateLimitRef, {
        count: 0,
        windowStart: Timestamp.now(),
        userId,
        action
      });
      return true;
    }

    const data = rateLimitDoc.data();
    const windowStart = data.windowStart.toDate().getTime();
    const now = Date.now();
    const windowEnd = windowStart + rateLimit.window;

    // Reset window if expired
    if (now > windowEnd) {
      await setDoc(rateLimitRef, {
        count: 0,
        windowStart: Timestamp.now(),
        userId,
        action
      });
      return true;
    }

    // Check if limit exceeded
    if (data.count >= rateLimit.limit) {
      return false;
    }

    return true;
  }

  async incrementCounter(userId: string, action: string): Promise<void> {
    const rateLimitRef = doc(db, 'rateLimits', `${userId}_${action}`);
    const rateLimitDoc = await getDoc(rateLimitRef);
    
    if (!rateLimitDoc.exists()) {
      await setDoc(rateLimitRef, {
        count: 1,
        windowStart: Timestamp.now(),
        userId,
        action
      });
    } else {
      await updateDoc(rateLimitRef, {
        count: increment(1)
      });
    }
  }

  async getRemainingQuota(userId: string, action: string): Promise<number> {
    const rateLimit = RATE_LIMITS[action];
    if (!rateLimit) return Infinity;

    const rateLimitRef = doc(db, 'rateLimits', `${userId}_${action}`);
    const rateLimitDoc = await getDoc(rateLimitRef);

    if (!rateLimitDoc.exists()) {
      return rateLimit.limit;
    }

    const data = rateLimitDoc.data();
    const windowStart = data.windowStart.toDate().getTime();
    const now = Date.now();
    const windowEnd = windowStart + rateLimit.window;

    if (now > windowEnd) {
      return rateLimit.limit;
    }

    return Math.max(0, rateLimit.limit - (data.count || 0));
  }

  async trackApiUsage(userId: string, service: string, tokensUsed: number, cost: number): Promise<void> {
    try {
      const usageRef = doc(db, 'apiUsage', `${userId}_${Date.now()}`);
      await setDoc(usageRef, {
        userId,
        service,
        tokensUsed,
        cost,
        timestamp: Timestamp.now(),
        month: new Date().toISOString().slice(0, 7) // YYYY-MM
      });

      // Update monthly totals
      const monthlyRef = doc(db, 'monthlyUsage', `${userId}_${new Date().toISOString().slice(0, 7)}`);
      const monthlyDoc = await getDoc(monthlyRef);

      if (monthlyDoc.exists()) {
        await updateDoc(monthlyRef, {
          totalCost: increment(cost),
          totalTokens: increment(tokensUsed),
          [`${service}Cost`]: increment(cost),
          [`${service}Tokens`]: increment(tokensUsed)
        });
      } else {
        await setDoc(monthlyRef, {
          userId,
          month: new Date().toISOString().slice(0, 7),
          totalCost: cost,
          totalTokens: tokensUsed,
          [`${service}Cost`]: cost,
          [`${service}Tokens`]: tokensUsed
        });
      }
    } catch (error) {
      console.error('Failed to track API usage:', error);
    }
  }

  async getApiUsageStats(userId: string, month: string) {
    try {
      const monthlyRef = doc(db, 'monthlyUsage', `${userId}_${month}`);
      const monthlyDoc = await getDoc(monthlyRef);

      if (!monthlyDoc.exists()) {
        return {
          totalCost: 0,
          totalTokens: 0,
          anthropicCost: 0,
          openaiCost: 0,
          dataforseoCost: 0
        };
      }

      return monthlyDoc.data();
    } catch (error) {
      console.error('Failed to get API usage stats:', error);
      return {
        totalCost: 0,
        totalTokens: 0,
        anthropicCost: 0,
        openaiCost: 0,
        dataforseoCost: 0
      };
    }
  }
}

export const rateLimiterService = new RateLimiterService();
