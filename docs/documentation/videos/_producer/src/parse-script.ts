import { readFileSync } from 'node:fs';

export interface ParsedScene {
  id: string;
  part: string;
  images: string[];
  action: string;
  narration: string;
  platformHint?: string;
  title?: string;
}

const IMG_RE = /([\w-]+\.png)/g;

function splitRow(line: string): string[] {
  const t = line.trim();
  const inner = t.startsWith('|') ? t.slice(1) : t;
  const body = inner.endsWith('|') ? inner.slice(0, -1) : inner;
  return body.split('|').map((c) => c.trim());
}

/** Strip markdown emphasis and German typographic quotes; collapse whitespace. */
function stripMarkup(s: string): string {
  return s
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/[„“”"]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isSeparator(cells: string[]): boolean {
  return cells.every((c) => c === '' || /^:?-{2,}:?$/.test(c));
}

/**
 * Parse the "## Storyboard & Sprechertext" section of a script.md into an
 * ordered list of scenes. Each "### " heading starts a new part; each pipe
 * table row under it is one scene. Columns are matched by header keyword, so
 * tables with or without the "Plattform-Hinweis" column both work.
 */
/** Derive a clean on-screen title from the document H1, dropping the
 * "Erklärvideo — " prefix and the trailing "(DESKTOP)"/"(MOBILE)" marker. */
function cleanDocTitle(h1: string): string {
  return h1
    .replace(/^#\s+/, '')
    .replace(/\s*\((?:DESKTOP|MOBILE)\)\s*$/i, '')
    .replace(/^Erklärvideo\s*[—–:-]\s*/i, '')
    .trim();
}

export function parseScript(path: string): ParsedScene[] {
  const lines = readFileSync(path, 'utf8').split('\n');

  const h1 = lines.find((l) => /^#\s+/.test(l));
  const docTitle = h1 ? cleanDocTitle(h1) : '';

  const startIdx = lines.findIndex((l) => /^##\s+Storyboard/i.test(l));
  if (startIdx === -1) {
    throw new Error(`No "## Storyboard" section found in ${path}`);
  }
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i])) {
      endIdx = i;
      break;
    }
  }
  const section = lines.slice(startIdx + 1, endIdx);

  const scenes: ParsedScene[] = [];
  let currentPart = 'Intro';
  let colMap: Record<string, number> | null = null;

  for (const line of section) {
    const h3 = line.match(/^###\s+(.*)$/);
    if (h3) {
      currentPart = h3[1].trim();
      colMap = null; // each part has its own table header
      continue;
    }
    if (!line.trim().startsWith('|')) continue;

    const cells = splitRow(line);
    if (isSeparator(cells)) continue;

    if (!colMap) {
      // header row
      colMap = {};
      cells.forEach((raw, idx) => {
        const h = raw.toLowerCase();
        if (h === '#') colMap!['id'] = idx;
        else if (h.includes('bild')) colMap!['image'] = idx;
        else if (h.includes('aktion')) colMap!['action'] = idx;
        else if (h.includes('sprechertext')) colMap!['narration'] = idx;
        else if (h.includes('plattform')) colMap!['platformHint'] = idx;
      });
      continue;
    }

    const at = (k: string): string => {
      const idx = colMap![k];
      return idx == null ? '' : cells[idx] ?? '';
    };

    const imageCell = at('image');
    const actionCell = at('action');
    const images = imageCell.match(IMG_RE) ?? [];
    const id = at('id') || String(scenes.length);

    let title: string | undefined;
    if (images.length === 0) {
      const quoted = actionCell.match(/„([^"“”]+)["“”]/);
      title = quoted ? quoted[1].trim() : docTitle || currentPart;
    }

    const hintRaw = stripMarkup(at('platformHint'));
    const platformHint = hintRaw && hintRaw !== '—' && hintRaw !== '-' ? hintRaw : undefined;

    scenes.push({
      id,
      part: currentPart,
      images,
      action: stripMarkup(actionCell),
      narration: stripMarkup(at('narration')),
      platformHint,
      title,
    });
  }

  return scenes;
}
