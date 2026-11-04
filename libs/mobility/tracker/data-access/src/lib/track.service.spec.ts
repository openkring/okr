import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { ENV } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import type { LocalTrack } from '@okr/mobility-tracker-util';

vi.mock('firebase/firestore', async (orig) => ({
  ...(await (orig() as Promise<Record<string, unknown>>)),
  doc: (_db: unknown, path: string) => path,
  arrayUnion: (...values: string[]) => ({ union: values }),
}));

import { TrackService } from './track.service';

function upload(tenants: string[]) {
  const sets: { path: string; data: Record<string, unknown>; options?: unknown }[] = [];
  const batch = { set: (path: string, data: Record<string, unknown>, options?: unknown) => sets.push({ path, data, options }), delete: vi.fn(), commit: vi.fn().mockResolvedValue(undefined) };
  TestBed.configureTestingModule({
    providers: [
      TrackService,
      { provide: ENV, useValue: { tenantId: 'scs' } },
      { provide: FirestoreService, useValue: { firestore: {}, getBatch: () => batch } },
    ],
  });
  const local = {
    key: 't1', state: 'done', uploaded: false, name: 'Rudern', startedAt: 1_762_000_000_000, endedAt: 1_762_000_600_000,
    sections: [{ mode: 'row', detected: false, startedAt: 1_762_000_000_000 }],
  } as unknown as LocalTrack;
  const points = [[{ lat: 47.2, lng: 8.7, t: 1_762_000_000_000 }, { lat: 47.21, lng: 8.7, t: 1_762_000_060_000 }]];
  return TestBed.inject(TrackService).upload(local, points, { personKey: 'p', uid: 'u', tenants }).then(() => sets);
}

describe('TrackService.upload', () => {
  it('does not replace tenants on the trip: a re-upload keeps what the server added', async () => {
    const [trip] = await upload(['scs']);
    expect(trip.path).toBe('trips/t1');
    expect(trip.options).toEqual({ merge: true });
    expect(trip.data['tenants']).toEqual({ union: ['scs'] });
  });
  it('writes plain tenants on the points', async () => {
    const [, points] = await upload(['scs']);
    expect(points.path).toBe('trips/t1/track-points/0');
    expect(points.data['tenants']).toEqual(['scs']);
  });
});
