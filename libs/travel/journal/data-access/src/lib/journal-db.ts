import { Injectable } from '@angular/core';
import { CapacitorSQLite, capSQLiteSet, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite';
import { JournalChange } from '@okr/shared-models';
import { decodeChangeRow, StoredChangeRow } from '@okr/travel-journal-util';

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
  'CREATE INDEX IF NOT EXISTS changes_pending ON changes (uploadedAt);',
  // plan 4: photo files of the journal and whether this device uploaded them / holds them
  'CREATE TABLE IF NOT EXISTS photo_files (' +
    'file TEXT PRIMARY KEY, journalKey TEXT NOT NULL, uploaded INTEGER NOT NULL DEFAULT 0, present INTEGER NOT NULL DEFAULT 0);',
].join('\n');

/** A record received from the server, with its upload time (ms). */
export interface RemoteChange { change: JournalChange; uploadedAtMs: number }

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
   * Appends this device's own change records — and optional meta values, e.g. the device clock — in ONE
   * transaction: after a crash either all of them are stored or none. A plain INSERT: a clash on id or
   * on (deviceId, seq) fails and rolls the whole action back instead of silently dropping a record
   * (plan 2 final review). Records received from peers or the server (plans 4–5) need their own
   * INSERT OR IGNORE path, where duplicates are expected.
   */
  public async appendChanges(changes: JournalChange[], meta: Record<string, string> = {}): Promise<void> {
    if (changes.length === 0 && Object.keys(meta).length === 0) return;
    const db = await this.db();
    const set: capSQLiteSet[] = changes.map((c) => ({
      statement: 'INSERT INTO changes (id, journalKey, deviceId, seq, hlc, authorKey, entity, entityKey, op, fields) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);',
      values: [c.id, c.journalKey, c.deviceId, c.seq, c.hlc, c.authorKey, c.entity, c.entityKey, c.op, JSON.stringify(c.fields)],
    }));
    for (const [key, value] of Object.entries(meta)) {
      set.push({ statement: 'INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?);', values: [key, value] });
    }
    await db.executeSet(set, true);
  }

  /** The highest seq stored for this device — a floor for the device's next seq. */
  public async maxSeq(deviceId: string): Promise<number> {
    const db = await this.db();
    const rows = await db.query('SELECT MAX(seq) AS n FROM changes WHERE deviceId = ?;', [deviceId]);
    return Number((rows.values?.[0] as { n?: number | null } | undefined)?.n ?? 0);
  }

  public async listChanges(journalKey?: string): Promise<JournalChange[]> {
    const db = await this.db();
    const rows = journalKey
      ? await db.query('SELECT * FROM changes WHERE journalKey = ? ORDER BY hlc;', [journalKey])
      : await db.query('SELECT * FROM changes ORDER BY hlc;');
    // a damaged row is skipped, never allowed to hide the whole journal
    return ((rows.values ?? []) as StoredChangeRow[])
      .map(decodeChangeRow)
      .filter((c): c is JournalChange => c !== undefined);
  }

  /**
   * Records not yet in Firestore (plan 4): `uploadedAt` is empty until the upload is confirmed. In clock
   * order, so a journal's create record goes before its footprints.
   */
  public async pendingUploads(limit: number): Promise<JournalChange[]> {
    const db = await this.db();
    const rows = await db.query('SELECT * FROM changes WHERE uploadedAt IS NULL ORDER BY hlc LIMIT ?;', [limit]);
    return ((rows.values ?? []) as StoredChangeRow[]).map(decodeChangeRow).filter((c): c is JournalChange => c !== undefined);
  }

  public async countPendingUploads(): Promise<number> {
    const db = await this.db();
    const rows = await db.query('SELECT COUNT(*) AS n FROM changes WHERE uploadedAt IS NULL;');
    return Number((rows.values?.[0] as { n?: number } | undefined)?.n ?? 0);
  }

  public async markUploaded(ids: string[], uploadedAtMs: number): Promise<void> {
    if (ids.length === 0) return;
    const db = await this.db();
    await db.executeSet(ids.map((id) => ({
      statement: 'UPDATE changes SET uploadedAt = ? WHERE id = ? AND uploadedAt IS NULL;', values: [String(uploadedAtMs), id],
    })), true);
  }

  /**
   * Records downloaded from Firestore, in one transaction. INSERT OR IGNORE: the device already holds
   * its own records and those received over P2P — for those only the upload mark is set.
   */
  public async appendRemoteChanges(remote: RemoteChange[]): Promise<void> {
    if (remote.length === 0) return;
    const db = await this.db();
    const set: capSQLiteSet[] = remote.flatMap(({ change: c, uploadedAtMs }) => [
      {
        statement: 'INSERT OR IGNORE INTO changes (id, journalKey, deviceId, seq, hlc, authorKey, entity, entityKey, op, fields, uploadedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);',
        values: [c.id, c.journalKey, c.deviceId, c.seq, c.hlc, c.authorKey, c.entity, c.entityKey, c.op, JSON.stringify(c.fields), String(uploadedAtMs)],
      },
      { statement: 'UPDATE changes SET uploadedAt = ? WHERE id = ? AND uploadedAt IS NULL;', values: [String(uploadedAtMs), c.id] },
    ]);
    await db.executeSet(set, true);
  }

  /**
   * Records received from the other iPad (plan 5): INSERT OR IGNORE, and `uploadedAt` stays empty — this
   * device uploads them when it is online first (any author's device uploads every author's records).
   */
  public async appendPeerChanges(changes: JournalChange[]): Promise<void> {
    if (changes.length === 0) return;
    const db = await this.db();
    await db.executeSet(changes.map((c) => ({
      statement: 'INSERT OR IGNORE INTO changes (id, journalKey, deviceId, seq, hlc, authorKey, entity, entityKey, op, fields) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);',
      values: [c.id, c.journalKey, c.deviceId, c.seq, c.hlc, c.authorKey, c.entity, c.entityKey, c.op, JSON.stringify(c.fields)],
    })), true);
  }

  /** Registers photo files of a journal; `present` = the file is on this device. Existing rows keep their marks. */
  public async notePhotoFiles(journalKey: string, files: string[], present: boolean): Promise<void> {
    if (files.length === 0) return;
    const db = await this.db();
    await db.executeSet(files.flatMap((file) => [
      { statement: 'INSERT OR IGNORE INTO photo_files (file, journalKey, present) VALUES (?, ?, ?);', values: [file, journalKey, present ? 1 : 0] },
      ...(present ? [{ statement: 'UPDATE photo_files SET present = 1 WHERE file = ?;', values: [file] }] : []),
    ]), true);
  }

  public async photoFiles(journalKey: string): Promise<{ file: string; uploaded: boolean; present: boolean }[]> {
    const db = await this.db();
    const rows = await db.query('SELECT file, uploaded, present FROM photo_files WHERE journalKey = ?;', [journalKey]);
    return ((rows.values ?? []) as { file: string; uploaded: number; present: number }[])
      .map((r) => ({ file: r.file, uploaded: r.uploaded === 1, present: r.present === 1 }));
  }

  public async markPhotosUploaded(files: string[]): Promise<void> {
    if (files.length === 0) return;
    const db = await this.db();
    await db.executeSet(files.map((file) => ({ statement: 'UPDATE photo_files SET uploaded = 1, present = 1 WHERE file = ?;', values: [file] })), true);
  }

  public async hasAnyJournal(): Promise<boolean> {
    const db = await this.db();
    const rows = await db.query("SELECT 1 FROM changes WHERE entity = 'journal' AND op = 'create' LIMIT 1;");
    return (rows.values?.length ?? 0) > 0;
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
