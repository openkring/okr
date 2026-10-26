import { inject, Injectable } from '@angular/core';
import { Filesystem } from '@capacitor/filesystem';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { deleteObject, getBlob, ref, uploadBytes } from 'firebase/storage';
import { Observable } from 'rxjs';

import { ENV, getBkStorage } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { TRACKER_TRIP_TYPE, TrackPhoto, TransportMode, TripCollection, TripModel, TripTrack } from '@okr/shared-models';
import { convertDateFormatToString, DateFormat, getDeletePatch, getSystemQuery } from '@okr/shared-util-core';
import { decodeStrokeTimes, decodeTrack, encodeStrokeTimes, encodeTrack, LocalTrack, serverPhotos, summarize, trackThumbPath, TrackPoint, tripSections } from '@okr/mobility-tracker-util';

/** One section's points, stored as an encoded polyline in trips/{key}/track-points/{n}. */
export interface TrackPointsDoc {
  tenants: string[];
  section: number;
  mode: TransportMode;
  count: number;
  encoded: string;
  /** row: stroke times, delta-encoded ms since the section start (spec 1.122, phase 2) */
  strokeTimes?: string;
}

const TRACK_POINTS = 'track-points';

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
    if (local.photos) track.photos = serverPhotos(local.photos);

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
      if (times.length > 0) pointsDoc.strokeTimes = encodeStrokeTimes(times, points[0]?.t ?? 0);
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

  /** One section's points and stroke times (spec 1.122 2c); both empty when the doc is missing. */
  public async readSection(tripKey: string, n: number): Promise<{ points: TrackPoint[]; strokeTimes: number[] }> {
    const snap = await getDoc(doc(this.firestoreService.firestore, `${TripCollection}/${tripKey}/${TRACK_POINTS}/${n}`));
    if (!snap.exists()) return { points: [], strokeTimes: [] };
    const data = snap.data() as TrackPointsDoc;
    const points = decodeTrack(data.encoded);
    return { points, strokeTimes: decodeStrokeTimes(data.strokeTimes, points[0]?.t ?? 0) };
  }

  /** The decoded points of one section; [] when the doc is missing. */
  public async readPoints(tripKey: string, n: number): Promise<TrackPoint[]> {
    const snap = await getDoc(doc(this.firestoreService.firestore, `${TripCollection}/${tripKey}/${TRACK_POINTS}/${n}`));
    if (!snap.exists()) return [];
    return decodeTrack((snap.data() as TrackPointsDoc).encoded);
  }

  /** Tracker trips of one person on one day (the diary's view). Unordered: equality-only query; callers sort by startTime. */
  public listOfDay(personKey: string, tenantId: string, date: string): Observable<TripModel[]> {
    return this.firestoreService.searchData<TripModel>(TripCollection, [
      ...getSystemQuery(tenantId),
      { key: 'type', operator: '==', value: TRACKER_TRIP_TYPE },
      { key: 'track.personKey', operator: '==', value: personKey },
      { key: 'startDate', operator: '==', value: date },
    ]);
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
