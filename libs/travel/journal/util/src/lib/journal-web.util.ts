import { JournalChange } from '@okr/shared-models';
import { ChangeStamp } from './journal-change.util';
import { Hlc, receiveHlc, parseHlc } from './journal-hlc.util';

/**
 * Browser editing (spec 1.126 phase 3): the pure parts of the browser writer — the device stamp that is
 * kept in localStorage and the merge of a Firestore snapshot with records not yet confirmed by the server.
 */
const DEVICE_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
const HLC_FORMAT = /^\d{15}:\d{6}:[A-Za-z0-9_-]+$/;

/** A usable browser device id (HLC charset, 8–64 chars). */
export function isWebDeviceId(id: unknown): id is string {
  return typeof id === 'string' && DEVICE_ID_PATTERN.test(id);
}

function laterClock(a: Hlc | undefined, b: Hlc | undefined): Hlc | undefined {
  if (!a) return b;
  if (!b) return a;
  if (a.wall !== b.wall) return a.wall > b.wall ? a : b;
  return a.counter >= b.counter ? a : b;
}

/** The later clock (by wall, then counter) and the higher seq of two stamps of the same device. */
export function mergeStamps(a: ChangeStamp, b: ChangeStamp): ChangeStamp {
  return { clock: laterClock(a.clock, b.clock), seq: Math.max(a.seq, b.seq) };
}

/** Highest seq of this device among records (0 when none). */
export function maxSeqOf(changes: readonly JournalChange[], deviceId: string): number {
  let max = 0;
  for (const c of changes) if (c.deviceId === deviceId && c.seq > max) max = c.seq;
  return max;
}

/** The clock moved past every valid received hlc (receiveHlc), keeping deviceId. */
export function receiveClocksInto(stamp: ChangeStamp, hlcs: readonly string[], deviceId: string, now: number): ChangeStamp {
  let clock: Hlc = stamp.clock ?? { wall: 0, counter: 0, deviceId };
  let moved = false;
  for (const hlc of hlcs) {
    if (!HLC_FORMAT.test(hlc)) continue;
    clock = receiveHlc(clock, parseHlc(hlc), now);
    moved = true;
  }
  return moved ? { clock, seq: stamp.seq } : stamp;
}

/** Snapshot plus pending records it lacks; pending records the snapshot carries are confirmed and dropped. */
export function mergePending(snapshot: readonly JournalChange[], pending: readonly JournalChange[]): { changes: JournalChange[]; pending: JournalChange[] } {
  const known = new Set(snapshot.map((c) => c.id));
  const open = pending.filter((c) => !known.has(c.id));
  return { changes: [...snapshot, ...open], pending: open };
}

/**
 * True for a refusal the new-journal retry should wait out: permission-denied on a batch whose journal
 * is not materialised yet (applyJournalChange writes the journal doc about a second after its create record).
 */
export function isNewJournalRefusal(code: string | undefined, journalExists: boolean): boolean {
  return code === 'permission-denied' && !journalExists;
}
