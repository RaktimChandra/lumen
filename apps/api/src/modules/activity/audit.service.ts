import type { ActivityEntry, AuditAction } from '@lumen/shared';
import { desc, eq } from 'drizzle-orm';
import type { DbExecutor } from '../../db/client';
import { auditLogs, type AuditLogRow } from '../../db/schema';
import type { ClientPlatform } from '../../lib/request';

export interface AuditEvent {
  userId: string;
  action: AuditAction;
  entityType: ActivityEntry['entityType'];
  entityId?: string | null;
  summary: string;
  platform: ClientPlatform;
  ip?: string | null;
  metadata?: Record<string, unknown>;
}

const MAX_SUMMARY = 300;

/**
 * Append an entry to the audit trail. Pass the open transaction so the entry is
 * written atomically with the change it describes.
 */
export async function recordAudit(db: DbExecutor, event: AuditEvent): Promise<void> {
  await db.insert(auditLogs).values({
    userId: event.userId,
    action: event.action,
    entityType: event.entityType,
    entityId: event.entityId ?? null,
    summary:
      event.summary.length > MAX_SUMMARY
        ? `${event.summary.slice(0, MAX_SUMMARY - 1)}…`
        : event.summary,
    platform: event.platform,
    ipAddress: event.ip ?? null,
    metadata: event.metadata ?? {},
  });
}

export function toActivityEntry(row: AuditLogRow): ActivityEntry {
  return {
    id: row.id,
    action: row.action as AuditAction,
    entityType: row.entityType as ActivityEntry['entityType'],
    entityId: row.entityId,
    summary: row.summary,
    platform: (['web', 'mobile'].includes(row.platform)
      ? row.platform
      : 'unknown') as ActivityEntry['platform'],
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listActivity(
  db: DbExecutor,
  userId: string,
  limit: number,
): Promise<ActivityEntry[]> {
  const rows = await db
    .select()
    .from(auditLogs)
    .where(eq(auditLogs.userId, userId))
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);
  return rows.map(toActivityEntry);
}
