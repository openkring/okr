import { CalEventModel, TIMELINE_CONFIG_SHAPE, TimelineConfig } from '@okr/shared-models';

/** One point on the timeline: what happened, when, and optionally a picture of it. */
export interface TimelineEntry {
  okey: string;
  title: string;
  date: string;      // startDate in store format
  imageUrl: string;  // '' renders the entry without an image
}

/** Firestore reads return raw documents — older sections lack the newer fields. */
export function withTimelineDefaults(config: TimelineConfig | undefined): TimelineConfig {
  return {
    orientation: config?.orientation ?? TIMELINE_CONFIG_SHAPE.orientation,
  };
}

/**
 * Maps the calendar events onto timeline entries, oldest first. An event without a date cannot be
 * placed on a chronology and is dropped; the event `url` doubles as the optional image source.
 */
export function toTimelineEntries(calevents: CalEventModel[] | undefined): TimelineEntry[] {
  return (calevents ?? [])
    .filter((e) => typeof e?.startDate === 'string' && e.startDate.trim().length > 0)
    .map((e) => ({
      okey: e.okey,
      title: e.name?.trim() ?? '',
      date: e.startDate.trim(),
      imageUrl: e.url?.trim() ?? '',
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
