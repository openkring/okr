/**
 * Spec 1.164 §7.2: links every existing postal address row to a register location, resolves the
 * conflicts that linking reveals, widens the winners' tenants and repairs the favorites. Run once
 * through `scripts/migrate-postal-residences.ts` (dry run by default). Idempotent: a row that already
 * has a `locationKey` is not geocoded again, and a second run finds nothing left to do.
 */
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import type { Firestore, Timestamp } from 'firebase-admin/firestore';

import { ADDRESS_REGISTER_TENANT, DEFAULT_ADDRESS_USAGE } from '@okr/shared-constants';
import { AddressCollection, AddressModel, AvatarInfo, LocationCollection, TaskCollection, TaskModel } from '@okr/shared-models';
import { getFullName } from '@okr/shared-util-core';
import { getTaskIndex } from '@okr/project-task-util';
import {
  AddressSnapshot, buildRegisterLocation, findOrCreateRegisterLocation, geocodeSnapshot, getMemberAdminPersons,
  isRegisterLocation, ManualAddressInput, parseParentKey, RegisterAddressInput, residenceTenants, snapshotFromLocation,
  SwissAddressHit,
} from '@okr/shared-util-functions';

import { SYSTEM_AUTHOR } from '../workflow/activity';

/** One postal row as read: the model, its document id and its Firestore `updateTime` (ISO string). */
export interface MigrationRow {
  okey: string;
  row: AddressModel;
  updateTime: string;
}

export interface ConflictPair {
  loser: MigrationRow;
  winner: MigrationRow;
}

/** Same tag as the move notices (residence-notices.ts): a memberAdmin finds both under «umzug». */
export const MIGRATION_TASK_TAG = 'umzug';
export const MIGRATION_TASK_NAME = 'Adressen ersetzt (Migration)';
const NOTE_PREFIX = 'Migration 1.164: ersetzt durch';
const PROGRESS_EVERY = 100;
/** Two rows of one group written this close together are a tie, not «the newer one wins» (a script run takes about a minute). */
export const TIE_WINDOW_MS = 120_000;
/** Firestore allows 500 writes per batch; a parent's writes are never split across batches. */
const BATCH_LIMIT = 400;

const SNAPSHOT_FIELDS = ['streetName', 'streetNumber', 'zipCode', 'city', 'countryCode'] as const;

function str(value: unknown): string {
  return String(value ?? '');
}

/** A legacy row without `addressUsage` counts as the default usage (as in residence.logic.ts). */
function usageOf(r: MigrationRow): string {
  return str(r.row.addressUsage) || DEFAULT_ADDRESS_USAGE;
}

/**
 * True when the row carries no residence period. Only undated rows are legacy duplicates; a dated
 * row belongs to a recorded move (closed predecessor, successor) and is history, never a conflict.
 */
export function isUndated(r: MigrationRow): boolean {
  return str(r.row.validFrom) === '' && str(r.row.validTo) === '';
}

/** Newest first; equal times fall back to the okey so the outcome never depends on read order. */
function newestFirst(a: MigrationRow, b: MigrationRow): number {
  if (a.updateTime !== b.updateTime) return a.updateTime < b.updateTime ? 1 : -1;
  return a.okey < b.okey ? -1 : a.okey > b.okey ? 1 : 0;
}

/**
 * Pure. Groups the linked rows by `parentKey` + `addressUsage` (home vs work never conflict) and keeps
 * the most recently updated row of each group; every other row of the group loses — whether it
 * points at a different location (a conflict) or at the same one (a duplicate from another tenant).
 * Rows without a location (ambiguous or no swisstopo hit) and dated rows (a recorded move) take no
 * part: neither winner nor loser.
 *
 * A tie: a row at a different location written within `TIE_WINDOW_MS` of the newest one (a bulk
 * import writes a person's rows within seconds, so «most recent» is only the import order). Such
 * a group stays untouched — no winner, no loser — and every other row of it is listed in `ties` for a
 * human to decide.
 */
