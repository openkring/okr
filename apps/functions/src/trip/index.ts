// apps/functions/src/trip/index.ts
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v2';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const REGION = 'europe-west6';

// Only trips in these states count toward stats.
// 'open' and 'open.rev' are in-progress and excluded intentionally.
// Soft-deleted trips without '.corr' don't count.
const COUNTING_STATES = new Set([
  'closed',
  'closed.rev',
  'deleted.corr',
  'deleted.corr.rev',
]);

// Inlined — no monorepo cross-bundle imports
interface TripDoc {
  state: string;
  distance: number;
  startDate: string;  // 'yyyyMMdd'
  resource?: { key?: string };
  participants?: Array<{ key?: string }>;
}

export interface StatDelta {
  path: string;
  km: number;
  count: number;
}

function effectiveTrip(doc: TripDoc | undefined): TripDoc | undefined {
  return doc && COUNTING_STATES.has(doc.state) ? doc : undefined;
}

function collectDeltas(doc: TripDoc, sign: 1 | -1, out: Map<string, StatDelta>): void {
  const year = (doc.startDate ?? '').substring(0, 4);
  if (!year || year === '0000') return;

  const dist = Number(doc.distance);
  if (!Number.isFinite(dist)) return;

  function accumulate(path: string): void {
    const existing = out.get(path) ?? { path, km: 0, count: 0 };
    out.set(path, {
      path,
      km:    existing.km    + sign * dist,
      count: existing.count + sign,
    });
  }

  const boatKey = doc.resource?.key;
  if (boatKey) accumulate(`stats_boats/${boatKey}/years/${year}`);

  for (const p of doc.participants ?? []) {
    if (p.key) accumulate(`stats_members/${p.key}/years/${year}`);
  }
}

export function computeDeltas(
  rawBefore: TripDoc | undefined,
  rawAfter:  TripDoc | undefined,
): StatDelta[] {
  const map = new Map<string, StatDelta>();
  const before = effectiveTrip(rawBefore);
  const after  = effectiveTrip(rawAfter);
  if (before) collectDeltas(before, -1, map);
  if (after)  collectDeltas(after,   1, map);
  return [...map.values()];
}

/**
 * A stat delta path is `stats_<type>/<key>/years/<year>`. The same delta also lands in one
 * rollup doc per (type, year) — `stats_rollup/<type>_<year>` with an `entries` map keyed by
 * entity — so the client reads the whole ranking in a single document instead of one
 * listener per boat/person.
 */
export function rollupTarget(path: string): { doc: string; key: string } | undefined {
  const m = /^stats_(boats|members)\/(.+)\/years\/(\d{4})$/.exec(path);
  return m ? { doc: `stats_rollup/${m[1]}_${m[3]}`, key: m[2] } : undefined;
}

