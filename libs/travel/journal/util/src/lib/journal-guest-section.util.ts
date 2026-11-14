import { ImageConfig, SectionModel } from '@okr/shared-models';
import { JournalSectionType, sectionModelOf } from './journal-section.util';

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

/**
 * The footprint's sections as the guest page lists them: the first hero leads (and carries the footprint's lines);
 * every other section, a further hero included, stays in the server's order below it. Types this build cannot draw
 * are left out.
 */
export function guestSectionItems(
  sections: (GuestSectionInput & { authorName: string })[], tenantId: string,
): GuestSectionItem[] {
  const known = sections.filter((s) => ['hero', 'article', 'album', 'video'].includes(s.type));
  const lead = known.find((s) => s.type === 'hero');
  return [...(lead ? [lead] : []), ...known.filter((s) => s !== lead)].map((s) => ({
    ...guestSectionModelOf(s, tenantId), lead: s === lead, authorName: s.authorName,
  }));
}
