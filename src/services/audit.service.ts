import { collection, addDoc, Timestamp } from 'firebase/firestore';
import { db } from '../config/firebase';

interface AuditLog {
  userId: string;
  action: string;
  resource: string;
  resourceId?: string;
  ipAddress?: string;
  userAgent?: string;
  success: boolean;
  details?: any;
}

class AuditService {
  async log(auditLog: AuditLog): Promise<void> {
    try {
      await addDoc(collection(db, 'auditLogs'), {
        ...auditLog,
        timestamp: Timestamp.now(),
        ipAddress: auditLog.ipAddress || 'unknown',
        userAgent: auditLog.userAgent || (typeof navigator !== 'undefined' ? navigator.userAgent : 'server')
      });
    } catch (error) {
      console.error('Failed to write audit log:', error);
    }
  }

  async logAuthentication(userId: string, success: boolean, action: string) {
    await this.log({
      userId,
      action,
      resource: 'authentication',
      success,
    });
  }

  async logDataAccess(userId: string, resource: string, resourceId: string) {
    await this.log({
      userId,
      action: 'read',
      resource,
      resourceId,
      success: true,
    });
  }

  async logDataModification(userId: string, action: string, resource: string, resourceId: string, success: boolean) {
    await this.log({
      userId,
      action,
      resource,
      resourceId,
      success,
    });
  }
}

export const auditService = new AuditService();