export const onTripWrite = onDocumentWritten(
  { document: 'trips/{tripId}', region: REGION },
  async (event) => {
    const rawBefore = event.data?.before?.data() as TripDoc | undefined;
    const rawAfter  = event.data?.after?.data()  as TripDoc | undefined;

    const deltas = computeDeltas(rawBefore, rawAfter);
    if (!deltas.length) return;

    const db = getFirestore();
    await db.runTransaction(async (tx) => {
      const refs  = deltas.map(d => db.doc(d.path));
      const snaps = await Promise.all(refs.map(r => tx.get(r)));
      for (let i = 0; i < deltas.length; i++) {
        const cur = snaps[i].data() ?? { totalKm: 0, tripCount: 0 };
        tx.set(refs[i], {
          totalKm:   (cur['totalKm']   as number ?? 0) + deltas[i].km,
          tripCount: (cur['tripCount'] as number ?? 0) + deltas[i].count,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      // Same deltas, aggregated into one doc per (type, year) — increments need no read.
      const rollups = new Map<string, Record<string, unknown>>();
      for (const d of deltas) {
        const target = rollupTarget(d.path);
        if (!target) continue;
        const entries = rollups.get(target.doc) ?? {};
        entries[target.key] = { km: FieldValue.increment(d.km), count: FieldValue.increment(d.count) };
        rollups.set(target.doc, entries);
      }
      for (const [path, entries] of rollups) {
        tx.set(db.doc(path), { entries, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      }
    });

    logger.info(`onTripWrite: applied ${deltas.length} stat delta(s)`);
  }
);

export const onTripStatsReconcile = onSchedule(
  { schedule: '0 2 * * *', timeZone: 'Europe/Zurich', region: REGION },
  async () => {
    const db = getFirestore();
    const year     = new Date().getFullYear();
    const yearStr  = String(year);
    const fromDate = `${yearStr}0101`;
    const toDate   = `${yearStr}1231`;

    const snap = await db.collection('trips')
      .where('startDate', '>=', fromDate)
      .where('startDate', '<=', toDate)
      .get();

    const boatTotals   = new Map<string, { totalKm: number; tripCount: number }>();
    const memberTotals = new Map<string, { totalKm: number; tripCount: number }>();

    for (const doc of snap.docs) {
      const t = doc.data() as TripDoc;
      if (!COUNTING_STATES.has(t.state)) continue;

      const dist = Number(t.distance);
      if (!Number.isFinite(dist)) continue;

      const boatKey = t.resource?.key;
      if (boatKey) {
        const cur = boatTotals.get(boatKey) ?? { totalKm: 0, tripCount: 0 };
        boatTotals.set(boatKey, { totalKm: cur.totalKm + dist, tripCount: cur.tripCount + 1 });
      }

      for (const p of t.participants ?? []) {
        if (!p.key) continue;
        const cur = memberTotals.get(p.key) ?? { totalKm: 0, tripCount: 0 };
        memberTotals.set(p.key, { totalKm: cur.totalKm + dist, tripCount: cur.tripCount + 1 });
      }
    }

    const allWrites: Array<{ ref: FirebaseFirestore.DocumentReference; data: Record<string, unknown> }> = [
      ...[...boatTotals.entries()].map(([key, data]) => ({ ref: db.doc(`stats_boats/${key}/years/${yearStr}`), data })),
      ...[...memberTotals.entries()].map(([key, data]) => ({ ref: db.doc(`stats_members/${key}/years/${yearStr}`), data })),
    ];

    // Rollups are rewritten wholesale (no merge): the nightly job is the authority, so any drift
    // the incremental deltas accumulated during the day is corrected here.
    const toEntries = (m: Map<string, { totalKm: number; tripCount: number }>) =>
      Object.fromEntries([...m].map(([key, v]) => [key, { km: v.totalKm, count: v.tripCount }]));
    allWrites.push(
      { ref: db.doc(`stats_rollup/boats_${yearStr}`),   data: { entries: toEntries(boatTotals) } },
      { ref: db.doc(`stats_rollup/members_${yearStr}`), data: { entries: toEntries(memberTotals) } },
    );

    const CHUNK = 400;
    for (let i = 0; i < allWrites.length; i += CHUNK) {
      const batch = db.batch();
      for (const { ref, data } of allWrites.slice(i, i + CHUNK)) {
        batch.set(ref, { ...data, updatedAt: FieldValue.serverTimestamp() });
      }
      await batch.commit();
    }

    logger.info(`onTripStatsReconcile: processed ${snap.size} trips, wrote ${boatTotals.size} boat + ${memberTotals.size} member docs for ${yearStr}`);
  }
);

/*----------------------------- end-of-day auto-close ---------------------------------*/

/** Chunk size for batched Firestore writes (Firestore caps a batch at 500 operations). */
const AUTO_CLOSE_CHUNK = 400;

/**
 * 'yyyyMMdd' (StoreDate) and 'HH:mm' (the format `getCurrentTime` emits) for `now`, read in the
 * club's own timezone — never the Cloud Functions host's, which is UTC.
 */
export function zurichDateTimeParts(now: Date): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(now);
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '';
  return { date: `${get('year')}${get('month')}${get('day')}`, time: `${get('hour')}:${get('minute')}` };
}

function formatSwissDate(storeDate: string): string {
  return `${storeDate.substring(6, 8)}.${storeDate.substring(4, 6)}.${storeDate.substring(0, 4)}`;
}

/**
 * End-of-day sweep: a trip still 'open' this late is either a boat that never came back or — far
 * more often — a crew that forgot to close the entry. Rather than raise a task and wait for a
 * human (the old `onOpenTripCheck` watchdog, 4 h after start), the Logbuch closes it itself: end
 * date/time is stamped to now, the state becomes 'closed.rev' (the same '.rev' suffix an admin's
 * manual correction leaves — see the `trips` skill), and a note is appended so the crew and any
 * reviewer can see it was not a real close. `trip-list`'s state filter (privileged users only)
 * surfaces these as 'revised'.
 *
 * Runs once daily, shortly before midnight — by then every trip that started today should have
 * ended today, so nothing here needs a per-tenant timezone or an age check.
 */
export const onTripEndOfDayClose = onSchedule(
  { schedule: '55 23 * * *', timeZone: 'Europe/Zurich', region: REGION },
  async () => {
    const db = getFirestore();
    const snap = await db.collection('trips').where('state', 'in', ['open', 'open.rev']).get();
    if (snap.empty) return;

    const { date, time } = zurichDateTimeParts(new Date());
    const comment = `Automatisch abgeschlossen am ${formatSwissDate(date)} um ${time} Uhr — die Fahrt war am Tagesende noch offen und wurde vom System geschlossen. Bitte prüfen.`;

    const docs = snap.docs;
    for (let i = 0; i < docs.length; i += AUTO_CLOSE_CHUNK) {
      const batch = db.batch();
      for (const doc of docs.slice(i, i + AUTO_CLOSE_CHUNK)) {
        const notes = (doc.data() as TripDoc & { notes?: string }).notes;
        batch.update(doc.ref, {
          endDate: date,
          endTime: time,
          state: 'closed.rev',
          notes: notes ? `${notes}\n${comment}` : comment,
        });
      }
      await batch.commit();
    }

    logger.info(`onTripEndOfDayClose: closed ${docs.length} still-open trip(s) as 'closed.rev'`);
  }
);

// Logbuch damage / bug reports (Schaden-/Fehlermeldung) — emitted as workflow events
export { reportIncident } from './report';
