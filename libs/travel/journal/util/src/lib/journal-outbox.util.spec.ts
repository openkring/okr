import { describe, expect, it } from 'vitest';
import { JournalChange, TrackPhoto } from '@okr/shared-models';
import { LocalTrack, TrackPoint } from '@okr/mobility-tracker-util';
import { parseHlc } from './journal-hlc.util';
import { materialize } from './journal-merge.util';
import { acceptPeerRecords, versionVector } from './journal-peer.util';
import { pagesOf } from './journal-sync.util';
import { trackCopyOf, trackKeyOf, trackOf, tracksOf } from './journal-track.util';
import { imagesOf } from './journal-view.util';
import {
  deliverEach, deliveryDeviceId, deliveryLabel, isDeliveryCovered, orphanedDeliveries, recordsPending, sendableDeliveries, mergeOutboxJournals, OutboxDelivery, OutboxDraft, OutboxStamp, parseOutboxDelivery,
  parseOutboxJournals, parseOutboxStamp, peerPlan, preparedJournalsMessage, requestedOutboxFiles, serializeOutboxJournals, serializeOutboxStamp, stampDelivery, trackDeliveryDrafts,
  trackPhotoFiles, trackPhotoImageFields, tripOfLocalTrack, unsentRecords,
} from './journal-outbox.util';

const JK = 'j1';
const BASE = '0f4c2a1e-1111-4222-8333-944455556666';
const T0 = Date.UTC(2027, 0, 14, 9, 0, 0);

function line(count: number): TrackPoint[] {
  return Array.from({ length: count }, (_, i) => ({ lat: -64.8 + i * 0.0001, lng: -62.8, t: T0 + i * 1000, alt: 10 + i }));
}

function photo(n: number, over: Partial<TrackPhoto> = {}): TrackPhoto & { path400?: string } {
  return {
    assetId: `asset-${n}`, takenAt: new Date(T0 + n * 60_000).toISOString(), lat: -64.8, lng: -62.8, ownGps: true, hidden: false,
    path400: `/cache/p${n}.jpg`, ...over,
  };
}

function localTrack(over: Partial<LocalTrack> = {}): LocalTrack {
  return {
    key: 'trip-a', state: 'done', uploaded: false, name: 'Paradise Harbour', startedAt: T0, endedAt: T0 + 3_600_000,
    sections: [{ mode: 'foot', detected: true, steps: 4000 }], photos: [photo(1), photo(2, { hidden: true }), photo(3)], ...over,
  };
}

/** The drafts the iPhone sends for one trip: one image per visible photo, then the track. */
function draftsFor(tripKey = 'trip-a', photos = 2): OutboxDraft[] {
  const local = localTrack({ key: tripKey });
  const trip = tripOfLocalTrack(local, [line(50)], 'bkg');
  const keys: Record<string, string> = {};
  const images: OutboxDraft[] = [];
  for (let i = 1; i <= photos; i++) {
    const p = photo(i * 2 - 1);
    keys[p.assetId] = `img-${tripKey}-${i}`;
    images.push({
      journalKey: JK, entity: 'image', entityKey: keys[p.assetId], op: 'create',
      fields: trackPhotoImageFields(JK, p, `name-${tripKey}-${i}`, { width: 2048, height: 1536 }),
    });
  }
  const copy = trackCopyOf(trip, [{ mode: 'foot', points: line(50) }], keys);
  return trackDeliveryDrafts(JK, trackKeyOf(JK, tripKey) ?? '', copy, images);
}

let idCounter = 0;
const ids = (count: number) => Array.from({ length: count }, () => `rec-${++idCounter}`);

function stamped(stamp: OutboxStamp, tripKey = 'trip-a', now = T0 + 7_200_000): { delivery: OutboxDelivery; stamp: OutboxStamp } {
  const drafts = draftsFor(tripKey);
  return stampDelivery(stamp, { journalKey: JK, tripKey, authorKey: 'bruno', drafts, files: trackPhotoFiles(['name-1']) }, ids(drafts.length), now);
}

const FRESH: OutboxStamp = { baseDeviceId: BASE, clock: undefined, deliveries: 0 };

/**
 * An iPad receiving peer pages exactly like JournalPeerService + JournalDb.appendPeerChanges: acceptPeerRecords, then
 * INSERT OR IGNORE on the primary key `id` AND the unique index (deviceId, seq).
 */
