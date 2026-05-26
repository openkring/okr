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

    const allWrites: Array<{ ref: FirebaseFirestore.DocumentReference; data: { totalKm: number; tripCount: number } }> = [
      ...[...boatTotals.entries()].map(([key, data]) => ({ ref: db.doc(`stats_boats/${key}/years/${yearStr}`), data })),
      ...[...memberTotals.entries()].map(([key, data]) => ({ ref: db.doc(`stats_members/${key}/years/${yearStr}`), data })),
    ];

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
