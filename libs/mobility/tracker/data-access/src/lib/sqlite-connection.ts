import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite';

/**
 * Creates the read-write connection to a native SQLite database, surviving a WebView reload.
 *
 * `SQLiteConnection.isConnection` only looks at the JS-side map of that one `SQLiteConnection`
 * instance, which is empty after every page (re)load — while the native plugin keeps its connections
 * for the whole app process. So after a reload (update prompt, `location.reload()`) the old
 * isConnection → createConnection pattern threw `CreateConnection: Connection <name> already exists`
 * (Sentry BKG-3). The stale native connection belongs to a JS context that no longer exists, so it is
 * closed first; closing an unknown connection is a no-op natively.
 */
export async function createSqliteConnection(database: string, version: number): Promise<SQLiteDBConnection> {
  try {
    await CapacitorSQLite.closeConnection({ database, readonly: false });
  } catch {
    // nothing to close — the normal cold start
  }
  return new SQLiteConnection(CapacitorSQLite).createConnection(database, false, 'no-encryption', version, false);
}
