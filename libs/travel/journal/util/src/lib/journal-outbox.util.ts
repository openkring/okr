import { JournalChange, TrackPhoto, TripModel } from '@okr/shared-models';
import { LocalTrack, photosOnTrack, serverPhotos, TrackPoint } from '@okr/mobility-tracker-util';

import { ChangeStamp, createChange, NewChange } from './journal-change.util';
import { formatHlc, Hlc, isValidHlc, parseHlc } from './journal-hlc.util';
import { acceptPeerRecords } from './journal-peer.util';
import { localWallClock } from './journal-track-pick.util';
import { TrackCopy, trackRecordFields } from './journal-track.util';

/**
 * The iPhone's outbox (spec 1.154 phase 5, decision 9; 1.121 §8 «iPhone as a contributing P2P peer»): the iPhone that
 * recorded a track sends it to a journal — the `track` record, the image records of its photos and the photo files —
 * online through Firestore like an iPad, offline over the iPads' local P2P sync. It holds NO journal database: only
 * what it still has to deliver, its own stamp, and the journals prepared for the road (peer secrets).
 *
 * One device id PER DELIVERY (`<baseDeviceId>-<n>`), each with seq 1..k:
 * - the iPads' change log has a unique index on (deviceId, seq) across all journals, so one sequence must never be
 *   reused in two journals;
 * - an iPad acknowledges by its version vector, which holds the CONTIGUOUS prefix of seqs per device: with one
 *   sequence per delivery a delivery is covered exactly when the iPad holds all its records — a delivery written online
 *   before can never leave a gap that blocks the acknowledgement of a later one.
 * The clock (HLC) is one per phone and never runs back across deliveries.
 *
 * Records are immutable with unique ids: resending is always safe (the iPad stores with INSERT OR IGNORE, Firestore
 * refuses a second create and the writer treats an existing document as uploaded).
 */
export type OutboxDraft = Omit<NewChange, 'id' | 'deviceId' | 'authorKey'>;

export interface OutboxDelivery {
  deviceId: string; // `<baseDeviceId>-<n>`; its records carry seq 1..records.length
  journalKey: string;
  tripKey: string;
  createdAt: number; // ms
  records: JournalChange[];
  files: string[]; // photo file names in Documents/journals/<journalKey>/
  /**
   * The records have arrived: written to Firestore, or held by an iPad (its version vector covers them). Ruling R9: the
   * delivery then stays as «files only» — its photo files are kept (and still handed to any iPad that asks) until an
   * online round has uploaded them; only then is it dropped.
   */
  recordsDone: boolean;
}

export interface OutboxStamp {
  baseDeviceId: string;
  clock: Hlc | undefined;
  deliveries: number; // deliveries stamped so far: the next one is deliveries + 1
}

/** A prepared journal: the author may send to it offline once `secret` (its P2P peer secret) is cached. */
export interface OutboxJournal {
  journalKey: string;
  title: string;
  tenantId: string;
  secret: string; // '' = not prepared
  preparedAt: number;
}

const FILE_NAME = /^[A-Za-z0-9_-]{1,100}\.jpg$/;
const DEVICE_ID = /^[A-Za-z0-9_-]{8,64}$/;

export function deliveryDeviceId(baseDeviceId: string, n: number): string {
  return `${baseDeviceId}-${n}`;
}

/** The two renditions of an imported photo (`<name>-2048.jpg`, `<name>-400.jpg`), as the plugin names them. */
export function trackPhotoFiles(names: string[]): string[] {
  return names.flatMap((name) => [`${name}-2048.jpg`, `${name}-400.jpg`]);
}

/**
 * The image record of a recorded photo imported through `exportOriginal` — the same fields as the iPad's picker import:
 * the capture time as this device's wall clock, the position from the track, the size of the 2048 rendition. Values
 * that are not finite are left out (Firestore rejects undefined).
 */
export function trackPhotoImageFields(journalKey: string, photo: TrackPhoto, name: string, size: { width: number; height: number }): Record<string, unknown> {
  const fields: Record<string, unknown> = {
    journalKey,
    takenAt: localWallClock(photo.takenAt) || undefined,
    latitude: Number.isFinite(photo.lat) ? photo.lat : undefined,
    longitude: Number.isFinite(photo.lng) ? photo.lng : undefined,
    width: size.width,
    height: size.height,
    path2048: `journals/${journalKey}/${name}-2048.jpg`,
    path400: `journals/${journalKey}/${name}-400.jpg`,
    localIdentifier: photo.assetId,
  };
  return Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
}

