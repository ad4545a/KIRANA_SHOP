import { firestore } from '../../config/firebase';
import { COLLECTIONS } from '../../infrastructure/firestore/collections';
import { AuditLogQueryDto } from './auditLog.dto';
import { AuditLogEntry } from './auditLog.types';

export class AuditLogService {
  /**
   * List audit logs (OWNER only per PRD §4 & §15).
   */
  public async listAuditLogs(query: AuditLogQueryDto): Promise<AuditLogEntry[]> {
    let collectionRef: FirebaseFirestore.Query = firestore.collection(COLLECTIONS.AUDIT_LOGS);

    if (query.action) {
      collectionRef = collectionRef.where('action', '==', query.action.trim());
    }
    if (query.targetType) {
      collectionRef = collectionRef.where('targetType', '==', query.targetType.trim());
    }
    if (query.targetId) {
      collectionRef = collectionRef.where('targetId', '==', query.targetId.trim());
    }
    if (query.actorId) {
      collectionRef = collectionRef.where('actorId', '==', query.actorId.trim());
    }

    const snapshot = await collectionRef.orderBy('createdAt', 'desc').get();
    let logs = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        logId: doc.id,
        actorId: data.actorId,
        actorRole: data.actorRole,
        action: data.action,
        targetType: data.targetType,
        targetId: data.targetId,
        beforeState: data.beforeState,
        afterState: data.afterState,
        createdAt: data.createdAt,
      } as AuditLogEntry;
    });

    if (query.limit && !isNaN(Number(query.limit))) {
      logs = logs.slice(0, Number(query.limit));
    }

    return logs;
  }
}

export const auditLogService = new AuditLogService();
