import { JournalBookModel } from '@okr/shared-models';

import { coverLayout } from './journal-book-cover.util';
import { Box } from './journal-book-layout.util';
import { LngLat } from './journal-book-map.util';
import { BookLayout, MAP_BACK, MAP_OVERVIEW, mapFileOf } from './journal-book.util';
import { flyoverInputOf, flyoverTimeline } from './journal-flyover.util';
import { JournalState } from './journal-merge.util';
import { footprintsOf, imagesOf } from './journal-view.util';

/**
 * What each book map shows (design §8), for the browser renderer: one entry per file of `layout.mapFiles`, with the
 * frame it fills. Numbers are the book's footprint numbers (1…n over the published footprints in date order).
 * Overview and cover back: the whole route; a stretch: the previous stop and this one, with the flyover's leg path.
 */
export interface BookMapPlan {
  file: string;
  box: Box;
  route: LngLat[]; // [lng, lat]
  stops: { lng: number; lat: number; n: number }[];
  legPath?: LngLat[];
}

export function bookMapPlan(state: JournalState, journalKey: string, book: JournalBookModel, layout: BookLayout): BookMapPlan[] {
  const published = footprintsOf(state, journalKey).filter((f) => f.publishState === 'published');
  const numberOf = new Map(published.map((f, i) => [f.key, i + 1]));
  const positioned = published.filter((f) => f.latitude !== undefined && f.longitude !== undefined);
  const stops = positioned.map((f) => ({ lng: f.longitude as number, lat: f.latitude as number, n: numberOf.get(f.key) ?? 0 }));
  const route = stops.map((s): LngLat => [s.lng, s.lat]);

  const boxes = new Map<string, Box>();
  for (const page of layout.pages) for (const f of page.frames) if (f.kind === 'map' && !boxes.has(f.file)) boxes.set(f.file, f.box);
  const back = coverLayout(book, layout.title, layout.period, layout.coverImageKey)?.frames.find((f) => f.kind === 'map');
  if (back) boxes.set(MAP_BACK, back.box);

  const { stops: flyStops, points } = flyoverInputOf(published, imagesOf(state, journalKey), () => '');
  const timeline = flyoverTimeline(flyStops, points);
  const legs = timeline?.legs ?? [];

  const plans: BookMapPlan[] = [];
  for (const file of layout.mapFiles) {
    const box = boxes.get(file);
    if (!box) continue;
    if (file === MAP_OVERVIEW || file === MAP_BACK) {
      if (stops.length > 0) plans.push({ file, box, route, stops });
      continue;
    }
    const i = legs.findIndex((l) => mapFileOf(l.to.key) === file);
    if (i < 0 || !timeline) continue;
    const leg = legs[i];
    const prev = i === 0 ? timeline.start : legs[i - 1].to;
    const ends = [prev, leg.to].map((s) => ({ lng: s.lng, lat: s.lat, n: numberOf.get(s.key) ?? 0 }));
    plans.push({ file, box, route: ends.map((s): LngLat => [s.lng, s.lat]), stops: ends, legPath: leg.path.map(([lng, lat]): LngLat => [lng, lat]) });
  }
  return plans;
}