class FakeIpad {
  public readonly stored: JournalChange[] = [];
  public receive(page: unknown[], now: number): void {
    for (const c of acceptPeerRecords(page, JK, now)) {
      if (this.stored.some((s) => s.id === c.id || (s.deviceId === c.deviceId && s.seq === c.seq))) continue; // INSERT OR IGNORE
      this.stored.push(c);
    }
  }
  public vv(): Record<string, number> {
    return versionVector(this.stored, JK);
  }
}

describe('journal outbox (spec 1.154 phase 5, decision 9)', () => {
  describe('stampDelivery', () => {
    it('gives every delivery its own device id with seq 1..n and a clock that never runs back', () => {
      const first = stamped(FRESH);
      expect(first.delivery.deviceId).toBe(deliveryDeviceId(BASE, 1));
      expect(first.delivery.records.map((r) => r.seq)).toEqual([1, 2, 3]);
      expect(first.delivery.records.every((r) => r.deviceId === first.delivery.deviceId && r.authorKey === 'bruno' && r.journalKey === JK)).toBe(true);
      // the phone's clock jumped back an hour (time zone change on board): the second delivery still sorts after the first
      const second = stamped(first.stamp, 'trip-b', T0);
      expect(second.delivery.deviceId).toBe(deliveryDeviceId(BASE, 2));
      expect(second.delivery.records.map((r) => r.seq)).toEqual([1, 2, 3]);
      const lastOfFirst = first.delivery.records[first.delivery.records.length - 1]?.hlc ?? '';
      expect(parseHlc(second.delivery.records[0].hlc).wall).toBeGreaterThanOrEqual(parseHlc(lastOfFirst).wall);
      expect(second.delivery.records.map((r) => r.hlc).every((h) => h.endsWith(second.delivery.deviceId))).toBe(true);
      expect(second.stamp.deliveries).toBe(2);
    });

    it('keeps device ids within the journal device-id charset and length', () => {
      expect(deliveryDeviceId(BASE, 12345)).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    });

    it('puts the images before the track, so the iPad never holds a track whose photos are unknown', () => {
      const { delivery } = stamped(FRESH);
      expect(delivery.records.map((r) => r.entity)).toEqual(['image', 'image', 'track']);
      expect(delivery.records[2].entityKey).toBe('trk__j1__trip-a');
    });

    it('round-trips the stamp through storage', () => {
      const { stamp } = stamped(FRESH);
      expect(parseOutboxStamp(serializeOutboxStamp(stamp))).toEqual(stamp);
      expect(parseOutboxStamp(undefined)).toBeUndefined();
      expect(parseOutboxStamp('{"baseDeviceId":"x"}')).toBeUndefined();
    });
  });

  describe('peerPlan and acknowledgement (Review Focus 5)', () => {
    it('sends everything to an iPad that holds nothing of it, nothing to one whose vv covers it', () => {
      const { delivery } = stamped(FRESH);
      expect(peerPlan([delivery], JK, {}).send).toHaveLength(3);
      expect(peerPlan([delivery], JK, { [delivery.deviceId]: 3 })).toEqual({ send: [], covered: [delivery.deviceId] });
      expect(peerPlan([delivery], 'other', {}).send).toEqual([]);
    });

    it('the iPad goes away mid-transfer: the outbox resends the rest later and the iPad stores each record once', () => {
      const a = stamped(FRESH);
      const b = stamped(a.stamp, 'trip-b');
      const ipad = new FakeIpad();
      const now = T0 + 7_300_000;

      // connection 1: the iPad's vv is empty, the phone sends both deliveries in pages of 2; only the first page arrives
      const plan1 = peerPlan([a.delivery, b.delivery], JK, ipad.vv());
      expect(plan1.send).toHaveLength(6);
      const pages = pagesOf(plan1.send, 2);
      ipad.receive(pages[0], now);
      // the connection drops: nothing is acknowledged yet, nothing is dropped from the outbox
      expect(isDeliveryCovered(a.delivery, ipad.vv())).toBe(false);

      // connection 2: the iPad's vv covers a's first two records; the phone sends only what is missing
      const plan2 = peerPlan([a.delivery, b.delivery], JK, ipad.vv());
      expect(plan2.covered).toEqual([]);
      expect(plan2.send.map((r) => `${r.deviceId === a.delivery.deviceId ? 'a' : 'b'}${r.seq}`)).toEqual(['a3', 'b1', 'b2', 'b3']);
      // the phone resends a full page anyway (it cannot know what the iPad stored): duplicates are ignored
      for (const page of pagesOf([...plan1.send], 2)) ipad.receive(page, now);
      ipad.receive(plan2.send, now);
      expect(ipad.stored).toHaveLength(6);

      // connection 3: both covered → acknowledged
      const plan3 = peerPlan([a.delivery, b.delivery], JK, ipad.vv());
      expect(plan3).toEqual({ send: [], covered: [a.delivery.deviceId, b.delivery.deviceId] });

      // the iPad's merged state holds one track per trip and each image once
      const state = materialize(ipad.stored);
      expect(tracksOf(state, JK).map((t) => t.tripKey).sort()).toEqual(['trip-a', 'trip-b']);
      expect(trackOf(state, JK, 'trk__j1__trip-a')?.photos.map((p) => p.imageKey)).toEqual(['img-trip-a-1', 'img-trip-a-2']);
      expect(imagesOf(state, JK).size).toBe(4);
    });

    it('a record the iPad got from Firebase (uploaded by the other iPad) counts as held', () => {
      const { delivery } = stamped(FRESH);
      const ipad = new FakeIpad();
      ipad.receive(delivery.records, T0 + 7_300_000); // e.g. downloaded from Firestore
      expect(unsentRecords(delivery, ipad.vv())).toEqual([]);
      expect(isDeliveryCovered(delivery, ipad.vv())).toBe(true);
    });

    it('a record the iPad refuses (clock more than a day ahead) is never covered, so it is not dropped silently', () => {
      const { delivery } = stamped(FRESH, 'trip-a', T0 + 3 * 86_400_000);
      const ipad = new FakeIpad();
      ipad.receive(delivery.records, T0);
      expect(isDeliveryCovered(delivery, ipad.vv())).toBe(false);
    });

    it('a seq gap on the iPad (record 3 came from Firebase, 2 is missing): resend from 2, covered only once 2 arrived', () => {
      const { delivery } = stamped(FRESH);
      const ipad = new FakeIpad();
      ipad.receive([delivery.records[0], delivery.records[2]], T0 + 7_300_000);
      expect(ipad.vv()[delivery.deviceId]).toBe(1); // the contiguous prefix, not the max
      const plan = peerPlan([delivery], JK, ipad.vv());
      expect(plan.covered).toEqual([]);
      expect(plan.send.map((r) => r.seq)).toEqual([2, 3]);
      ipad.receive(plan.send, T0 + 7_300_000);
      expect(ipad.stored).toHaveLength(3);
      expect(peerPlan([delivery], JK, ipad.vv())).toEqual({ send: [], covered: [delivery.deviceId] });
    });

    it('an empty delivery counts as covered', () => {
      const empty: OutboxDelivery = { deviceId: 'd-1', journalKey: JK, tripKey: 't', createdAt: 1, records: [], files: [], recordsDone: false };
      expect(isDeliveryCovered(empty, {})).toBe(true);
    });
  });

  describe('files', () => {
    it('answers a photo request only with files the outbox holds for that journal', () => {
      const { delivery } = stamped(FRESH);
      expect(delivery.files).toEqual(['name-1-2048.jpg', 'name-1-400.jpg']);
      expect(requestedOutboxFiles([delivery], JK, ['other-2048.jpg', 'name-1-400.jpg'])).toEqual(['name-1-400.jpg']);
      expect(requestedOutboxFiles([delivery], 'j2', ['name-1-400.jpg'])).toEqual([]);
    });

    it('R9: after a P2P cover the delivery is files only — no records sent again, files still answered, no P2P wait', () => {
      const { delivery } = stamped(FRESH);
      const filesOnly = { ...delivery, recordsDone: true };
      expect(peerPlan([filesOnly], JK, {})).toEqual({ send: [], covered: [] });
      expect(recordsPending([filesOnly], JK)).toEqual([]);
      expect(recordsPending([delivery], JK)).toEqual([delivery]);
      expect(requestedOutboxFiles([filesOnly], JK, ['name-1-2048.jpg'])).toEqual(['name-1-2048.jpg']);
      // the state survives storage (the files stay until an online round uploaded them)
      expect(parseOutboxDelivery(JSON.parse(JSON.stringify(filesOnly)))?.recordsDone).toBe(true);
    });
  });

  describe('parseOutboxDelivery', () => {
    it('reads a stored delivery and refuses damaged ones', () => {
      const { delivery } = stamped(FRESH);
      expect(parseOutboxDelivery(JSON.parse(JSON.stringify(delivery)))).toEqual(delivery);
      expect(parseOutboxDelivery({ ...delivery, deviceId: '' })).toBeUndefined();
      expect(parseOutboxDelivery({ ...delivery, records: [{ id: 'x' }] })).toBeUndefined();
      expect(parseOutboxDelivery({ ...delivery, files: ['../etc/passwd'] })).toBeUndefined();
      expect(parseOutboxDelivery('nonsense')).toBeUndefined();
    });
  });

  describe('journals prepared for the road', () => {
    it('keeps the server list authoritative and a cached secret when a fetch failed', () => {
      const cached = parseOutboxJournals(serializeOutboxJournals('bruno', [
        { journalKey: 'j1', title: 'Alt', tenantId: 'bkg', secret: 's1', preparedAt: 1 },
        { journalKey: 'j9', title: 'Removed', tenantId: 'bkg', secret: 's9', preparedAt: 1 },
      ]), 'bruno');
      const merged = mergeOutboxJournals(cached, [
        { journalKey: 'j1', title: 'Antarktis 2027', tenantId: 'bkg' },
        { journalKey: 'j2', title: 'Patagonien', tenantId: 'bkg' },
      ], { j2: 's2' }, 50);
      expect(merged).toEqual([
        { journalKey: 'j1', title: 'Antarktis 2027', tenantId: 'bkg', secret: 's1', preparedAt: 1 },
        { journalKey: 'j2', title: 'Patagonien', tenantId: 'bkg', secret: 's2', preparedAt: 50 },
      ]);
    });

    it('a person change never carries the previous person\'s secrets into the merge', () => {
      const stored = serializeOutboxJournals('bruno', [{ journalKey: 'j1', title: 'Antarktis', tenantId: 'bkg', secret: 's-bruno', preparedAt: 5 }]);
      const cachedForAnna = parseOutboxJournals(stored, 'anna');
      // anna writes in the same journal, but her secret fetch failed: she has no secret yet, not bruno's
      expect(mergeOutboxJournals(cachedForAnna, [{ journalKey: 'j1', title: 'Antarktis', tenantId: 'bkg' }], {}, 60)).toEqual([
        { journalKey: 'j1', title: 'Antarktis', tenantId: 'bkg', secret: '', preparedAt: 0 },
      ]);
      expect(mergeOutboxJournals(cachedForAnna, [{ journalKey: 'j1', title: 'Antarktis', tenantId: 'bkg' }], { j1: 's-anna' }, 60)[0].secret).toBe('s-anna');
    });

    it('round-trips through storage', () => {
      const list = [{ journalKey: 'j1', title: 'Antarktis', tenantId: 'bkg', secret: 's1', preparedAt: 5 }];
      expect(parseOutboxJournals(serializeOutboxJournals('bruno', list), 'bruno')).toEqual(list);
    });

    it('another person on the same phone gets none of the stored journals and secrets', () => {
      const list = [{ journalKey: 'j1', title: 'Antarktis', tenantId: 'bkg', secret: 's1', preparedAt: 5 }];
      expect(parseOutboxJournals(serializeOutboxJournals('bruno', list), 'anna')).toEqual([]);
      expect(parseOutboxJournals(serializeOutboxJournals('bruno', list), '')).toEqual([]);
      // the unbound list of the first draft of this outbox is never trusted
      expect(parseOutboxJournals(JSON.stringify(list), 'bruno')).toEqual([]);
    });

    it('lists which journals are ready, escaped (titles are author text)', () => {
      const message = preparedJournalsMessage([
        { journalKey: 'j1', title: 'Süd & <b>Nord</b>', tenantId: 'bkg', secret: 's1', preparedAt: 1 },
        { journalKey: 'j2', title: '', tenantId: 'bkg', secret: '', preparedAt: 0 },
      ], { untitled: 'Ohne Titel', ready: 'bereit', notReady: 'nicht bereit', hint: 'Hinweis', waiting: '' });
      expect(message).toBe('Süd &amp; &lt;b&gt;Nord&lt;/b&gt;: bereit<br>Ohne Titel: nicht bereit<br><br>Hinweis');
    });

    it('reads damaged storage as an empty list', () => {
      expect(parseOutboxJournals('nonsense', 'bruno')).toEqual([]);
      expect(parseOutboxJournals(JSON.stringify({ personKey: 'bruno', journals: [{ journalKey: 'j1' }] }), 'bruno')).toEqual([]);
    });
  });

  describe('whose deliveries, and refused ones', () => {
    it('a delivery of a previous person on this phone stays inert (never sendable under the new person)', () => {
      const brunos = stamped(FRESH).delivery;
      const annas = { ...brunos, deviceId: 'other-device-1', records: brunos.records.map((r) => ({ ...r, authorKey: 'anna' })) };
      expect(sendableDeliveries([brunos, annas], 'bruno')).toEqual([brunos]);
      expect(sendableDeliveries([brunos, annas], 'anna')).toEqual([annas]);
    });

    it('the person\'s deliveries for a journal no longer listed for them are orphaned', () => {
      const a = stamped(FRESH).delivery;
      const b = { ...stamped(FRESH, 'trip-b').delivery, journalKey: 'j2' };
      expect(orphanedDeliveries([a, b], 'bruno', ['j1'])).toEqual([b]);
      expect(orphanedDeliveries([a, b], 'anna', [])).toEqual([]); // another person's are not touched
    });

    it('one refused delivery never blocks the ones behind it; offline stops the round', async () => {
      const refusedOnes: string[] = [];
      const outcome = await deliverEach(['refused', 'ok', 'kept'], async (item) => {
        if (item === 'refused') throw Object.assign(new Error('denied'), { code: 'permission-denied' });
        return item === 'ok' ? 'delivered' : 'kept';
      }, (e) => (e as { code?: string }).code === 'unavailable', (item) => refusedOnes.push(item));
      expect(outcome).toEqual({ delivered: 1, kept: 1, refused: 1 });
      expect(refusedOnes).toEqual(['refused']);

      const seen: string[] = [];
      await expect(deliverEach(['a', 'b'], async (item) => {
        seen.push(item);
        throw Object.assign(new Error('offline'), { code: 'unavailable' });
      }, (e) => (e as { code?: string }).code === 'unavailable', () => undefined)).rejects.toThrow('offline');
      expect(seen).toEqual(['a']);
    });

    it('each refused delivery is refused on its own; offline after a refusal still stops the round', async () => {
      const isOffline = (e: unknown) => (e as { code?: string }).code === 'unavailable';
      const refused: string[] = [];
      const tried: string[] = [];
      const deliver = async (item: string) => {
        tried.push(item);
        if (item.startsWith('refused')) throw Object.assign(new Error(item), { code: 'permission-denied' });
        if (item === 'offline') throw Object.assign(new Error('offline'), { code: 'unavailable' });
        return 'delivered' as const;
      };
      expect(await deliverEach(['refused-1', 'ok', 'refused-2'], deliver, isOffline, (item) => refused.push(item)))
        .toEqual({ delivered: 1, kept: 0, refused: 2 });
      expect(refused).toEqual(['refused-1', 'refused-2']);

      refused.length = 0;
      tried.length = 0;
      await expect(deliverEach(['refused-1', 'offline', 'ok'], deliver, isOffline, (item) => refused.push(item))).rejects.toThrow('offline');
      expect(refused).toEqual(['refused-1']); // reported before the round stopped
      expect(tried).toEqual(['refused-1', 'offline']); // nothing tried after offline
    });

    it('labels a delivery by journal title and track name for the discard list', () => {
      const { delivery } = stamped(FRESH);
      const journals = [{ journalKey: JK, title: 'Antarktis 2027', tenantId: 'bkg', secret: '', preparedAt: 0 }];
      expect(deliveryLabel(delivery, journals, 'Ohne Titel')).toBe('Antarktis 2027 · Paradise Harbour');
      expect(deliveryLabel(delivery, [], 'Ohne Titel')).toBe('Ohne Titel · Paradise Harbour');
    });
  });

  describe('tripOfLocalTrack', () => {
    it('gives trackCopyOf what it reads, visible photos only, positions checked against the points', () => {
      const trip = tripOfLocalTrack(localTrack(), [line(50)], 'bkg');
      expect(trip.okey).toBe('trip-a');
      expect(trip.name).toBe('Paradise Harbour');
      expect(trip.track?.startedAt).toBe(new Date(T0).toISOString());
      expect(trip.track?.durationS).toBe(3600);
      expect(trip.track?.photos.map((p) => p.assetId)).toEqual(['asset-1', 'asset-3']);
      expect(trip.track?.photos.some((p) => 'path400' in p)).toBe(false);
    });

    it('a still recording track has no end: the last point ends it', () => {
      const trip = tripOfLocalTrack(localTrack({ endedAt: undefined }), [line(11)], 'bkg');
      expect(trip.track?.endedAt).toBe(new Date(T0 + 10_000).toISOString());
    });
  });

  describe('trackPhotoImageFields', () => {
    it('builds the image record like the iPad import, without undefined values', () => {
      const fields = trackPhotoImageFields(JK, photo(1, { lat: Number.NaN }), 'abc', { width: 2048, height: 1365 });
      expect(fields).toEqual({
        journalKey: JK, takenAt: expect.stringMatching(/^2027-01-14T\d\d:01:00$/), longitude: -62.8, width: 2048, height: 1365,
        path2048: 'journals/j1/abc-2048.jpg', path400: 'journals/j1/abc-400.jpg', localIdentifier: 'asset-1',
      });
    });
  });
});
