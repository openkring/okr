import { HeroConfig, ImageConfig, SectionModel } from '@okr/shared-models';
import { htmlToPlainText } from './journal-forms.util';
import { isJournalSectionType, JournalSectionType, sectionModelOf } from './journal-section.util';
import { baseLayerOptions, BaseLayerOption } from './journal-base-layer.util';
import { trackSummary } from './journal-track-pick.util';
import { TrackCopy, TrackCopyPhoto } from './journal-track.util';

/** A track photo with its signed urls (structurally `GuestTrackPhotoView` of the data-access lib). */
export interface GuestTrackPhotoInput extends TrackCopyPhoto { url: string; thumb: string }
/** The track of a track section as the callable returns it (structurally `GuestTrackView`): encoded sections, signed photos. */
export type GuestTrackInput = Pick<TrackCopy, 'name' | 'startedAt' | 'distanceM' | 'sections'> & { photos: GuestTrackPhotoInput[] };

/** A section as the `journalGuest` callable returns it (structurally `GuestSectionView` of the data-access lib). */
export interface GuestSectionInput {
  key: string;
  type: JournalSectionType;
  title: string;
  html: string;
  properties: Record<string, unknown>;
  photos: { key: string; url: string }[];
  videos: { key: string; poster: string; url: string }[];
  /** a track section's track (phase 5); absent when the track is not there and from an older server */
  track?: GuestTrackInput;
}

/** One clip of a video section: poster and mp4 are signed urls ('' = not uploaded yet). */
export interface GuestClip { key: string; poster: string; src?: string }

/** A guest section ready for `okr-journal-section`: the CMS model with display urls, its clips, and whether it leads. */
export interface GuestSectionItem {
  section: SectionModel; clips: GuestClip[]; lead: boolean; authorName: string;
  /** track sections only: the track the section shows */
  track?: GuestTrackInput;
}

/**
 * A guest section as a CMS `SectionModel` (spec 1.154 phase 2). The payload's image references name journal images in
 * `ImageConfig.label` with an empty url (by design); the display url comes from the signed `photos` of the same key.
 * An image without a signed photo is left out of a list (never a blank tile); a hero cover without one keeps ''.
 */
export function guestSectionModelOf(input: GuestSectionInput, tenantId: string): { section: SectionModel; clips: GuestClip[]; track?: GuestTrackInput } {
  const model = sectionModelOf({
    key: input.key, type: input.type, title: input.title, htmlContent: input.html, properties: input.properties,
    order: '', authorKey: '', hlcs: {}, conflict: false,
  }, tenantId);
  const urls = new Map(input.photos.map((p) => [p.key, p.url]));
  const withUrl = (image: ImageConfig): ImageConfig => ({ ...image, url: urls.get(image.label) ?? '' });
  const properties = { ...(model.properties as unknown as Record<string, unknown>) };
  if (Array.isArray(properties['images'])) {
    properties['images'] = (properties['images'] as ImageConfig[]).map(withUrl).filter((image) => image.url !== '');
  }
  const hero = properties['hero'] as ImageConfig | undefined;
  if (input.type === 'hero' && hero?.label) properties['hero'] = withUrl(hero);
  const videos = new Map(input.videos.map((v) => [v.key, v]));
  const clips = input.type === 'video' && Array.isArray(properties['clips'])
    ? (properties['clips'] as ImageConfig[]).map((c) => videos.get(c.label)).filter((v): v is GuestClip & { url: string } => v !== undefined)
      .map((v) => ({ key: v.key, poster: v.poster, src: v.url || undefined }))
    : [];
  // a map's properties pass unchanged (layer, zoom, showRoute); a track section shows the track of the payload, never urls from properties
  return { section: { ...model, properties } as SectionModel, clips, ...(input.type === 'track' && input.track ? { track: input.track } : {}) };
}

/** A track section as `okr-journal-section` takes it: the encoded sections, the summary line and the photos by their signed urls. */
export function guestTrackData(track: GuestTrackInput, fallbackName: string, altOf: (n: number) => string): {
  track: Pick<TrackCopy, 'sections'>; summary: string;
  photos: { imageKey: string; lat: number; lng: number; thumb: string; url: string; alt: string }[];
} {
  return {
    track: { sections: track.sections },
    summary: trackSummary(track, fallbackName),
    photos: track.photos.filter((p) => p.url !== '').map((p, i) => ({
      imageKey: p.imageKey, lat: p.lat, lng: p.lng, thumb: p.thumb || p.url, url: p.url, alt: altOf(i + 1),
    })),
  };
}

/** A hero shows only with a cover the guest can load; without one the page shows the footprint's plain title and facts. */
export function heroHasCover(section: SectionModel): boolean {
  return ((section.properties as unknown as Partial<HeroConfig>)?.hero?.url ?? '') !== '';
}

/**
 * Whether a guest section has anything to show: a hero its cover, an article text or a photo (or a title), an album
 * a photo, a video a clip, a map always (the footprint's position), a track its track data. Empty sections — the empty article every footprint starts with — are left out.
 */
function guestShows(section: SectionModel, clips: GuestClip[], track: GuestTrackInput | undefined): boolean {
  const images = (section.properties as unknown as { images?: unknown[] })?.images;
  switch (section.type) {
    case 'hero': return heroHasCover(section);
    case 'article':
      return (section.title ?? '').trim() !== '' || htmlToPlainText(section.content?.htmlContent ?? '') !== '' || (Array.isArray(images) && images.length > 0);
    case 'album': return Array.isArray(images) && images.length > 0;
    case 'video': return clips.length > 0;
    case 'map': return true; // it has the footprint's position
    case 'track': return (track?.sections.length ?? 0) > 0; // an older server, or a track that is gone: nothing to show
    default: return false;
  }
}

/**
 * The footprint's sections as the guest page lists them: the first hero leads (and carries the footprint's lines);
 * every other section, a further hero included, stays in the server's order below it. A first hero without a
 * loadable cover does not lead (the page shows the plain title and facts instead), empty sections are left out and so
 * are types this build cannot draw.
 */
export function guestSectionItems(
  sections: (GuestSectionInput & { authorName: string })[], tenantId: string,
): GuestSectionItem[] {
  const known = sections.filter((s) => isJournalSectionType(s.type));
  const firstHero = known.find((s) => s.type === 'hero');
  const items = known.map((s) => ({ ...guestSectionModelOf(s, tenantId), lead: s === firstHero, authorName: s.authorName }))
    .filter((item) => guestShows(item.section, item.clips, item.track));
  const lead = items.find((item) => item.lead);
  return [...(lead ? [lead] : []), ...items.filter((item) => item !== lead)];
}

const NO_AREAS = { google: {}, areas: [], usable: new Set<string>(), tilesBaseUrl: '' };

/** The public (online, non-Google) base layers around a view: the world map, plus swisstopo-live when the view meets Switzerland. */
export function guestBaseLayers(view: [number, number, number, number] | undefined): BaseLayerOption[] {
  return baseLayerOptions({ ...NO_AREAS, online: true, view });
}

/**
 * The layer a guest starts on: the section's own when offered, else swisstopo-live (the detailed map, offered only
 * in Switzerland), else the world map. `pickBaseLayer` would give the world map in Switzerland too (no Google here).
 */
export function guestBaseLayerId(options: BaseLayerOption[], preferred: string | undefined): BaseLayerOption['id'] {
  return (options.find((o) => o.id === preferred) ?? options.find((o) => o.id === 'swisstopo-live') ?? options.find((o) => o.id === 'world'))?.id ?? 'world';
}
