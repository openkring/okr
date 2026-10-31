import { inject, Injectable } from '@angular/core';
import { Filesystem } from '@capacitor/filesystem';
import { collection, deleteField, doc, getDoc, getDocs, query, runTransaction, updateDoc, where } from 'firebase/firestore';
import { deleteObject, getBlob, ref, uploadBytes } from 'firebase/storage';
import { Observable } from 'rxjs';

import { ENV, getBkStorage } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { AvatarInfo, TRACKER_TRIP_TYPE, TrackPhoto, TransportMode, TripCollection, TripModel, TripTrack } from '@okr/shared-models';
import { convertDateFormatToString, DateFormat, getDeletePatch, getSystemQuery } from '@okr/shared-util-core';
import { crewTrackDeadline } from '@okr/trip-util';
import {
  decodeAltitudes, decodeStrokeTimes, decodeTrack, dropGpsSpikes, encodeAltitudes, encodeStrokeTimes, encodeTrack, isLogbuchCrew, localStoreDate, LocalTrack, logbuchLinkCandidates,
  photosOnTrack, pickIndices, spikeFreeIndices, strokeTimesBase, serverPhotos, summarize, trackThumbPath, TrackPoint, tripSections, withAltitudes,
} from '@okr/mobility-tracker-util';

/** One section's points, stored as an encoded polyline in trips/{key}/track-points/{n}. */
export interface TrackPointsDoc {
  tenants: string[];
  section: number;
  mode: TransportMode;
  count: number;
  encoded: string;
  /** row: stroke times, delta-encoded ms since the section start (spec 1.122, phase 2) */
  strokeTimes?: string;
  /** GPS heights per point, delta-encoded whole metres (spec 1.128); missing on Strecken recorded before */
  altitudes?: string;
  /** terrain heights per point from getTerrainElevations, written by the owner on first view; dropped by a re-upload */
  terrainAltitudes?: string;
  /** who the terrain heights come from (attribution under the chart), e.g. 'swisstopo' */
  terrainProvider?: string;
  /** train/bus/ship: the line from the timetable (spec 1.129 §4.2), encoded like `encoded` without times; '' = none found */
  transitRoute?: string;
  /** the section the route was looked up for (`transitRouteKey`): a stale one is looked up again */
  transitRouteKey?: string;
  /** the line, e.g. «IR 35» */
  transitLine?: string;
}

/** A section's line from the timetable as stored; `points` empty = looked up, none found. */
export interface StoredTransitRoute { key: string; points: { lat: number; lng: number }[]; line: string }

/** One section as read from Firestore: terrain heights only when they were looked up once (spec 1.128). */
export interface SectionRead {
  points: TrackPoint[];
  strokeTimes: number[];
  terrain?: (number | undefined)[];
  terrainProvider?: string;
  transit?: StoredTransitRoute;
  /** GPS spikes left out of `points` (and `terrain`) on reading, spec 1.129 §3.2; 0 for a Strecke uploaded clean */
  spikes: number;
}

const TRACK_POINTS = 'track-points';
const LOGBUCH_TRIP_TYPE = 'logbuch';

/** Result of linkLogbuch: `recorderName` is the first name of the person recording already ('' = cannot be linked). */
export type LogbuchLinkResult = { ok: true } | { ok: false; recorderName: string };