export function resolveConflicts(rows: MigrationRow[], locationOf: (okey: string) => string | undefined): { winners: MigrationRow[]; losers: ConflictPair[]; ties: ConflictPair[] } {
  const groups = new Map<string, MigrationRow[]>();
  for (const r of rows) {
    if (!locationOf(r.okey) || !isUndated(r)) continue;
    const key = `${str(r.row.parentKey)}|${usageOf(r)}`;
    const group = groups.get(key) ?? [];
    group.push(r);
    groups.set(key, group);
  }
  const winners: MigrationRow[] = [];
  const losers: ConflictPair[] = [];
  const ties: ConflictPair[] = [];
  for (const group of groups.values()) {
    const [winner, ...rest] = [...group].sort(newestFirst);
    const pairs = rest.map((loser) => ({ loser, winner }));
    const tied = rest.some((r) => locationOf(r.okey) !== locationOf(winner.okey) && Date.parse(winner.updateTime) - Date.parse(r.updateTime) <= TIE_WINDOW_MS);
    if (tied) { ties.push(...pairs); continue; }
    winners.push(winner);
    losers.push(...pairs);
  }
  return { winners, losers, ties };
}

/** «Seestrasse 12, 8712 Stäfa» — empty parts are left out. */
export function addressLine(a: Pick<AddressModel, 'streetName' | 'streetNumber' | 'zipCode' | 'city'>): string {
  const street = [a.streetName, a.streetNumber].map((s) => str(s).trim()).filter(Boolean).join(' ');
  const place = [a.zipCode, a.city].map((s) => str(s).trim()).filter(Boolean).join(' ');
  return [street, place].filter(Boolean).join(', ');
}

/**
 * Pure. One entry per tenant that lost a row: one line per parent — its display name only, sorted.
 * No address: the task reaches every memberAdmin of the tenant (and stays after the person left);
 * the admin opens the person to see the address. `nameOf` gives the parent's display name (default:
 * the parentKey).
 */
export function summaryTasks(
  losers: ConflictPair[],
  tenantOf: (row: MigrationRow) => string[],
  nameOf: (row: MigrationRow) => string = (r) => str(r.row.parentKey),
): Map<string, string[]> {
  // per tenant: parentKey → name, so two parents of the same name stay two lines
  const lines = new Map<string, Map<string, string>>();
  for (const { loser } of losers) {
    for (const tenantId of tenantOf(loser)) {
      const byParent = lines.get(tenantId) ?? new Map<string, string>();
      byParent.set(str(loser.row.parentKey), nameOf(loser));
      lines.set(tenantId, byParent);
    }
  }
  return new Map([...lines].sort(([a], [b]) => a.localeCompare(b)).map(([t, byParent]) => [t, [...byParent.values()].sort()]));
}

/**
 * Pure. The favorite flags after the conflicts: a winner whose loser was the favorite takes it over,
 * then each parent keeps at most one favorite among its remaining active postal rows (the most
 * recently updated one). Losers lose the flag. Returns only the rows whose flag changes.
 */
export function repairFavorites(activeRows: MigrationRow[], losers: ConflictPair[]): Map<string, boolean> {
  const loserKeys = new Set(losers.map((p) => p.loser.okey));
  const fav = new Map<string, boolean>();
  for (const r of activeRows) if (!loserKeys.has(r.okey)) fav.set(r.okey, r.row.isFavorite === true);
  for (const { loser, winner } of losers) {
    if (loser.row.isFavorite === true && fav.has(winner.okey)) fav.set(winner.okey, true);
  }
  const byParent = new Map<string, MigrationRow[]>();
  for (const r of activeRows) {
    if (loserKeys.has(r.okey) || !fav.get(r.okey)) continue;
    const list = byParent.get(str(r.row.parentKey)) ?? [];
    list.push(r);
    byParent.set(str(r.row.parentKey), list);
  }
  for (const favorites of byParent.values()) {
    for (const extra of [...favorites].sort(newestFirst).slice(1)) fav.set(extra.okey, false);
  }
  const changes = new Map<string, boolean>();
  for (const r of activeRows) {
    const next = loserKeys.has(r.okey) ? false : fav.get(r.okey) === true;
    if (next !== (r.row.isFavorite === true)) changes.set(r.okey, next);
  }
  return changes;
}

