import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { CapacitorSQLite, capSQLiteSet, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite';
import { groupPointsBySection, LocalTrack, PointRow, TrackPoint } from '@okr/mobility-tracker-util';

/**
 * The tracker's local store on the device: recorded tracks (one JSON row each) and their GPS points.
 * On a native platform it is SQLite; on the web (nx serve) everything lives in memory with the same
 * behaviour. Grouping and ordering of points is shared (groupPointsBySection).
 */
const DB_NAME = 'okr-tracker';
const DB_VERSION = 1;

const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS tracks (key TEXT PRIMARY KEY, json TEXT NOT NULL, updated_at INTEGER NOT NULL);',
  'CREATE TABLE IF NOT EXISTS points (' +
    'track_key TEXT NOT NULL, section INTEGER NOT NULL, lat REAL NOT NULL, lng REAL NOT NULL, t INTEGER NOT NULL, acc REAL);',
  'CREATE INDEX IF NOT EXISTS points_track ON points (track_key, section, t);',
].join('\n');

const INSERT_POINT = 'INSERT INTO points (track_key, section, lat, lng, t, acc) VALUES (?, ?, ?, ?, ?, ?);';

@Injectable({ providedIn: 'root' })
export class TrackDb {
  private connection?: Promise<SQLiteDBConnection>;
  private readonly memTracks = new Map<string, LocalTrack>();
  private readonly memPoints = new Map<string, PointRow[]>();

  /** Idempotent: the first call opens the database and creates the tables (native only). */
  public async open(): Promise<void> {
    if (this.native()) await this.db();
  }

  public async createTrack(t: LocalTrack): Promise<void> {
    await this.saveTrack(t);
  }

  public async updateTrack(t: LocalTrack): Promise<void> {
    await this.saveTrack(t);
  }

  /** A single INSERT per GPS fix: no read-before-write. */
  public async appendPoint(trackKey: string, section: number, p: TrackPoint): Promise<void> {
    if (!this.native()) {
      const rows = this.memPoints.get(trackKey) ?? [];
      rows.push({ section, lat: p.lat, lng: p.lng, t: p.t, acc: p.acc ?? null });
      this.memPoints.set(trackKey, rows);
      return;
    }
    const db = await this.db();
    await db.run(INSERT_POINT, [trackKey, section, p.lat, p.lng, p.t, p.acc ?? null]);
  }

  /** Replaces all points of a track (after a correction) in one transaction. */
  public async replacePoints(trackKey: string, sections: TrackPoint[][]): Promise<void> {
    const rows = sections.flatMap((pts, section) =>
      pts.map((p): PointRow => ({ section, lat: p.lat, lng: p.lng, t: p.t, acc: p.acc ?? null })));
    if (!this.native()) {
      this.memPoints.set(trackKey, rows);
      return;
    }
    const db = await this.db();
    const set: capSQLiteSet[] = [
      { statement: 'DELETE FROM points WHERE track_key = ?;', values: [trackKey] },
      ...rows.map((r) => ({ statement: INSERT_POINT, values: [trackKey, r.section, r.lat, r.lng, r.t, r.acc ?? null] })),
    ];
    await db.executeSet(set, true);
  }

  /** Points grouped by section index, each group ordered by t. */
  public async points(trackKey: string): Promise<TrackPoint[][]> {
    if (!this.native()) return groupPointsBySection(this.memPoints.get(trackKey) ?? []);
    const db = await this.db();
    const res = await db.query('SELECT section, lat, lng, t, acc FROM points WHERE track_key = ? ORDER BY section, t;', [trackKey]);
    return groupPointsBySection((res.values ?? []) as PointRow[]);
  }

  /** All tracks, newest first. A row whose JSON cannot be parsed is skipped. */
  public async list(): Promise<LocalTrack[]> {
    let tracks: LocalTrack[];
    if (!this.native()) {
      tracks = [...this.memTracks.values()];
    } else {
      const db = await this.db();
      const res = await db.query('SELECT json FROM tracks;');
      // a row that cannot be parsed is skipped (and logged), never fatal for the whole list
      tracks = ((res.values ?? []) as { json: string }[]).flatMap((r) => {
        try {
          return [JSON.parse(r.json) as LocalTrack];
        } catch (error) {
          console.warn('TrackDb.list: skipping an unreadable track row', error);
          return [];
        }
      });
    }
    return tracks.sort((a, b) => b.startedAt - a.startedAt);
  }

  public async remove(trackKey: string): Promise<void> {
    if (!this.native()) {
      this.memTracks.delete(trackKey);
      this.memPoints.delete(trackKey);
      return;
    }
    const db = await this.db();
    await db.executeSet([
      { statement: 'DELETE FROM points WHERE track_key = ?;', values: [trackKey] },
      { statement: 'DELETE FROM tracks WHERE key = ?;', values: [trackKey] },
    ], true);
  }

  private async saveTrack(t: LocalTrack): Promise<void> {
    if (!this.native()) {
      this.memTracks.set(t.key, structuredClone(t));
      return;
    }
    const db = await this.db();
    await db.run('INSERT OR REPLACE INTO tracks (key, json, updated_at) VALUES (?, ?, ?);', [t.key, JSON.stringify(t), Date.now()]);
  }

  private native(): boolean {
    return Capacitor.isNativePlatform();
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
