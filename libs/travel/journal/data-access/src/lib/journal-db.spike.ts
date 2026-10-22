import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite';

/**
 * Spike S3 (plan 1, Task 4): can SQLite on the iPad hold the travel-journal change log?
 * Writes `count` change records in one transaction, then reads them back ordered by hlc, and
 * reports both durations. Run it from the dev route on a device; run `readDbSpike` after an offline
 * cold start. Replaced by the real local store in plan 2.
 */
const DB_NAME = 'journal-spike';

export interface DbSpikeResult { inserted: number; insertMs: number; read: number; readMs: number }

let connection: SQLiteDBConnection | undefined;

async function open(): Promise<SQLiteDBConnection> {
  if (connection) return connection;
  const sqlite = new SQLiteConnection(CapacitorSQLite);
  const exists = (await sqlite.isConnection(DB_NAME, false)).result;
  const db = exists ? await sqlite.retrieveConnection(DB_NAME, false) : await sqlite.createConnection(DB_NAME, false, 'no-encryption', 1, false);
  await db.open();
  await db.execute(
    'CREATE TABLE IF NOT EXISTS changes (id TEXT PRIMARY KEY, journalKey TEXT, deviceId TEXT, seq INTEGER, hlc TEXT, json TEXT);' +
    'CREATE INDEX IF NOT EXISTS changes_hlc ON changes (hlc);',
  );
  connection = db;
  return db;
}

async function readAll(): Promise<{ read: number; readMs: number }> {
  const db = await open();
  const start = performance.now();
  const rows = await db.query('SELECT id, hlc, json FROM changes ORDER BY hlc');
  return { read: rows.values?.length ?? 0, readMs: Math.round(performance.now() - start) };
}

export async function runDbSpike(count = 10000): Promise<DbSpikeResult> {
  const db = await open();
  await db.execute('DELETE FROM changes;');
  const set = Array.from({ length: count }, (_, i) => ({
    statement: 'INSERT INTO changes (id, journalKey, deviceId, seq, hlc, json) VALUES (?, ?, ?, ?, ?, ?);',
    values: [`spike-${i}`, 'spike', 'dev-spike', i + 1, `${String(1792672881000 + i).padStart(15, '0')}:000000:dev-spike`, JSON.stringify({ fields: { html: `<p>record ${i}</p>` } })],
  }));
  const start = performance.now();
  await db.executeSet(set, true);
  const insertMs = Math.round(performance.now() - start);
  return { inserted: count, insertMs, ...(await readAll()) };
}

/** After an offline cold start: read what is already there, without writing. */
export async function readDbSpike(): Promise<{ read: number; readMs: number }> {
  return readAll();
}
