import { inject, Injectable } from '@angular/core';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { Observable } from 'rxjs';

import { ENV } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { TRACKER_TRIP_TYPE, TransportMode, TripCollection, TripModel, TripTrack } from '@okr/shared-models';
import { convertDateFormatToString, DateFormat, getDeletePatch, getSystemQuery } from '@okr/shared-util-core';
import { decodeTrack, encodeTrack, LocalSection, LocalTrack, summarize, toTrackSections, TrackPoint } from '@okr/mobility-tracker-util';

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

@Injectable({ providedIn: 'root' })
export class TrackService {
  private readonly firestoreService = inject(FirestoreService);
  private readonly env = inject(ENV);

  /**
   * Upload a finished local track: the trip doc and one track-points doc per section in ONE batch.
   * The trip okey is the local track key and batch.set overwrites, so a retried upload replaces itself.
   * NOTE: a re-upload with fewer sections leaves the extra track-points docs behind: remove them with
   * deleteExtraPoints() once the upload succeeded.
   * @returns the trip key
   */
  public async upload(local: LocalTrack, sections: TrackPoint[][], owner: { personKey: string; uid: string }): Promise<string> {
    const tripKey = local.key;
    const tenantId = this.env.tenantId;
    const endedMs = local.endedAt ?? local.startedAt;
    if (local.sections.length !== sections.length) throw new Error('track sections and points differ');
    // ONE source for the section count: trip.track.sections and the track-points docs both follow it
    const localSections: LocalSection[] = local.sections.map((s, i) => ({ mode: s.mode, detected: s.detected, points: sections[i] }));

    const durationS = Math.max(0, Math.round((endedMs - local.startedAt) / 1000));
    // sum per section: no phantom distance across the jump between two sections
    const totalM = sections.reduce((m, s) => m + summarize(s).distanceM, 0);
    const startIso = toLocalIso(local.startedAt);
    const endIso = toLocalIso(endedMs);

    const track: TripTrack = {
      personKey: owner.personKey,
      ownerUid: owner.uid,
      startedAt: new Date(local.startedAt).toISOString(),
      endedAt: new Date(endedMs).toISOString(),
      durationS,
      sections: toTrackSections(localSections, tripKey),
      photos: [],
    };

    // SECURITY NOTE: the points are only owner-private once the owner-only trips rules (branch
    // work/tracker-rules) are deployed. Under today's tenant-writable trips rules a tenant member
    // could take over track.personKey. Accepted for bkg/bka (no real users yet); closed by
    // work/tracker-rules, which checks the owner on both resource and request.
    // Plain object without `okey` (FirestoreService strips it on write as well).
    const trip = {
      tenants: [tenantId],
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
    batch.set(doc(this.firestoreService.firestore, `${TripCollection}/${tripKey}`), trip);
    sections.forEach((points, i) => {
      const pointsDoc: TrackPointsDoc = {
        tenants: [tenantId],
        section: i,
        mode: local.sections[i].mode,
        count: points.length,
        encoded: encodeTrack(points),
      };
      batch.set(doc(this.firestoreService.firestore, `${TripCollection}/${tripKey}/${TRACK_POINTS}/${i}`), pointsDoc);
    });
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
   * Deletes the track-points docs fromIndex … toIndexExclusive-1 in one batch (left over after a correction
   * reduced the number of sections). Call it only after the trip exists (the rules read the trip's owner).
   */
  public async deleteExtraPoints(tripKey: string, fromIndex: number, toIndexExclusive: number): Promise<void> {
    if (toIndexExclusive <= fromIndex) return;
    const batch = this.firestoreService.getBatch();
    for (let n = Math.max(0, fromIndex); n < toIndexExclusive; n++) {
      batch.delete(doc(this.firestoreService.firestore, `${TripCollection}/${tripKey}/${TRACK_POINTS}/${n}`));
    }
    await batch.commit();
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
}
