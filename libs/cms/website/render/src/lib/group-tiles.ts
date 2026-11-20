import type { PageModel } from '@okr/shared-models';

import { tileImageSrc, type PublicTile } from './section-mapper';
import type { GroupPageLink } from './website-tree-read.util';

/** What the website may show of a group on its card (TilesConfig source 'groups'). */
export interface PublicGroup {
  key: string;
  name: string;
  subTitle: string;
  /** css hex colour of the card; '' = the default card */
  color: string;
  /** storage path of the group's avatar (its logo); '' = none */
  image: string;
}

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** A stored group colour that may go into a style attribute; '' for anything else. */
export function safeHexColor(value: unknown): string {
  return typeof value === 'string' && HEX.test(value.trim()) ? value.trim() : '';
}

/**
 * One image tile per public group, in the order of the website tree — the admin orders the cards by ordering
 * the group pages in the menu. A group counts only when its content page (`<key>_content`) is in the tree and
 * public (`isPrivate === false`), so a card never links to a page the website does not have. The logo is shown
 * whole (`contain`), the card links to the group page.
 */
export function groupTileItems(
  links: GroupPageLink[], groups: ReadonlyMap<string, PublicGroup> | undefined, pages: ReadonlyMap<string, PageModel>,
): PublicTile[] {
  if (!groups) return [];
  const out: PublicTile[] = [];
  for (const link of links) {
    const group = groups.get(link.key);
    const page = pages.get(`${link.key}_content`);
    if (!group || !page || page.isPrivate !== false || !link.slug) continue;
    out.push({
      value: '', icon: '', iconSrc: '', text: group.subTitle.trim(), linkLabel: '',
      title: (group.name || link.label).trim(),
      url: `/${link.slug}`,
      tone: 'primary',
      imageSrc: tileImageSrc(group.image, 'contain'),
      imageFit: 'contain',
      color: safeHexColor(group.color),
    });
  }
  return out;
}
