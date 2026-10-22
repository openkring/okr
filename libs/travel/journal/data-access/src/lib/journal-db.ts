import { Injectable } from '@angular/core';
import { CapacitorSQLite, capSQLiteSet, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite';
import { JournalChange } from '@okr/shared-models';

/**
 * The travel journal's local store on the iPad (spec 1.113 §4): the append-only change log plus a
 * small key/value table. A thin wrapper over the native SQLite plugin — every rule (merge, owner,
 * view) lives in @okr/travel-journal-util. Spike S3: 10,000 records read in 58 ms after an offline
 * cold start.
 */
const DB_NAME = 'okr-journal';
const DB_VERSION = 1;

const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);',
  'CREATE TABLE IF NOT EXISTS changes (' +
    'id TEXT PRIMARY KEY, journalKey TEXT NOT NULL, deviceId TEXT NOT NULL, seq INTEGER NOT NULL, ' +
    'hlc TEXT NOT NULL, authorKey TEXT NOT NULL, entity TEXT NOT NULL, entityKey TEXT NOT NULL, ' +
    'op TEXT NOT NULL, fields TEXT NOT NULL, uploadedAt TEXT);',
  'CREATE INDEX IF NOT EXISTS changes_journal ON changes (journalKey, hlc);',
  'CREATE UNIQUE INDEX IF NOT EXISTS changes_device_seq ON changes (deviceId, seq);',
].join('\n');

interface ChangeRow {
  id: string; journalKey: string; deviceId: string; seq: number; hlc: string; authorKey: string;
  entity: JournalChange['entity']; entityKey: string; op: JournalChange['op']; fields: string;
}

@Injectable({ providedIn: 'root' })
export class JournalDb {
  private connection?: Promise<SQLiteDBConnection>;

  /** Idempotent: the first call opens the database and creates the tables. */
  public open(): Promise<void> {
    return this.db().then(() => undefined);
  }

  public async getMeta(key: string): Promise<string | undefined> {
    const db = await this.db();
    const rows = await db.query('SELECT value FROM meta WHERE key = ?;', [key]);
    return (rows.values?.[0] as { value?: string } | undefined)?.value;
  }

  public async setMeta(key: string, value: string): Promise<void> {
    const db = await this.db();
    await db.run('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?);', [key, value]);
  }

  /**
   * Appends change records — and optional meta values, e.g. the device clock — in ONE transaction:
   * after a crash either all of them are stored or none. A record whose id exists is ignored.
   * Returns the number of records inserted.
   */
  public async appendChanges(changes: JournalChange[], meta: Record<string, string> = {}): Promise<number> {
    if (changes.length === 0 && Object.keys(meta).length === 0) return 0;
    const db = await this.db();
    const before = await this.count(db);
    const set: capSQLiteSet[] = changes.map((c) => ({
      statement: 'INSERT OR IGNORE INTO changes (id, journalKey, deviceId, seq, hlc, authorKey, entity, entityKey, op, fields) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);',
      values: [c.id, c.journalKey, c.deviceId, c.seq, c.hlc, c.authorKey, c.entity, c.entityKey, c.op, JSON.stringify(c.fields)],
    }));
    for (const [key, value] of Object.entries(meta)) {
      set.push({ statement: 'INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?);', values: [key, value] });
    }
    await db.executeSet(set, true);
    return (await this.count(db)) - before;
  }

  public async listChanges(journalKey?: string): Promise<JournalChange[]> {
    const db = await this.db();
    const rows = journalKey
      ? await db.query('SELECT * FROM changes WHERE journalKey = ? ORDER BY hlc;', [journalKey])
      : await db.query('SELECT * FROM changes ORDER BY hlc;');
    return ((rows.values ?? []) as ChangeRow[]).map((r) => ({
      id: r.id, journalKey: r.journalKey, deviceId: r.deviceId, seq: Number(r.seq), hlc: r.hlc, authorKey: r.authorKey,
      entity: r.entity, entityKey: r.entityKey, op: r.op, fields: JSON.parse(r.fields) as Record<string, unknown>,
    }));
  }

  public async hasAnyJournal(): Promise<boolean> {
    const db = await this.db();
    const rows = await db.query("SELECT 1 FROM changes WHERE entity = 'journal' AND op = 'create' LIMIT 1;");
    return (rows.values?.length ?? 0) > 0;
  }

  private async count(db: SQLiteDBConnection): Promise<number> {
    const rows = await db.query('SELECT COUNT(*) AS n FROM changes;');
    return Number((rows.values?.[0] as { n?: number } | undefined)?.n ?? 0);
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