/** A delivery's drafts: the images first, then the track (the iPad never holds a track whose photo records are unknown). */
export function trackDeliveryDrafts(journalKey: string, trackKey: string, copy: TrackCopy, imageDrafts: OutboxDraft[]): OutboxDraft[] {
  return [...imageDrafts, { journalKey, entity: 'track', entityKey: trackKey, op: 'create', fields: trackRecordFields(journalKey, copy) }];
}

/**
 * Stamps one delivery: a fresh device id, seq 1..k, the phone's clock carried on. `ids` are the record ids (one per
 * draft, from crypto.randomUUID in the service). Pure: the caller stores the delivery and the new stamp together.
 */
export function stampDelivery(
  stamp: OutboxStamp,
  input: { journalKey: string; tripKey: string; authorKey: string; drafts: OutboxDraft[]; files: string[] },
  ids: string[],
  now: number,
): { delivery: OutboxDelivery; stamp: OutboxStamp } {
  const n = stamp.deliveries + 1;
  const deviceId = deliveryDeviceId(stamp.baseDeviceId, n);
  let change: ChangeStamp = { clock: stamp.clock ? { ...stamp.clock, deviceId } : undefined, seq: 0 };
  const records: JournalChange[] = [];
  input.drafts.forEach((draft, i) => {
    const next = createChange({ ...draft, id: ids[i], deviceId, authorKey: input.authorKey }, change, now);
    records.push(next.change);
    change = next.stamp;
  });
  return {
    delivery: { deviceId, journalKey: input.journalKey, tripKey: input.tripKey, createdAt: now, records, files: [...input.files], recordsDone: false },
    stamp: { baseDeviceId: stamp.baseDeviceId, clock: change.clock ?? stamp.clock, deliveries: n },
  };
}

/** The delivery's records the peer does not hold yet (its version vector names the contiguous prefix per device). */
export function unsentRecords(delivery: OutboxDelivery, peerVv: Record<string, number>): JournalChange[] {
  const held = peerVv[delivery.deviceId] ?? 0;
  return delivery.records.filter((r) => r.seq > held);
}

/** The peer holds every record of the delivery — its acknowledgement. */
export function isDeliveryCovered(delivery: OutboxDelivery, peerVv: Record<string, number>): boolean {
  return (peerVv[delivery.deviceId] ?? 0) >= delivery.records.length;
}

/**
 * For one peer's version vector: the records to send now (in seq order per delivery) and the deliveries whose records it
 * now covers. Deliveries whose records are done already (files only) are neither sent nor reported again.
 */
export function peerPlan(deliveries: OutboxDelivery[], journalKey: string, peerVv: Record<string, number>): { send: JournalChange[]; covered: string[] } {
  const send: JournalChange[] = [];
  const covered: string[] = [];
  for (const delivery of deliveries) {
    if (delivery.journalKey !== journalKey || delivery.recordsDone) continue;
    if (isDeliveryCovered(delivery, peerVv)) covered.push(delivery.deviceId);
    else send.push(...unsentRecords(delivery, peerVv));
  }
  return { send, covered };
}

/** The files of a peer's photo request that the outbox holds for that journal (an iPad asks for all files it lacks). */
export function requestedOutboxFiles(deliveries: OutboxDelivery[], journalKey: string, requested: string[]): string[] {
  const held = new Set(deliveries.filter((d) => d.journalKey === journalKey).flatMap((d) => d.files));
  return requested.filter((f) => held.has(f));
}

/** The deliveries whose records still have to reach an iPad or Firestore (a P2P session runs while there are any). */
export function recordsPending(deliveries: OutboxDelivery[], journalKey: string): OutboxDelivery[] {
  return deliveries.filter((d) => d.journalKey === journalKey && !d.recordsDone);
}

/** The author who stamped a delivery ('' when it has no records). */
export function deliveryAuthor(delivery: OutboxDelivery): string {
  return delivery.records[0]?.authorKey ?? '';
}

/**
 * The deliveries the signed-in person may send. A delivery stamped for another person (somebody else used this phone
 * before) stays INERT: never sent online or over P2P under the new person — it would be refused (the rules need the
 * record's author to be an author of the journal) — and it can only be discarded.
 */
