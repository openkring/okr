import { marked } from 'marked';

export interface DiaryHtml {
  html: string;
  /** how many images the text referenced — they stay in the Drive day folder (decision 6) */
  imageCount: number;
}

const IMG_TAG = /<img\b[^>]*>/gi;
const HTML_COMMENT = /<!--[\s\S]*?-->/g;

/**
 * The read view's HTML. Images are NOT rendered: their `src` is a file name relative to the
 * Drive day folder (decision 6 — media stay there, the app never uploads or loads them), and a
 * relative path on the app origin would only 404. They are counted instead, and the view links
 * the folder. The result is bound with [innerHTML] WITHOUT bypassing Angular's sanitizer, so
 * scripts and event handlers in the text can never run (same rule as rag-section.ts).
 */
export function renderDiaryHtml(text: string): DiaryHtml {
  if (!text) return { html: '', imageCount: 0 };
  const rendered = marked.parse(text.replace(HTML_COMMENT, ''), { async: false }) as string;
  const imageCount = (rendered.match(IMG_TAG) ?? []).length;
  return { html: rendered.replace(IMG_TAG, ''), imageCount };
}

/** The day folder in Drive — the only way the app shows an entry's photos. */
export function driveFolderUrl(driveFolderId: string): string {
  return driveFolderId ? `https://drive.google.com/drive/folders/${driveFolderId}` : '';
}
