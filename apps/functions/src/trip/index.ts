// apps/functions/src/trip/index.ts
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const REGION = 'europe-west6';

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

  function accumulate(path: string): void {
    const existing = out.get(path) ?? { path, km: 0, count: 0 };
    out.set(path, {
      path,
      km:    existing.km    + sign * doc.distance,
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
        }, { merge: true });
      }
    });

    logger.info(`onTripWrite: applied ${deltas.length} stat delta(s)`);
  }
);
