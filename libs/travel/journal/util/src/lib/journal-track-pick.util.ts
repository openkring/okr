import { TrackPhoto, TransportMode, TripModel } from '@okr/shared-models';
import { convertDateFormatToString, DateFormat } from '@okr/shared-util-core';
import { formatKm } from '@okr/mobility-tracker-util';

import { BaseLayerOption } from './journal-base-layer.util';
import { JournalTileSource } from './journal-map.util';
import { Bbox } from './journal-tiles.util';
import { trackKeyOf, TrackView } from './journal-track.util';
import { ImageView } from './journal-view.util';

/**
 * The journal's track picker and track rendering (spec 1.154 phase 5, decisions 6–8): which tracks «Strecke wählen»
 * lists, how a track is summarised, which recorded photos must still be imported, and which base-layer tiles the
 * track map may draw on. Pure: the feature reads the tracker trips and the journal state and passes them in.
 */

/** One row of the picker: a tracker trip (online) or a track the journal holds. `key` is the journal track key. */
export interface TrackPickItem {
  key: string;
  tripKey: string;
  name: string;
  startedAt: string; // ISO, for the date shown
  distanceM: number;
  modes: TransportMode[];
  inJournal: boolean; // the journal holds this track already (no copy, no photo import when chosen)
}

/** A local wall-clock timestamp (yyyy-MM-ddTHH:mm:ss) of an ISO instant, in this device's time zone; '' when unreadable. */
export function localWallClock(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return '';
  const d = new Date(ms);
  const two = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}T${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`;
}

/** The view date (dd.MM.yyyy) of an ISO instant in this device's time zone; '' when unreadable. */
export function trackDate(iso: string): string {
  const local = localWallClock(iso);
  return local ? convertDateFormatToString(local, DateFormat.IsoDateTime, DateFormat.ViewDate, false) : '';
}

/** «Name · 14.01.2027 · 12,3 km»; an unnamed track takes `fallbackName`; empty parts are left out. */
export function trackSummary(track: Pick<TrackPickItem, 'name' | 'startedAt' | 'distanceM'>, fallbackName: string): string {
  return [track.name.trim() || fallbackName, trackDate(track.startedAt), track.distanceM > 0 ? formatKm(track.distanceM) : '']
    .filter((part) => part !== '').join(' · ');
}

function itemOfTrip(trip: TripModel, inJournal: Set<string>): TrackPickItem {
  const sections = trip.track?.sections ?? [];
  const key = trackKeyOf(trip.okey);
  return {
    key, tripKey: trip.okey, name: trip.name ?? '', startedAt: trip.track?.startedAt ?? '',
    distanceM: Math.round(sections.reduce((m, s) => m + (Number.isFinite(s.distanceM) ? s.distanceM : 0), 0)),
    modes: [...new Set(sections.map((s) => s.mode))], inJournal: inJournal.has(key),
  };
}

function itemOfTrack(track: TrackView): TrackPickItem {
  return { key: track.key, tripKey: track.tripKey, name: track.name, startedAt: track.startedAt, distanceM: track.distanceM, modes: track.modes, inJournal: true };
}

const newestFirst = (a: TrackPickItem, b: TrackPickItem): number => (a.startedAt < b.startedAt ? 1 : a.startedAt > b.startedAt ? -1 : 0);

/**
 * The picker's rows (decision 7): the footprint day's trips on top, then the author's other trips, then the tracks the
 * journal holds that are not among them (another author's, one sent from the iPhone) — each group newest first, every
 * track once. Offline `mine` and `ofDay` are empty: the journal's tracks only. Trips without a recorded track are left out.
 */
export function trackPickItems(mine: TripModel[], ofDay: TripModel[], journalTracks: TrackView[]): TrackPickItem[] {
  const inJournal = new Set(journalTracks.map((t) => t.key));
  const seen = new Set<string>();
  const take = (items: TrackPickItem[]): TrackPickItem[] => items.filter((i) => !seen.has(i.key) && seen.add(i.key)).sort(newestFirst);
  const recorded = (trips: TripModel[]) => trips.filter((t) => (t.track?.sections.length ?? 0) > 0).map((t) => itemOfTrip(t, inJournal));
  return [...take(recorded(ofDay)), ...take(recorded(mine)), ...take(journalTracks.map(itemOfTrack))];
}

/**
 * Which of a trip's visible photos the journal already has (decision 8): by the image key the trip recorded, or by the
 * PhotoKit id of a photo imported before (the same photo is never imported twice). The rest must still be imported.
 * Hidden photos are neither.
 */
export function trackPhotoPlan(trip: TripModel, images: Iterable<ImageView>): { keys: Record<string, string>; toImport: TrackPhoto[] } {
  const byKey = new Set<string>();
  const byAsset = new Map<string, string>();
  for (const image of images) {
    if (image.videoPath !== undefined) continue;
    byKey.add(image.key);
    if (image.localIdentifier) byAsset.set(image.localIdentifier, image.key);
  }
  const keys: Record<string, string> = {};
  const toImport: TrackPhoto[] = [];
  for (const photo of trip.track?.photos ?? []) {
    if (photo.hidden || !photo.assetId || keys[photo.assetId]) continue;
    const known = photo.imageKey && byKey.has(photo.imageKey) ? photo.imageKey : byAsset.get(photo.assetId);
    if (known) keys[photo.assetId] = known;
    else if (!toImport.some((p) => p.assetId === photo.assetId)) toImport.push(photo);
  }
  return { keys, toImport };
}

/** The box around points, as [west, south, east, north]; undefined without a finite point. */
export function boundsOf(points: { lat: number; lng: number }[]): Bbox | undefined {
  const finite = points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  if (finite.length === 0) return undefined;
  const lats = finite.map((p) => p.lat);
  const lngs = finite.map((p) => p.lng);
  return [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)];
}

const isRasterOnly = (o: BaseLayerOption): boolean => o.kind !== 'google' && o.sources.every((s) => s.kind !== 'vector');

/**
 * The tiles of the track map (decision 6, ruling R4): only raster sources that are not Google — swisstopo, the GIBS
 * world, downloaded raster tiles. The selected layer when it is such a layer; for a Google or vector layer nothing
 * (`undefined`: the track map draws its default swisstopo tiles), except offline, where those cannot load: then the
 * first offered raster layer (the downloaded world background at the latest).
 */
export function trackTileSources(options: BaseLayerOption[], selectedId: string, online: boolean): JournalTileSource[] | undefined {
  const selected = options.find((o) => o.id === selectedId);
  if (selected && isRasterOnly(selected)) return selected.sources;
  if (online) return undefined;
  return options.find(isRasterOnly)?.sources;
}
