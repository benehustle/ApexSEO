import { collection, addDoc, query, where, orderBy, limit, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '../config/firebase';

export interface ErrorLog {
  id: string;
  userId: string;
  errorType: string;
  errorMessage: string;
  stackTrace?: string;
  context: any;
  timestamp: Date;
  userAgent: string;
  url: string;
  resolved: boolean;
}

export interface ActivityLog {
  id: string;
  userId: string;
  action: string;
  details: any;
  timestamp: Date;
}

class LoggerService {
  async logError(error: Error | any, context: any, userId?: string): Promise<void> {
    try {
      // Ensure we have a proper Error object
      const errorObj = error instanceof Error 
        ? error 
        : new Error(String(error || 'Unknown error'));
      
      // Safely stringify context to avoid circular references
      let contextString = '{}';
      try {
        contextString = typeof context === 'object' && context !== null
          ? JSON.stringify(context, (_key, value) => {
              // Handle circular references and non-serializable values
              if (typeof value === 'function') return '[Function]';
              if (typeof value === 'undefined') return '[Undefined]';
              if (value instanceof Error) return { name: value.name, message: value.message };
              return value;
            })
          : String(context || '{}');
      } catch (e) {
        contextString = String(context || '{}');
      }
      
      await addDoc(collection(db, 'errorLogs'), {
        userId: userId || 'anonymous',
        errorType: errorObj.name || 'Error',
        errorMessage: errorObj.message || String(error || 'Unknown error'),
        stackTrace: errorObj.stack || 'No stack trace available',
        context: contextString,
        timestamp: Timestamp.now(),
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'server',
        url: typeof window !== 'undefined' ? window.location.href : 'server',
        resolved: false
      });
    } catch (e: any) {
      // Don't throw - just log to console to prevent error loops
      console.error('Failed to log error to Firestore:', e?.message || String(e));
    }
  }

  async logUserAction(userId: string, action: string, details: any): Promise<void> {
    try {
      await addDoc(collection(db, 'activityLogs'), {
        userId,
        action,
        details,
        timestamp: Timestamp.now()
      });
    } catch (e) {
      console.error('Failed to log action:', e);
    }
  }

  async logApiCall(service: string, endpoint: string, success: boolean, responseTime: number): Promise<void> {
    try {
      await addDoc(collection(db, 'apiLogs'), {
        service,
        endpoint,
        success,
        responseTime,
        timestamp: Timestamp.now()
      });
    } catch (e) {
      console.error('Failed to log API call:', e);
    }
  }

  async getErrorLogs(userId: string, limitCount: number = 50): Promise<ErrorLog[]> {
    try {
      const logsRef = collection(db, 'errorLogs');
      const q = query(
        logsRef,
        where('userId', '==', userId),
        orderBy('timestamp', 'desc'),
        limit(limitCount)
      );
      
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp.toDate()
      })) as ErrorLog[];
    } catch (error) {
      console.error('Failed to get error logs:', error);
      return [];
    }
  }

  async getUserActivityLogs(userId: string, limitCount: number = 100): Promise<ActivityLog[]> {
    try {
      const logsRef = collection(db, 'activityLogs');
      const q = query(
        logsRef,
        where('userId', '==', userId),
        orderBy('timestamp', 'desc'),
        limit(limitCount)
      );
      
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp.toDate()
      })) as ActivityLog[];
    } catch (error) {
      console.error('Failed to get activity logs:', error);
      return [];
    }
  }
}

export const loggerService = new LoggerService();