export function sendableDeliveries(deliveries: OutboxDelivery[], authorKey: string): OutboxDelivery[] {
  return deliveries.filter((d) => d.records.length === 0 || deliveryAuthor(d) === authorKey);
}

/** The person's deliveries for journals the server no longer lists for them (removed as author, journal archived). */
export function orphanedDeliveries(deliveries: OutboxDelivery[], authorKey: string, journalKeys: string[]): OutboxDelivery[] {
  const live = new Set(journalKeys);
  return sendableDeliveries(deliveries, authorKey).filter((d) => !live.has(d.journalKey));
}

export type DeliveryOutcome = 'delivered' | 'kept';

/**
 * One online round, delivery by delivery: a refused delivery (any error but offline) is counted and skipped, so it never
 * blocks the deliveries behind it; offline stops the round (rethrown).
 */
export async function deliverEach<T>(
  items: T[], deliverOne: (item: T) => Promise<DeliveryOutcome>, isOffline: (error: unknown) => boolean, onRefused: (item: T, error: unknown) => void,
): Promise<{ delivered: number; kept: number; refused: number }> {
  const result = { delivered: 0, kept: 0, refused: 0 };
  for (const item of items) {
    try {
      result[await deliverOne(item)]++;
    } catch (error) {
      if (isOffline(error)) throw error;
      onRefused(item, error);
      result.refused++;
    }
  }
  return result;
}

/** «Antarktis 2027 · Paradise Harbour» for the discard list; the track name comes from the delivery's own track record. */
export function deliveryLabel(delivery: OutboxDelivery, journals: OutboxJournal[], untitled: string): string {
  const track = delivery.records.find((r) => r.entity === 'track');
  const name = typeof track?.fields['name'] === 'string' ? track.fields['name'] : '';
  const journal = journals.find((j) => j.journalKey === delivery.journalKey)?.title ?? '';
  return [journal || untitled, name || delivery.tripKey].join(' · ');
}

// ------------------------------------------------------------------ storage

export function serializeOutboxStamp(stamp: OutboxStamp): string {
  return JSON.stringify({ baseDeviceId: stamp.baseDeviceId, clock: stamp.clock ? formatHlc(stamp.clock) : '', deliveries: stamp.deliveries });
}

export function parseOutboxStamp(raw: string | undefined): OutboxStamp | undefined {
  if (!raw) return undefined;
  try {
    const v = JSON.parse(raw) as { baseDeviceId?: unknown; clock?: unknown; deliveries?: unknown };
    if (typeof v.baseDeviceId !== 'string' || !DEVICE_ID.test(v.baseDeviceId)) return undefined;
    const deliveries = typeof v.deliveries === 'number' && Number.isInteger(v.deliveries) && v.deliveries >= 0 ? v.deliveries : undefined;
    if (deliveries === undefined) return undefined;
    // the clock string carries the last delivery's id; only its wall and counter matter
    const clockText = typeof v.clock === 'string' ? v.clock : '';
    const clock = /^\d{15}:\d{6}:[A-Za-z0-9_-]+$/.test(clockText) ? parseHlc(clockText) : undefined;
    return { baseDeviceId: v.baseDeviceId, clock, deliveries };
  } catch {
    return undefined;
  }
}

/** A stored delivery, or undefined when it is damaged (wrong shape, a record the iPads would refuse, an odd file name). */
export function parseOutboxDelivery(raw: unknown): OutboxDelivery | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;
  const d = raw as Record<string, unknown>;
  const deviceId = d['deviceId'];
  const journalKey = d['journalKey'];
  if (typeof deviceId !== 'string' || !DEVICE_ID.test(deviceId) || typeof journalKey !== 'string' || journalKey === '') return undefined;
  if (typeof d['tripKey'] !== 'string' || typeof d['createdAt'] !== 'number' || !Array.isArray(d['records']) || !Array.isArray(d['files'])) return undefined;
  const files = d['files'] as unknown[];
  if (!files.every((f): f is string => typeof f === 'string' && FILE_NAME.test(f))) return undefined;
  const raws = d['records'] as unknown[];
  // the same check as the iPads (shape, journal, clock format); the clock-ahead limit is the receiver's business
  const records = acceptPeerRecords(raws, journalKey, Number.MAX_SAFE_INTEGER)
    .filter((r) => r.deviceId === deviceId && isValidHlc(r.hlc, deviceId));
  if (records.length !== raws.length) return undefined;
  return { deviceId, journalKey, tripKey: d['tripKey'], createdAt: d['createdAt'], records, files, recordsDone: d['recordsDone'] === true };
}

