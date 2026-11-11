/**
 * The home layout (manifest `homeLayout`, design 1.151 §6.3): how the home page's sections fall into
 * rows. Mirrors `layoutPlan` of the scs website's assets/home.js, which renders the same page in the
 * browser.
 *
 *   hero    every hero section is a row of its own; it takes no slot in the background rhythm
 *   pair    an article without images followed directly by `tiles` of variant `stat`: one
 *           two-column row (text left, figures right), drawn by the layout page template
 *   single  any other section
 *
 * The tint (every second drawn non-hero row) is decided while rendering (render-site.ts), because a
 * section whose template renders nothing does not take a slot.
 */
export type HomeRowKind = 'hero' | 'pair' | 'single';

export interface HomeRowPlan {
  kind: HomeRowKind;
  /** the row's anchor id: the first section's `name`; a pair falls back to the tiles' name */
  name: string;
  /** one section, two for a pair (article, tiles) */
  sections: Record<string, unknown>[];
}

const nameOf = (s: Record<string, unknown> | undefined): string => (typeof s?.['name'] === 'string' ? s['name'] : '');

function isTextArticle(s: Record<string, unknown>): boolean {
  const images = s['images'];
  return s['type'] === 'article' && (!Array.isArray(images) || images.length === 0);
}

const isStatTiles = (s: Record<string, unknown> | undefined): boolean => !!s && s['type'] === 'tiles' && s['variant'] === 'stat';

export function homeRowPlan(sections: Record<string, unknown>[]): HomeRowPlan[] {
  const rows: HomeRowPlan[] = [];
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    if (s['type'] === 'hero') {
      rows.push({ kind: 'hero', name: nameOf(s), sections: [s] });
    } else if (isTextArticle(s) && isStatTiles(sections[i + 1])) {
      const tiles = sections[i + 1];
      rows.push({ kind: 'pair', name: nameOf(s) || nameOf(tiles), sections: [s, tiles] });
      i++;
    } else {
      rows.push({ kind: 'single', name: nameOf(s), sections: [s] });
    }
  }
  return rows;
}

/** A row as the homeLayout page template gets it (`rows`). */
export interface HomeRow extends HomeRowPlan {
  /** the row has the light background (every second drawn row that is not a hero) */
  tinted: boolean;
  /** `html` comes from `sections/home/<type>.hbs`; false: the generic template, or a pair */
  variant: boolean;
  /** the section's rendered template ('' for a pair: the page template draws it from `sections`) */
  html: string;
}
