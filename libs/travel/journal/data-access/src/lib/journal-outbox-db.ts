import { Injectable } from '@angular/core';
import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite';
import { OutboxDelivery, parseOutboxDelivery } from '@okr/travel-journal-util';

/**
 * The iPhone's outbox store (spec 1.154 phase 5, decision 9): a tiny SQLite database of its own — NOT the journal
 * database (okr-journal), which the phone never opens. `meta` holds the stamp (device id, clock, delivery counter), the
 * bound author, the prepared journals and the «sent» history; `deliveries` holds what still has to reach an iPad or
 * Firestore, one row per delivery.
 */
const DB_NAME = 'okr-journal-outbox';
const DB_VERSION = 1;

const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);',
  'CREATE TABLE IF NOT EXISTS deliveries (deviceId TEXT PRIMARY KEY, journalKey TEXT NOT NULL, createdAt INTEGER NOT NULL, value TEXT NOT NULL);',
].join('\n');

@Injectable({ providedIn: 'root' })
export class JournalOutboxDb {
  private connection?: Promise<SQLiteDBConnection>;

  public async getMeta(key: string): Promise<string | undefined> {
    const db = await this.db();
    const rows = await db.query('SELECT value FROM meta WHERE key = ?;', [key]);
    return (rows.values?.[0] as { value?: string } | undefined)?.value;
  }

  public async setMeta(key: string, value: string): Promise<void> {
    const db = await this.db();
    await db.run('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?);', [key, value]);
  }

  /** Every stored delivery, oldest first; a damaged row is left out (and logged), never thrown. */
  public async deliveries(): Promise<OutboxDelivery[]> {
    const db = await this.db();
    const rows = await db.query('SELECT deviceId, value FROM deliveries ORDER BY createdAt, deviceId;');
    const out: OutboxDelivery[] = [];
    for (const row of (rows.values ?? []) as { deviceId: string; value: string }[]) {
      let parsed: OutboxDelivery | undefined;
      try {
        parsed = parseOutboxDelivery(JSON.parse(row.value));
      } catch {
        parsed = undefined;
      }
      if (parsed) out.push(parsed);
      else console.warn('journal outbox: a damaged delivery is ignored', row.deviceId);
    }
    return out;
  }

  /** Stores a new delivery together with the stamp it used, in one transaction (a crash keeps both or neither). */
  public async addDelivery(delivery: OutboxDelivery, meta: Record<string, string>): Promise<void> {
    const db = await this.db();
    await db.executeSet([
      {
        statement: 'INSERT INTO deliveries (deviceId, journalKey, createdAt, value) VALUES (?, ?, ?, ?);',
        values: [delivery.deviceId, delivery.journalKey, delivery.createdAt, JSON.stringify(delivery)],
      },
      ...Object.entries(meta).map(([key, value]) => ({ statement: 'INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?);', values: [key, value] })),
    ], true);
  }

  public async updateDelivery(delivery: OutboxDelivery): Promise<void> {
    const db = await this.db();
    await db.run('UPDATE deliveries SET value = ? WHERE deviceId = ?;', [JSON.stringify(delivery), delivery.deviceId]);
  }

  public async removeDelivery(deviceId: string): Promise<void> {
    const db = await this.db();
    await db.run('DELETE FROM deliveries WHERE deviceId = ?;', [deviceId]);
  }

  private db(): Promise<SQLiteDBConnection> {
    this.connection ??= (async () => {
      const sqlite = new SQLiteConnection(CapacitorSQLite);
      const exists = (await sqlite.isConnection(DB_NAME, false)).result;
      const db = exists
        ? await sqlite.retrieveConnection(DB_NAME, false)
        : await sqlite.createConnection(DB_NAME, false, 'no-encryption', DB_VERSION, false);
      await db.open();
      await db.execute(SCHEMA);
      return db;
    })().catch((error: unknown) => {
      this.connection = undefined; // allow a retry
      throw error;
    });
    return this.connection;
  }
}
