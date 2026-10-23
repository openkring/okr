import type { DocumentModel } from '@okr/shared-models';

import { learningTabOf, parseTopics, type LearningTab } from './learning-classify';

export interface LearningFilter {
  tab: LearningTab;
  topic: string;
  query: string;
}

const ENTITIES: Record<string, string> = { '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };

function codePoint(n: number): string {
  try { return String.fromCodePoint(n); } catch { return ''; }
}

/** Plain text of an HTML snippet. No DOM: runs in Cloud Functions too. */
export function stripHtml(html: string): string {
  return (typeof html === 'string' ? html : '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(?:lt|gt|quot|#39|nbsp);/g, m => ENTITIES[m])
    .replace(/&#(\d+);/g, (_, n: string) => codePoint(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => codePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalize(s: unknown): string {
  return (typeof s === 'string' ? s : '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/** The documents of one learning room: filed FIRST in its folder (as the rules and the public API read it) and not archived. */
export function roomDocs(docs: DocumentModel[], folderKey: string): DocumentModel[] {
  return docs.filter(d => !d.isArchived && (d.folderKeys ?? [])[0] === folderKey);
}

export function filterLearningDocs(
  docs: DocumentModel[], f: LearningFilter, commentText: Record<string, string> = {},
): DocumentModel[] {
  const q = normalize(f.query).trim();
  return docs.filter(d => {
    if (d.isArchived) return false;
    if (learningTabOf(d.mimeType) !== f.tab) return false;
    if (f.topic && !parseTopics(d.tags).includes(f.topic)) return false;
    if (!q) return true;
    const hay = normalize([d.title, stripHtml(d.notes ?? ''), d.tags, commentText[d.okey] ?? ''].join('\n'));
    return hay.includes(q);
  });
}

const TAB_ORDER: LearningTab[] = ['files', 'videos', 'images'];

/** How many items each tab holds (unfiltered). */
export function learningTabCounts(tabs: readonly LearningTab[]): Record<LearningTab, number> {
  const out: Record<LearningTab, number> = { files: 0, videos: 0, images: 0 };
  for (const t of tabs) if (t in out) out[t]++;
  return out;
}

/**
 * The tab a room opens on: the configured start tab when it holds items, else the first
 * non-empty tab (files → videos → images), else the configured tab (or 'files') for an empty room.
 */
export function initialLearningTab(defaultTab: LearningTab | '' | undefined, counts: Record<LearningTab, number>): LearningTab {
  const configured = defaultTab && TAB_ORDER.includes(defaultTab) ? defaultTab : undefined;
  if (configured && counts[configured] > 0) return configured;
  return TAB_ORDER.find(t => counts[t] > 0) ?? configured ?? 'files';
}
