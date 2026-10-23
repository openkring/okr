import type { DocumentModel } from '@okr/shared-models';

import { learningTabOf, parseTopics, type LearningTab } from './learning-classify';

export interface LearningFilter {
  tab: LearningTab;
  topic: string;
  query: string;
}

const ENTITIES: Record<string, string> = { '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };

/** Plain text of an HTML snippet. No DOM: runs in Cloud Functions too. */
export function stripHtml(html: string): string {
  return (html ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(?:lt|gt|quot|#39|nbsp);/g, m => ENTITIES[m])
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalize(s: string): string {
  return (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** The documents of one learning room: filed in its folder and not archived. */
export function roomDocs(docs: DocumentModel[], folderKey: string): DocumentModel[] {
  return docs.filter(d => !d.isArchived && (d.folderKeys ?? []).includes(folderKey));
}

export function filterLearningDocs(
  docs: DocumentModel[], f: LearningFilter, commentText: Record<string, string> = {},
): DocumentModel[] {
  const q = normalize(f.query.trim());
  return docs.filter(d => {
    if (d.isArchived) return false;
    if (learningTabOf(d.mimeType) !== f.tab) return false;
    if (f.topic && !parseTopics(d.tags).includes(f.topic)) return false;
    if (!q) return true;
    const hay = normalize([d.title, stripHtml(d.notes ?? ''), d.tags, commentText[d.okey] ?? ''].join('\n'));
    return hay.includes(q);
  });
}