/**
 * The prepared journals are stored WITH the person they were fetched for: peer secrets are the person's access to the
 * journals, and a phone may change hands (another person signs in). Read for another person, the list is empty.
 */
export function serializeOutboxJournals(personKey: string, journals: OutboxJournal[]): string {
  return JSON.stringify({
    personKey,
    journals: journals.map(({ journalKey, title, tenantId, secret, preparedAt }) => ({ journalKey, title, tenantId, secret, preparedAt })),
  });
}

export function parseOutboxJournals(raw: string | undefined, personKey: string): OutboxJournal[] {
  if (!raw || !personKey) return [];
  try {
    const stored = JSON.parse(raw) as { personKey?: unknown; journals?: unknown };
    if (typeof stored !== 'object' || stored === null || stored.personKey !== personKey || !Array.isArray(stored.journals)) return [];
    return (stored.journals as unknown[]).filter((j): j is OutboxJournal => typeof j === 'object' && j !== null
      && typeof (j as OutboxJournal).journalKey === 'string' && (j as OutboxJournal).journalKey !== '' && typeof (j as OutboxJournal).title === 'string'
      && typeof (j as OutboxJournal).tenantId === 'string' && typeof (j as OutboxJournal).secret === 'string' && typeof (j as OutboxJournal).preparedAt === 'number')
      .map((j) => ({ journalKey: j.journalKey, title: j.title, tenantId: j.tenantId, secret: j.secret, preparedAt: j.preparedAt }));
  } catch {
    return [];
  }
}

/**
 * The prepared journals after an online refresh: the server's list of the author's journals is authoritative (a journal
 * the person no longer writes in is dropped together with its secret); a fetched secret replaces the cached one, a failed
 * fetch keeps it.
 */
export function mergeOutboxJournals(
  cached: OutboxJournal[], fetched: { journalKey: string; title: string; tenantId: string }[], secrets: Record<string, string>, now: number,
): OutboxJournal[] {
  const byKey = new Map(cached.map((j) => [j.journalKey, j]));
  return fetched.map((j) => {
    const fresh = secrets[j.journalKey];
    const old = byKey.get(j.journalKey);
    return fresh
      ? { ...j, secret: fresh, preparedAt: now }
      : { ...j, secret: old?.secret ?? '', preparedAt: old?.preparedAt ?? 0 };
  });
}

const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * The message of the «Für unterwegs» alert: one line per journal «Titel: bereit / nicht bereit», then the hint and the
 * number still waiting. Ionic renders alert messages as HTML here (innerHTMLTemplatesEnabled), and titles are author
 * text, so everything is escaped.
 */
export function preparedJournalsMessage(
  journals: OutboxJournal[], labels: { untitled: string; ready: string; notReady: string; hint: string; waiting: string },
): string {
  const lines = journals.map((j) => `${escapeHtml(j.title || labels.untitled)}: ${escapeHtml(j.secret ? labels.ready : labels.notReady)}`);
  const tail = [labels.hint, labels.waiting].filter((s) => s !== '').map(escapeHtml);
  return [lines.join('<br>'), ...tail].join('<br><br>');
}

// ------------------------------------------------------------------ the trip of a track on this phone

/**
 * What `trackCopyOf` reads from a trip, built from the phone's local track: key, name, start/end/duration and the visible
 * photos with their positions checked against the shown points (as the tracker's upload does). Steps, strokes and every
 * other activity figure are not carried — the copy's allow-list would drop them anyway.
 */
export function tripOfLocalTrack(local: LocalTrack, sections: TrackPoint[][], tenantId: string): TripModel {
  const lastPointT = sections.flat().reduce((max, p) => Math.max(max, p.t), local.startedAt);
  const endedMs = local.endedAt ?? lastPointT;
  const trip = new TripModel(tenantId);
  trip.okey = local.key;
  trip.name = local.name;
  trip.type = 'tracker';
  trip.track = {
    personKey: '',
    ownerUid: '',
    startedAt: new Date(local.startedAt).toISOString(),
    endedAt: new Date(endedMs).toISOString(),
    durationS: Math.max(0, Math.round((endedMs - local.startedAt) / 1000)),
    sections: [],
    photos: serverPhotos(photosOnTrack(local.photos ?? [], sections)),
  };
  return trip;
}
