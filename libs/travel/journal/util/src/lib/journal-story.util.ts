import {
  ALBUM_SECTION_SHAPE, AlbumSection, ARTICLE_SECTION_SHAPE, ArticleSection, HERO_SECTION_SHAPE, HeroSection,
  IMAGE_CONFIG_SHAPE, ImageConfig,
} from '@okr/shared-models';
import { convertDateFormatToString, DateFormat } from '@okr/shared-util-core';
import { BlockView, FootprintView, ImageView, weatherLine } from './journal-view.util';

/**
 * A footprint as CMS section objects (spec 1.113 §9.2, §9.3): a hero as cover, then one article per
 * text block and one collage album per photo block. The objects are fed straight into the standalone
 * section components — they are never stored in Firestore.
 */
export interface StoryBlock { block: BlockView; section: ArticleSection | AlbumSection; images?: ImageConfig[] }
export interface Story { hero: HeroSection | undefined; blocks: StoryBlock[] }

function coordinate(value: number, positive: string, negative: string): string {
  const abs = Math.abs(value);
  let degrees = Math.floor(abs);
  let minutes = Math.round((abs - degrees) * 60);
  if (minutes === 60) { degrees += 1; minutes = 0; }
  return `${degrees}°${minutes}′${value < 0 ? negative : positive}`;
}

/** Short facts for the hero: date (dd.MM.yyyy), time, coordinates in degrees and minutes, weather. */
export function footprintChips(footprint: FootprintView): string[] {
  const chips: string[] = [];
  if (footprint.date) chips.push(convertDateFormatToString(footprint.date, DateFormat.StoreDate, DateFormat.ViewDate, false));
  if (footprint.time) chips.push(footprint.time);
  if (footprint.latitude !== undefined && footprint.longitude !== undefined) {
    chips.push(`${coordinate(footprint.latitude, 'N', 'S')} ${coordinate(footprint.longitude, 'E', 'W')}`);
  }
  chips.push(weatherLine(footprint.weather));
  return chips.filter((c) => c !== '');
}

function imageConfig(image: ImageView, url: string): ImageConfig {
  return { ...IMAGE_CONFIG_SHAPE, label: image.key, url, altText: '' };
}

export function toStorySections(
  footprint: FootprintView, images: Map<string, ImageView>, fileUrl: (relativePath: string) => string, tenantId: string,
): Story {
  const common = { tenants: [tenantId], journalKey: footprint.journalKey };
  const blocks: StoryBlock[] = footprint.blocks.map((block) => {
    if (block.kind === 'text') {
      const section: ArticleSection = {
        ...ARTICLE_SECTION_SHAPE, ...common, okey: block.key, name: block.key, title: '', subTitle: '',
        authorKey: block.authorKey, order: block.order,
        content: { ...ARTICLE_SECTION_SHAPE.content, htmlContent: block.html ?? '' },
        properties: { ...ARTICLE_SECTION_SHAPE.properties, images: [] },
      };
      return { block, section };
    }
    const present = (block.imageKeys ?? []).map((k) => images.get(k)).filter((i): i is ImageView => i !== undefined);
    const section: AlbumSection = {
      ...ALBUM_SECTION_SHAPE, ...common, okey: block.key, name: block.key, title: '', subTitle: '',
      authorKey: block.authorKey, order: block.order,
      properties: { ...ALBUM_SECTION_SHAPE.properties, albumStyle: 'collage' },
    };
    return { block, section, images: present.map((i) => imageConfig(i, fileUrl(i.path2048))) };
  });

  const cover = blocks.find((b) => b.section.type === 'album' && (b.images?.length ?? 0) > 0)?.images?.[0];
  const hero: HeroSection | undefined = cover
    ? {
        ...HERO_SECTION_SHAPE, ...common, okey: `hero-${footprint.key}`, name: `hero-${footprint.key}`,
        title: footprint.title, subTitle: footprint.placeName,
        properties: { ...HERO_SECTION_SHAPE.properties, hero: cover, logo: { ...IMAGE_CONFIG_SHAPE }, chips: footprintChips(footprint) },
      }
    : undefined;
  return { hero, blocks };
}