/** Deterministic id of a summary task: a re-run writes the same id and `create()` refuses it. */
export function migrationTaskId(tenantId: string, adminKey: string): string {
  return 'umzug-migration-' + createHash('sha256').update(`${tenantId}|${adminKey}`).digest('hex').substring(0, 32);
}

// ─── the run ───────────────────────────────────────────────────────────────────────────────

export interface MigrationOptions {
  write: boolean;
  /** Where the JSON report goes. The runner puts it into the OS temp dir: it names persons. */
  reportPath: string;
  fetchFn?: typeof fetch;
  log?: (message: string) => void;
}

interface RowRef {
  okey: string;
  parentKey: string;
  text: string;
}

export interface MigrationReport {
  mode: 'write' | 'dry-run';
  counts: Record<string, number>;
  misses: RowRef[];
  ambiguous: (RowRef & { suggestions: string[] })[];
  foreignTenants: (RowRef & { rowTenants: string[]; parentTenants: string[]; reason: string })[];
  conflicts: { parentKey: string; addressUsage: string; kind: 'different-location' | 'same-location'; winner: RowRef & { tenants: string[]; updateTime: string }; loser: RowRef & { tenants: string[]; updateTime: string } }[];
  /** Groups left untouched: rows written within TIE_WINDOW_MS of each other at different locations. */
  ties: { parentKey: string; addressUsage: string; kind: 'different-location' | 'same-location'; winner: RowRef & { tenants: string[]; updateTime: string }; loser: RowRef & { tenants: string[]; updateTime: string } }[];
  favorites: { okey: string; parentKey: string; isFavorite: boolean }[];
  tasks: { tenantId: string; lines: string[]; assignees: string[] }[];
  failed: { parentKey: string; error: string }[];
}

interface Parent {
  tenants: string[];
  name: string;
  exists: boolean;
}

function parentName(type: 'person' | 'org', data: Record<string, unknown>): string {
  if (type === 'org') return str(data['name']);
  return getFullName(str(data['firstName']), str(data['lastName']));
}

function isSwiss(countryCode: string | undefined): boolean {
  const cc = str(countryCode).trim().toUpperCase();
  return cc === '' || cc === 'CH';
}

function toIso(t: Timestamp | undefined): string {
  return t ? t.toDate().toISOString() : '';
}

/**
 * Runs the migration. Dry run (`write: false`) only reads: register locations that would be created
 * get a planned key in memory (one per EGAID), tasks are listed, nothing is written to Firestore.
 * The JSON report is written to `reportPath` in both modes.
 */
