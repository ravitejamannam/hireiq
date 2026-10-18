/**
 * Backup policy for the application database.
 *
 * RPO (recovery point objective): 24 hours. A daily snapshot is the
 * oldest acceptable loss. Take the snapshot after the cron window.
 * RTO (recovery time objective): 4 hours. Restoring a snapshot and
 * pointing the app at it should finish inside that window.
 */
export const BACKUP_RPO_HOURS = 24;
export const BACKUP_RTO_HOURS = 4;

export type Snapshot = { takenAt: string; rows: Record<string, string>[] };

export function takeSnapshot(rows: Record<string, string>[], takenAt: Date): Snapshot {
  return {
    takenAt: takenAt.toISOString(),
    rows: rows.map((row) => ({ ...row })),
  };
}

export function restoreSnapshot(snapshot: Snapshot): Record<string, string>[] {
  return snapshot.rows.map((row) => ({ ...row }));
}

export function withinRpo(snapshot: Snapshot, now: Date) {
  const ageMs = now.getTime() - Date.parse(snapshot.takenAt);
  return ageMs >= 0 && ageMs <= BACKUP_RPO_HOURS * 60 * 60 * 1000;
}
