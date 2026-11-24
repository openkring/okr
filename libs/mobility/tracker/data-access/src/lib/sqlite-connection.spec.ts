import { beforeEach, describe, expect, it, vi } from 'vitest';

/** The native plugin's connection table: it lives as long as the app process and survives a WebView reload. */
const native = vi.hoisted(() => new Set<string>());

vi.mock('@capacitor-community/sqlite', () => ({
  CapacitorSQLite: {
    closeConnection: vi.fn(async ({ database }: { database: string }) => void native.delete(database)),
  },
  // a new SQLiteConnection per page load; like the plugin, the native side refuses a second connection of the same name
  SQLiteConnection: class {
    public async createConnection(database: string): Promise<{ database: string }> {
      if (native.has(database)) throw new Error(`CreateConnection: Connection ${database} already exists`);
      native.add(database);
      return { database };
    }
  },
}));

import { CapacitorSQLite } from '@capacitor-community/sqlite';
import { createSqliteConnection } from './sqlite-connection';

describe('createSqliteConnection', () => {
  beforeEach(() => native.clear());

  it('opens on a cold start', async () => {
    await expect(createSqliteConnection('okr-tracker', 1)).resolves.toEqual({ database: 'okr-tracker' });
  });

  it('opens again after a WebView reload, while the native connection still exists', async () => {
    native.add('okr-tracker');
    await expect(createSqliteConnection('okr-tracker', 1)).resolves.toEqual({ database: 'okr-tracker' });
  });

  it('opens when there is nothing to close', async () => {
    vi.mocked(CapacitorSQLite.closeConnection).mockRejectedValueOnce(new Error('CloseConnection: not available'));
    await expect(createSqliteConnection('okr-tracker', 1)).resolves.toEqual({ database: 'okr-tracker' });
  });
});
