import { HeroConfig, ImageConfig, SectionModel } from '@okr/shared-models';
import { htmlToPlainText } from './journal-forms.util';
import { isJournalSectionType, JournalSectionType, sectionModelOf } from './journal-section.util';

/** A section as the `journalGuest` callable returns it (structurally `GuestSectionView` of the data-access lib). */
export interface GuestSectionInput {
  key: string;
  type: JournalSectionType;
  title: string;
  html: string;
  properties: Record<string, unknown>;
  photos: { key: string; url: string }[];
  videos: { key: string; poster: string; url: string }[];
}

/** One clip of a video section: poster and mp4 are signed urls ('' = not uploaded yet). */
export interface GuestClip { key: string; poster: string; src?: string }

/** A guest section ready for `okr-journal-section`: the CMS model with display urls, its clips, and whether it leads. */
export interface GuestSectionItem { section: SectionModel; clips: GuestClip[]; lead: boolean; authorName: string }

/**
 * A guest section as a CMS `SectionModel` (spec 1.154 phase 2). The payload's image references name journal images in
 * `ImageConfig.label` with an empty url (by design); the display url comes from the signed `photos` of the same key.
 * An image without a signed photo is left out of a list (never a blank tile); a hero cover without one keeps ''.
 */
export function guestSectionModelOf(input: GuestSectionInput, tenantId: string): { section: SectionModel; clips: GuestClip[] } {
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
  return { section: { ...model, properties } as SectionModel, clips };
}

/** A hero shows only with a cover the guest can load; without one the page shows the footprint's plain title and facts. */
export function heroHasCover(section: SectionModel): boolean {
  return ((section.properties as unknown as Partial<HeroConfig>)?.hero?.url ?? '') !== '';
}

/**
 * Whether a guest section has anything to show: a hero its cover, an article text or a photo (or a title), an album
 * a photo, a video a clip. Empty sections — the empty article every footprint starts with — are left out.
 */
function guestShows(section: SectionModel, clips: GuestClip[]): boolean {
  const images = (section.properties as unknown as { images?: unknown[] })?.images;
  switch (section.type) {
    case 'hero': return heroHasCover(section);
    case 'article':
      return (section.title ?? '').trim() !== '' || htmlToPlainText(section.content?.htmlContent ?? '') !== '' || (Array.isArray(images) && images.length > 0);
    case 'album': return Array.isArray(images) && images.length > 0;
    case 'video': return clips.length > 0;
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
    .filter((item) => guestShows(item.section, item.clips));
  const lead = items.find((item) => item.lead);
  return [...(lead ? [lead] : []), ...items.filter((item) => item !== lead)];
}