/** A local wall-clock ISO timestamp (yyyy-MM-ddTHH:mm:ss) for the given epoch milliseconds. */
function toLocalIso(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** uploadThumb could not read the device-local rendition (e.g. iOS purged the app cache): re-render it and retry. */
export class ThumbSourceMissingError extends Error {
  public constructor(public readonly localPath: string, cause: unknown) {
    super(`thumbnail source missing: ${localPath}`, { cause });
    this.name = 'ThumbSourceMissingError';
  }
}

@Injectable({ providedIn: 'root' })
export class TrackService {
  private readonly firestoreService = inject(FirestoreService);
  private readonly env = inject(ENV);
  /** Thumbnails are immutable per path, so a data URL is read once (the promise is cached: concurrent reads share one fetch). */
  private readonly thumbCache = new Map<string, Promise<string>>();

  /**
   * Upload a finished local track: the trip doc and one track-points doc per section in ONE batch.
   * The trip okey is the local track key and the trip is set with merge (fields not written here, e.g. uploaded photo thumb paths, survive); points docs are overwritten, so a retried upload replaces itself.
   * A re-upload with fewer sections passes `staleUpTo` (the former section count): the track-points docs
   * sections.length … staleUpTo-1 are deleted in the SAME batch. Batches reach Firestore in the order they are
   * issued, so a stale delete can never hit the points of a later upload. (A new trip has nothing stale; the
   * delete rule reads the trip that exists before the batch.)
   * The batch is issued synchronously (no await before commit): callers rely on that for ordering.
   * Photos: `local.photos` must carry `thumbPath` once a thumbnail is uploaded. The service never reads the server doc
   * (offline), so a photo without thumbPath overwrites a stored one on the merge (arrays are replaced).
   * @returns the trip key
   */
  public async upload(
    local: LocalTrack, sections: TrackPoint[][], owner: { personKey: string; uid: string; tenants: string[] }, staleUpTo?: number, strokes?: number[][],
  ): Promise<string> {
    const tripKey = local.key;
    const endedMs = local.endedAt ?? local.startedAt;
    if (local.sections.length !== sections.length) throw new Error('track sections and points differ');
    // GPS spikes never leave the device (spec 1.129 §3.2): TrackDb keeps the raw points, the trip gets the clean ones
    sections = sections.map((points, i) => dropGpsSpikes(points, local.sections[i].mode));
    // ONE source for the section count: trip.track.sections and the track-points docs both follow it

    const durationS = Math.max(0, Math.round((endedMs - local.startedAt) / 1000));
    // sum per section: no phantom distance across the jump between two sections
    const totalM = sections.reduce((m, s) => m + summarize(s).distanceM, 0);
    const startIso = toLocalIso(local.startedAt);
    const endIso = toLocalIso(endedMs);

    const track = {
      personKey: owner.personKey,
      ownerUid: owner.uid,
      startedAt: new Date(local.startedAt).toISOString(),
      endedAt: new Date(endedMs).toISOString(),
      durationS,
      sections: tripSections(local, sections, tripKey, strokes), // keeps steps, adds the stroke figures (spec 1.122)
    } as TripTrack;
    // photos: only from the local list — hidden ones left out (spec §6: never uploaded), path400 stripped, thumbPath
    // kept. Without a local list the key is omitted, so the merge keeps what is stored and never wipes thumb paths.
    // checked against the clean track: a photo taken during a spike carries the spike's position (spec 1.129 §3.3)
    if (local.photos) track.photos = serverPhotos(photosOnTrack(local.photos, sections));
    // Logbuch link (spec 1.123 §4): written once the link transaction succeeded; a track without a link removes a
    // stored one (the set merges, so leaving the field out would keep it); a link still pending leaves it alone
    if (local.logbuchKey && local.logbuchLinked) track.logbuchKey = local.logbuchKey;
    else if (!local.logbuchKey) (track as unknown as Record<string, unknown>)['logbuchKey'] = deleteField();

    // SECURITY NOTE: the points are only owner-private once the owner-only trips rules (branch
    // work/tracker-rules) are deployed. Under today's tenant-writable trips rules a tenant member
    // could take over track.personKey. Accepted for bkg/bka (no real users yet); closed by
    // work/tracker-rules, which checks the owner on both resource and request.
    // Plain object without `okey` (FirestoreService strips it on write as well).
    const trip = {
      tenants: owner.tenants,
      isArchived: false,
      name: local.name,
      type: TRACKER_TRIP_TYPE,
      index: `d:${convertDateFormatToString(startIso, DateFormat.IsoDateTime, DateFormat.StoreDate)}`,
      tags: '',
      notes: '',
      startDate: convertDateFormatToString(startIso, DateFormat.IsoDateTime, DateFormat.StoreDate),
      startTime: convertDateFormatToString(startIso, DateFormat.IsoDateTime, DateFormat.Time),
      endDate: convertDateFormatToString(endIso, DateFormat.IsoDateTime, DateFormat.StoreDate),
      endTime: convertDateFormatToString(endIso, DateFormat.IsoDateTime, DateFormat.Time),
      locations: [],
      customLocationLabel: '',
      distance: Math.round(totalM / 100) / 10,
      participants: [],
      state: 'done',
      track,
      // the boat of the linked Logbuch trip (only when known: Firestore rejects undefined)
      ...(local.resource ? { resource: local.resource } : {}),
    };

    const batch = this.firestoreService.getBatch();
    batch.set(doc(this.firestoreService.firestore, `${TripCollection}/${tripKey}`), trip, { merge: true });
    sections.forEach((points, i) => {
      const pointsDoc: TrackPointsDoc = {
        tenants: owner.tenants,
        section: i,
        mode: local.sections[i].mode,
        count: points.length,
        encoded: encodeTrack(points),
      };
      const times = local.sections[i].mode === 'row' ? strokes?.[i] ?? [] : [];
      if (times.length > 0) pointsDoc.strokeTimes = encodeStrokeTimes(times, strokeTimesBase(points));
      const altitudes = encodeAltitudes(points);
      if (altitudes) pointsDoc.altitudes = altitudes;
      batch.set(doc(this.firestoreService.firestore, `${TripCollection}/${tripKey}/${TRACK_POINTS}/${i}`), pointsDoc);
    });
    for (let n = sections.length; n < (staleUpTo ?? 0); n++) {
      batch.delete(doc(this.firestoreService.firestore, `${TripCollection}/${tripKey}/${TRACK_POINTS}/${n}`));
    }
    await batch.commit();
    return tripKey;
  }

  /** The recording person's tracker trips, newest first. Filters on `type` AND `track.personKey` (owner-only rules). */
  public listMine(personKey: string): Observable<TripModel[]> {
    return this.firestoreService.searchData<TripModel>(
      TripCollection,
      [
        ...getSystemQuery(this.env.tenantId),
        { key: 'type', operator: '==', value: TRACKER_TRIP_TYPE },
        { key: 'track.personKey', operator: '==', value: personKey },
      ],
      'startDate',
      'desc',
    );
  }

  /**
   * Deletes an uploaded tracker trip the app way (deleting-models skill): getDeletePatch decides between detach
   * and archive (a tracker trip is single-person and single-tenant, so it is archived). Only that patch is
   * written. A trip that was never uploaded (not-found) counts as deleted. Resolves only on the server's ack:
   * callers run it detached.
   */
  public async archive(tripKey: string, tenants?: string[]): Promise<void> {
    const patch = getDeletePatch(tenants && tenants.length > 0 ? tenants : [this.env.tenantId], this.env.tenantId);
    try {
      await updateDoc(doc(this.firestoreService.firestore, `${TripCollection}/${tripKey}`), { ...patch });
    } catch (error) {
      if ((error as { code?: string }).code === 'not-found') return;
      throw error;
    }
  }

  /**
   * One section's points (with their GPS heights), stroke times (spec 1.122 2c) and stored terrain heights
   * (spec 1.128; undefined when never looked up); all empty when the doc is missing.
   */
  public async readSection(tripKey: string, n: number): Promise<SectionRead> {
    const snap = await getDoc(doc(this.firestoreService.firestore, `${TripCollection}/${tripKey}/${TRACK_POINTS}/${n}`));
    if (!snap.exists()) return { points: [], strokeTimes: [], spikes: 0 };
    const data = snap.data() as TrackPointsDoc;
    const decoded = decodeTrack(data.encoded);
    const raw = withAltitudes(decoded, decodeAltitudes(data.altitudes, decoded.length));
    // a Strecke uploaded before the spike filter (spec 1.129 §3.2): left out on reading, terrain heights in step
    const keep = spikeFreeIndices(raw, data.mode);
    const points = keep.length === raw.length ? raw : keep.map((k) => raw[k]);
    const out: SectionRead = {
      points, strokeTimes: decodeStrokeTimes(data.strokeTimes, strokeTimesBase(points)), spikes: raw.length - keep.length,
    };
    if (data.transitRouteKey !== undefined) {
      out.transit = { key: data.transitRouteKey, points: data.transitRoute ? decodeTrack(data.transitRoute) : [], line: data.transitLine ?? '' };
    }
    if (data.terrainAltitudes) {
      out.terrain = pickIndices(decodeAltitudes(data.terrainAltitudes, raw.length), keep);
      out.terrainProvider = data.terrainProvider ?? '';
    }
    return out;
  }

  /**
   * Stores the terrain heights of an uploaded Strecke on its track-points docs (spec 1.128 §2), so the lookup runs
   * once. Owner only (rules); a section without heights is skipped. Resolves on the server's ack: run it detached.
   */
  public async saveTerrainAltitudes(tripKey: string, perSection: (number | undefined)[][], provider: string): Promise<void> {
    const batch = this.firestoreService.getBatch();
    let writes = 0;
    perSection.forEach((alts, n) => {
      const encoded = encodeAltitudes(alts.map((alt) => ({ alt })));
      if (!encoded) return;
      batch.update(doc(this.firestoreService.firestore, `${TripCollection}/${tripKey}/${TRACK_POINTS}/${n}`), { terrainAltitudes: encoded, terrainProvider: provider });
      writes++;
    });
    if (writes > 0) await batch.commit();
  }

  /**
   * Stores the timetable line of one section of an uploaded Strecke (spec 1.129 §4.2), also «none found», so the
   * lookup runs once. Owner only (rules). Resolves on the server's ack: run it detached.
   */
  public async saveTransitRoute(tripKey: string, n: number, route: StoredTransitRoute): Promise<void> {
    await updateDoc(doc(this.firestoreService.firestore, `${TripCollection}/${tripKey}/${TRACK_POINTS}/${n}`), {
      transitRouteKey: route.key,
      transitRoute: encodeTrack(route.points.map((p) => ({ ...p, t: 0 }))),
      transitLine: route.line,
    });
  }

  /** The decoded points of one section; [] when the doc is missing. */
  public async readPoints(tripKey: string, n: number): Promise<TrackPoint[]> {
    const snap = await getDoc(doc(this.firestoreService.firestore, `${TripCollection}/${tripKey}/${TRACK_POINTS}/${n}`));
    if (!snap.exists()) return [];
    const data = snap.data() as TrackPointsDoc;
    const points = decodeTrack(data.encoded);
    return dropGpsSpikes(withAltitudes(points, decodeAltitudes(data.altitudes, points.length)), data.mode);
  }

  /** Tracker trips of one person on one day (the diary's view). Unordered: equality-only query; callers sort by startTime. */
  public listOfDay(personKey: string, tenantId: string, date: string): Observable<TripModel[]> {
    return this.firestoreService.searchData<TripModel>(TripCollection, [
      ...getSystemQuery(tenantId),
      { key: 'type', operator: '==', value: TRACKER_TRIP_TYPE },
      { key: 'track.personKey', operator: '==', value: personKey },
      { key: 'startDate', operator: '==', value: date },
    ], 'none'); // no orderBy: the default 'name' needs a composite index that does not exist (the query failed into []); callers sort by startTime
  }

  /** One Logbuch trip (the push «Strecke aufzeichnen?» names it); undefined when it is missing or not a Logbuch trip. */
  public async readLogbuch(logbuchKey: string): Promise<TripModel | undefined> {
    const snap = await getDoc(doc(this.firestoreService.firestore, `${TripCollection}/${logbuchKey}`));
    if (!snap.exists()) return undefined;
    const trip = { ...(snap.data() as TripModel), okey: snap.id };
    return trip.type === LOGBUCH_TRIP_TYPE ? trip : undefined;
  }

  /**
   * Today's open Logbuch trips with the person on the crew (spec 1.123 §4.2). `participants` is an AvatarInfo[] and
   * cannot be queried, so the crew and the state are filtered here (the query uses the existing
   * isArchived/tenants/type/startDate index).
   */
  public async findMyOpenLogbuchTrips(personKey: string, tenantId: string, date: string): Promise<TripModel[]> {
    return (await this.logbuchTripsOfDay(tenantId, date)).filter((t) => (t.state ?? '').startsWith('open') && isLogbuchCrew(t, personKey));
  }

  /**
   * Logbuch trips of the recording's day a finished recording can still be linked to: open or ended, the person on
   * the crew, the Logbuch window overlapping the recording, and the deadline (end + CREW_TRACK_DAYS) not passed.
   * Only the recording's START day is searched (startDate equality, one indexed query): a Logbuch trip that started
   * the evening before a recording begun after midnight is not offered.
   */
  public async findMyLogbuchTripsOverlapping(personKey: string, tenantId: string, startedAtMs: number, endedAtMs: number): Promise<TripModel[]> {
    const today = localStoreDate(Date.now());
    const trips = await this.logbuchTripsOfDay(tenantId, localStoreDate(startedAtMs));
    return logbuchLinkCandidates(trips, personKey, startedAtMs, endedAtMs).filter((t) => {
      const deadline = crewTrackDeadline(t);
      return deadline === '' || today <= deadline;
    });
  }

  private async logbuchTripsOfDay(tenantId: string, date: string): Promise<TripModel[]> {
    const snap = await getDocs(query(
      collection(this.firestoreService.firestore, TripCollection),
      where('isArchived', '==', false),
      where('tenants', 'array-contains', tenantId),
      where('type', '==', LOGBUCH_TRIP_TYPE),
      where('startDate', '==', date),
    ));
    return snap.docs.map((d) => ({ ...(d.data() as TripModel), okey: d.id }));
  }

  /**
   * Links a recording to a Logbuch trip (spec 1.123 §4.3), in a transaction: only a crew member may link, and only
   * when the trip has no recording yet (or already this one). `trackRequest` names the recorder: the stop push goes
   * there. A trip recorded by someone else answers with that person's first name; a trip that is gone, or a person
   * not on the crew, with ''. Needs the network (a transaction fails offline).
   */
  public async linkLogbuch(logbuchKey: string, trackKey: string, personKey: string): Promise<LogbuchLinkResult> {
    const ref = doc(this.firestoreService.firestore, `${TripCollection}/${logbuchKey}`);
    return runTransaction(this.firestoreService.firestore, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) return { ok: false, recorderName: '' };
      const trip = snap.data() as TripModel;
      if (trip.type !== LOGBUCH_TRIP_TYPE || trip.isArchived || trip.deletedAt || trip.state === 'deleted' || !isLogbuchCrew(trip, personKey)) {
        return { ok: false, recorderName: '' };
      }
      const current = trip.trackKey ?? '';
      if (current === '' || current === trackKey) {
        tx.update(ref, { trackKey, trackRequest: { personKey } });
        return { ok: true };
      }
      const recorder = trip.trackRequest?.personKey ?? '';
      const recorderName = (trip.participants ?? []).find((p) => p.key === recorder)?.name1 ?? '';
      return { ok: false, recorderName };
    });
  }

  /** Removes the link from the Logbuch trip (`trackKey` and `trackRequest`), only while it still names this recording. */
  public async unlinkLogbuch(logbuchKey: string, trackKey: string): Promise<void> {
    const ref = doc(this.firestoreService.firestore, `${TripCollection}/${logbuchKey}`);
    await runTransaction(this.firestoreService.firestore, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists() || (snap.data() as TripModel).trackKey !== trackKey) return;
      tx.update(ref, { trackKey: deleteField(), trackRequest: deleteField() });
    });
  }

  /**
   * Writes (or with `link` undefined, deletes) `track.logbuchKey` and the boat on an uploaded recording that is not
   * on this device. A recording that was never uploaded (not-found) is left alone. Resolves only on the server's ack:
   * callers run it detached.
   */
  public async setLogbuchLink(tripKey: string, link: { logbuchKey: string; resource?: AvatarInfo } | undefined): Promise<void> {
    const patch: Record<string, unknown> = link
      ? { 'track.logbuchKey': link.logbuchKey, ...(link.resource ? { resource: link.resource } : {}) }
      : { 'track.logbuchKey': deleteField() };
    try {
      await updateDoc(doc(this.firestoreService.firestore, `${TripCollection}/${tripKey}`), patch);
    } catch (error) {
      if ((error as { code?: string }).code === 'not-found') return;
      throw error;
    }
  }

  /**
   * Uploads one 400 px thumbnail (a device file) to the private bucket; returns its Storage path.
   * @throws ThumbSourceMissingError when the device file cannot be read
   */
  public async uploadThumb(tenantId: string, tripKey: string, n: number, localPath: string): Promise<string> {
    const path = trackThumbPath(tenantId, tripKey, n);
    // the Swift plugin returns a bare absolute path; Filesystem.readFile on iOS needs a URI
    let data: string | Blob;
    try {
      ({ data } = await Filesystem.readFile({ path: localPath.startsWith('file://') ? localPath : 'file://' + localPath }));
    } catch (error) {
      throw new ThumbSourceMissingError(localPath, error);
    }
    let blob: Blob;
    if (typeof data === 'string') {
      const bin = atob(data);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      blob = new Blob([bytes], { type: 'image/jpeg' });
    } else {
      blob = data;
    }
    await uploadBytes(ref(getBkStorage('private'), path), blob, { contentType: 'image/jpeg' });
    this.thumbCache.delete(path);
    return path;
  }

  /** True when a device-local file (e.g. a photo's path400 in the app cache, which iOS may purge) still exists. */
  public async hasLocalFile(localPath: string): Promise<boolean> {
    try {
      await Filesystem.stat({ path: localPath.startsWith('file://') ? localPath : 'file://' + localPath });
      return true;
    } catch {
      return false;
    }
  }

  /** A thumbnail as a data: URL (private bucket, owner-only), cached per path. */
  public readThumb(thumbPath: string): Promise<string> {
    const cached = this.thumbCache.get(thumbPath);
    if (cached) return cached;
    const pending = getBlob(ref(getBkStorage('private'), thumbPath)).then(
      (blob) =>
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob);
        }),
    );
    this.thumbCache.set(thumbPath, pending);
    // a failed read must not stay cached
    pending.catch(() => this.thumbCache.delete(thumbPath));
    return pending;
  }

  /**
   * Renames an uploaded trip on the server only (the diary's track view). The recording device keeps its own name:
   * a later re-upload of that track from the device (a correction, merged photos) writes the device's name again.
   */
  public async rename(tripKey: string, name: string): Promise<void> {
    await updateDoc(doc(this.firestoreService.firestore, `${TripCollection}/${tripKey}`), { name });
  }

  /**
   * Writes the photo list: hidden photos are left out (spec §6), path400 is stripped. Resolves only on the server's
   * ack: callers run it detached.
   */
  public async setPhotos(tripKey: string, photos: (TrackPhoto & { path400?: string })[]): Promise<void> {
    await updateDoc(doc(this.firestoreService.firestore, `${TripCollection}/${tripKey}`), { 'track.photos': serverPhotos(photos) });
  }

  /**
   * Deletes one thumbnail from the private bucket (a photo was hidden or removed). A missing file counts as deleted.
   * Callers run it detached; the cached data URL goes at once.
   */
  public async deleteThumb(thumbPath: string): Promise<void> {
    this.thumbCache.delete(thumbPath);
    try {
      await deleteObject(ref(getBkStorage('private'), thumbPath));
    } catch (error) {
      if ((error as { code?: string }).code === 'storage/object-not-found') return;
      throw error;
    }
  }
}
