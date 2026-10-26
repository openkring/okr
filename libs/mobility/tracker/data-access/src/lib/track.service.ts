import { inject, Injectable } from '@angular/core';
import { Filesystem } from '@capacitor/filesystem';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { getBlob, ref, uploadBytes } from 'firebase/storage';
import { Observable } from 'rxjs';

import { ENV, getBkStorage } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { TRACKER_TRIP_TYPE, TrackPhoto, TransportMode, TripCollection, TripModel, TripTrack } from '@okr/shared-models';
import { convertDateFormatToString, DateFormat, getDeletePatch, getSystemQuery } from '@okr/shared-util-core';
import { decodeTrack, encodeTrack, LocalSection, LocalTrack, summarize, toTrackSections, trackThumbPath, TrackPoint } from '@okr/mobility-tracker-util';

/** One section's points, stored as an encoded polyline in trips/{key}/track-points/{n}. */
export interface TrackPointsDoc {
  tenants: string[];
  section: number;
  mode: TransportMode;
  count: number;
  encoded: string;
}

const TRACK_POINTS = 'track-points';

/** A local wall-clock ISO timestamp (yyyy-MM-ddTHH:mm:ss) for the given epoch milliseconds. */
function toLocalIso(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** A local photo as a stored TrackPhoto: the device-local path400 is never persisted, and no key is written as undefined. */
function toTrackPhoto(p: TrackPhoto & { path400?: string }): TrackPhoto {
  const out: TrackPhoto = { assetId: p.assetId, takenAt: p.takenAt, lat: p.lat, lng: p.lng, ownGps: p.ownGps, hidden: p.hidden };
  if (p.imageKey !== undefined) out.imageKey = p.imageKey;
  if (p.thumbPath !== undefined) out.thumbPath = p.thumbPath;
  return out;
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
  public async upload(local: LocalTrack, sections: TrackPoint[][], owner: { personKey: string; uid: string; tenants: string[] }, staleUpTo?: number): Promise<string> {
    const tripKey = local.key;
    const endedMs = local.endedAt ?? local.startedAt;
    if (local.sections.length !== sections.length) throw new Error('track sections and points differ');
    // ONE source for the section count: trip.track.sections and the track-points docs both follow it
    const localSections: LocalSection[] = local.sections.map((s, i) => ({ mode: s.mode, detected: s.detected, points: sections[i] }));

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
      sections: toTrackSections(localSections, tripKey),
    } as TripTrack;
    // photos: only from the local list (path400 stripped, thumbPath kept). Without a local list the key is omitted,
    // so the merge keeps what is stored and never wipes uploaded thumb paths.
    if (local.photos) track.photos = local.photos.map(toTrackPhoto);

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

  /** Uploads one 400 px thumbnail (a device file) to the private bucket; returns its Storage path. */
  public async uploadThumb(tenantId: string, tripKey: string, n: number, localPath: string): Promise<string> {
    const path = trackThumbPath(tenantId, tripKey, n);
    // the Swift plugin returns a bare absolute path; Filesystem.readFile on iOS needs a URI
    const { data } = await Filesystem.readFile({ path: localPath.startsWith('file://') ? localPath : 'file://' + localPath });
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

  /** Writes the photo list (without path400). Resolves only on the server's ack: callers run it detached. */
  public async setPhotos(tripKey: string, photos: TrackPhoto[]): Promise<void> {
    await updateDoc(doc(this.firestoreService.firestore, `${TripCollection}/${tripKey}`), { 'track.photos': photos.map(toTrackPhoto) });
  }
}