export async function runPostalResidenceMigration(db: Firestore, opts: MigrationOptions): Promise<MigrationReport> {
  const log = opts.log ?? ((m: string) => console.log(m));
  const counts: Record<string, number> = {};
  const count = (key: string, n = 1): void => { counts[key] = (counts[key] ?? 0) + n; };
  const report: MigrationReport = {
    mode: opts.write ? 'write' : 'dry-run', counts, misses: [], ambiguous: [], foreignTenants: [], conflicts: [], ties: [], favorites: [], tasks: [], failed: [],
  };

  // 1. read every postal row (archived ones are history and stay untouched)
  const snap = await db.collection(AddressCollection).where('addressChannel', '==', 'postal').get();
  const rows: MigrationRow[] = [];
  const preconditions = new Map<string, Timestamp>();
  for (const doc of snap.docs) {
    const row = { ...(doc.data() as AddressModel), okey: doc.id };
    count('postal rows');
    if (row.isArchived === true) { count('archived (untouched)'); continue; }
    rows.push({ okey: doc.id, row, updateTime: toIso(doc.updateTime) });
    if (doc.updateTime) preconditions.set(doc.id, doc.updateTime);
  }

  // 2. the parents' tenants and names
  const parents = new Map<string, Parent>();
  for (const parentKey of new Set(rows.map((r) => str(r.row.parentKey)))) {
    const parsed = parseParentKey(parentKey);
    if (!parsed) { parents.set(parentKey, { tenants: [], name: parentKey, exists: false }); continue; }
    const data = (await db.collection(parsed.parentCollection).doc(parsed.parentId).get()).data();
    parents.set(parentKey, data
      ? { tenants: (data['tenants'] as string[] | undefined) ?? [], name: parentName(parsed.parentType, data) || parentKey, exists: true }
      : { tenants: [], name: parentKey, exists: false });
  }
  const foreign = new Set<string>();                           // rows sharing no tenant with their parent: listed only
  const parentOf = (r: MigrationRow): Parent => parents.get(str(r.row.parentKey)) ?? { tenants: [], name: str(r.row.parentKey), exists: false };
  const ref = (r: MigrationRow): RowRef => ({ okey: r.okey, parentKey: str(r.row.parentKey), text: addressLine(r.row) });

  // 3. link: find (or plan) the register location of every unlinked row
  const location = new Map<string, string>();                  // row okey → location key
  const snapshots = new Map<string, AddressSnapshot>();        // row okey → normalised snapshot (newly linked rows)
  const newlyLinked = new Set<string>();
  const egaidKeys = new Map<string, string>();                 // egaid → location key (this run)
  let manualPlanned = 0;

  const locationFor = async (input: RegisterAddressInput): Promise<string> => {
    const egaid = 'egaid' in input ? (input as SwissAddressHit).egaid : undefined;
    if (egaid !== undefined && egaidKeys.has(egaid)) { count('locations reused (this run)'); return egaidKeys.get(egaid) as string; }
    let key: string;
    if (opts.write) {
      key = await findOrCreateRegisterLocation(db, input);
      count(egaid === undefined ? 'manual locations created' : 'register locations found or created');
    } else if (egaid === undefined) {
      key = `dry-run:manual:${++manualPlanned}`;
      count('manual locations to create');
    } else {
      const existing = await db.collection(LocationCollection).where('properties', 'array-contains', { key: 'egaid', value: String(egaid) }).get();
      const found = existing.docs.find((d) => isRegisterLocation(d.data() as { tenants?: string[] }));
      if (found) { key = found.id; count('register locations found'); }
      else { key = `dry-run:egaid:${egaid}`; count('register locations to create'); }
    }
    if (egaid !== undefined) egaidKeys.set(egaid, key);
    return key;
  };

  let processed = 0;
  for (const r of rows) {
    if (++processed % PROGRESS_EVERY === 0) log(`… ${processed}/${rows.length} rows`);
    const parent = parentOf(r);
    // a row sharing no tenant with its parent is neither linked, widened nor part of a conflict
    // (heal rule, injection guard): it is only listed
    if (residenceTenants(r.row.tenants, parent.tenants).length === 0) {
      count('foreign/empty tenants (untouched)');
      foreign.add(r.okey);
      report.foreignTenants.push({
        ...ref(r), rowTenants: r.row.tenants ?? [], parentTenants: parent.tenants,
        reason: !parent.exists ? 'parent missing' : (r.row.tenants ?? []).length === 0 ? 'row has no tenants' : 'no tenant shared with parent',
      });
      continue;
    }
    if (str(r.row.locationKey)) {
      count('already linked (skipped)');
      location.set(r.okey, str(r.row.locationKey));
      continue;
    }
    let input: RegisterAddressInput;
    if (isSwiss(r.row.countryCode)) {
      const outcome = await geocodeSnapshot(
        { streetName: str(r.row.streetName), streetNumber: str(r.row.streetNumber), zipCode: str(r.row.zipCode), city: str(r.row.city) },
        opts.fetchFn,
      );
      if (outcome.kind === 'none') { count('geocode misses'); report.misses.push(ref(r)); continue; }
      if (outcome.kind === 'ambiguous') {
        count('ambiguous (not linked)');
        report.ambiguous.push({ ...ref(r), suggestions: outcome.hits.map((h) => h.label || addressLine(h)) });
        continue;
      }
      input = outcome.hit;
    } else {
      const manual: ManualAddressInput = {
        streetName: str(r.row.streetName), streetNumber: str(r.row.streetNumber), zipCode: str(r.row.zipCode), city: str(r.row.city), countryCode: str(r.row.countryCode),
      };
      input = manual;
      count('abroad (manual location)');
    }
    location.set(r.okey, await locationFor(input));
    snapshots.set(r.okey, snapshotFromLocation(buildRegisterLocation(input)));
    newlyLinked.add(r.okey);
    count('linked');
  }

  // 4. conflicts, favorites, summary lines
  const { winners, losers, ties } = resolveConflicts(rows, (okey) => location.get(okey));
  const asLinked = (r: MigrationRow): MigrationRow => {
    const s = snapshots.get(r.okey);
    return s ? { ...r, row: { ...r.row, ...s } } : r;
  };
  for (const { loser, winner } of losers) {
    const sameLocation = location.get(loser.okey) === location.get(winner.okey);
    count(sameLocation ? 'duplicates archived (same location)' : 'conflicts archived (different location)');
    const side = (m: MigrationRow) => ({ ...ref(m), tenants: m.row.tenants ?? [], updateTime: m.updateTime });
    report.conflicts.push({ parentKey: str(winner.row.parentKey), addressUsage: usageOf(winner), kind: sameLocation ? 'same-location' : 'different-location', winner: side(winner), loser: side(loser) });
  }
  for (const { loser, winner } of ties) {
    count('ties left untouched (rows)');
    const side = (m: MigrationRow) => ({ ...ref(m), tenants: m.row.tenants ?? [], updateTime: m.updateTime });
    const sameLocation = location.get(loser.okey) === location.get(winner.okey);
    report.ties.push({ parentKey: str(winner.row.parentKey), addressUsage: usageOf(winner), kind: sameLocation ? 'same-location' : 'different-location', winner: side(winner), loser: side(loser) });
  }
  // favorites: only undated rows of the parent's own tenants are candidates; dated rows belong to
  // the move switch, foreign rows are never patched
  const favoriteChanges = repairFavorites(rows.filter((r) => isUndated(r) && !foreign.has(r.okey)), losers);
  const byOkey = new Map(rows.map((r) => [r.okey, r]));
  for (const [okey, isFavorite] of favoriteChanges) {
    report.favorites.push({ okey, parentKey: str(byOkey.get(okey)?.row.parentKey), isFavorite });
    count(isFavorite ? 'favorites set' : 'favorites cleared');
  }

  // 5. the patches, per row
  const patches = new Map<string, Record<string, unknown>>();
  const patchOf = (okey: string): Record<string, unknown> => {
    const p = patches.get(okey) ?? {};
    patches.set(okey, p);
    return p;
  };
  for (const okey of newlyLinked) {
    const r = byOkey.get(okey) as MigrationRow;
    const p = patchOf(okey);
    p['locationKey'] = location.get(okey);
    // a missing date becomes '' (open); an existing one is kept — a row closed by a move recorded
    // before the migration must stay closed
    if (r.row.validFrom === undefined) p['validFrom'] = '';
    if (r.row.validTo === undefined) p['validTo'] = '';
    const s = snapshots.get(okey) as AddressSnapshot;
    for (const f of SNAPSHOT_FIELDS) if (str(r.row[f]) !== s[f]) p[f] = s[f];
  }
  for (const w of winners) {
    const tenants = residenceTenants(w.row.tenants, parentOf(w).tenants);
    const current = [...new Set(w.row.tenants ?? [])].sort();
    const next = [...new Set(tenants)].sort();
    if (tenants.length > 0 && (current.length !== next.length || current.some((t, i) => t !== next[i]))) {
      patchOf(w.okey)['tenants'] = tenants;
      count('tenants widened');
    }
  }
  for (const { loser, winner } of losers) {
    const p = patchOf(loser.okey);
    p['isArchived'] = true;
    const note = `${NOTE_PREFIX} ${addressLine(asLinked(winner).row) || '–'}`;
    const notes = str(loser.row.notes).trim();
    p['notes'] = notes ? `${notes}\n${note}` : note;
  }
  for (const [okey, isFavorite] of favoriteChanges) patchOf(okey)['isFavorite'] = isFavorite;
  count('rows to write', patches.size);

  // 6. write, a parent's rows always in one batch; a failed batch is retried parent by parent
  const byParent = new Map<string, string[]>();
  for (const okey of patches.keys()) {
    const parentKey = str(byOkey.get(okey)?.row.parentKey);
    byParent.set(parentKey, [...(byParent.get(parentKey) ?? []), okey]);
  }
  if (opts.write) {
    const commit = async (parentKeys: string[]): Promise<void> => {
      const batch = db.batch();
      for (const parentKey of parentKeys) {
        for (const okey of byParent.get(parentKey) ?? []) {
          const docRef = db.collection(AddressCollection).doc(okey);
          const pre = preconditions.get(okey);
          if (pre) batch.update(docRef, patches.get(okey) as Record<string, unknown>, { lastUpdateTime: pre });
          else batch.update(docRef, patches.get(okey) as Record<string, unknown>);
        }
      }
      await batch.commit();
    };
    let pending: string[] = [];
    let ops = 0;
    const flush = async (): Promise<void> => {
      if (pending.length === 0) return;
      try {
        await commit(pending);
        count('rows written', pending.reduce((n, pk) => n + (byParent.get(pk)?.length ?? 0), 0));
      } catch {
        for (const parentKey of pending) {
          try {
            await commit([parentKey]);
            count('rows written', byParent.get(parentKey)?.length ?? 0);
          } catch (err) {
            report.failed.push({ parentKey, error: err instanceof Error ? err.message : String(err) });
            count('parents failed');
          }
        }
      }
      pending = [];
      ops = 0;
    };
    for (const [parentKey, okeys] of byParent) {
      if (ops + okeys.length > BATCH_LIMIT) await flush();
      pending.push(parentKey);
      ops += okeys.length;
    }
    await flush();
  }

  // 7. one summary task per losing tenant per memberAdmin (losers of a failed parent were not archived)
  const failedParents = new Set(report.failed.map((f) => f.parentKey));
  const archived = losers.filter((p) => !failedParents.has(str(p.loser.row.parentKey)));
  const summaries = summaryTasks(
    archived.map((p) => ({ loser: asLinked(p.loser), winner: asLinked(p.winner) })),
    // only tenants the parent still belongs to: a foreign tenant never learns the name or the new address
    (r) => (r.row.tenants ?? []).filter((t) => t !== ADDRESS_REGISTER_TENANT && parentOf(r).tenants.includes(t)),
    (r) => parentOf(r).name,
  );
  for (const [tenantId, lines] of summaries) {
    const admins = await getMemberAdminPersons(db, tenantId);
    report.tasks.push({ tenantId, lines, assignees: admins.map((a) => a.key) });
    if (admins.length === 0) { count('tenants without memberAdmin'); continue; }
    for (const admin of admins) {
      if (!opts.write) { count('summary tasks to create'); continue; }
      try {
        await db.collection(TaskCollection).doc(migrationTaskId(tenantId, admin.key)).create(summaryTaskDoc(tenantId, admin, lines));
        count('summary tasks created');
      } catch (err) {
        if ((err as { code?: number }).code !== 6) throw err;   // 6 = ALREADY_EXISTS: a re-run
        count('summary tasks already there');
      }
    }
  }

  writeFileSync(opts.reportPath, JSON.stringify(report, null, 2));
  return report;
}

function summaryTaskDoc(tenantId: string, assignee: AvatarInfo, lines: string[]): Record<string, unknown> {
  const task = new TaskModel(tenantId);
  task.name = MIGRATION_TASK_NAME;
  task.notes = lines.join('\n');
  task.tags = MIGRATION_TASK_TAG;
  task.author = SYSTEM_AUTHOR;
  task.assignee = assignee;
  task.index = getTaskIndex(task);
  const { okey, ...doc } = { ...task };   // okey is the document id, never a field
  void okey;
  return Object.fromEntries(Object.entries(doc).filter(([, v]) => v !== undefined));
}
