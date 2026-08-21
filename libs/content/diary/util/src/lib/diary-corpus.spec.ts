import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DIARY_FILE_NAME } from './diary-file';
import { parseDiaryMarkdown } from './diary-parse';
import { renderDiaryMarkdown } from './diary-render';

/**
 * Round-trips the real diary archive. The archive is personal data and never enters this
 * repository, so this suite only runs when DIARY_ARCHIVE points at it:
 *
 *   DIARY_ARCHIVE=/Users/bruno/gdrive/archive/202x pnpm nx test content-diary-util
 *
 * Without the variable — in CI, and for anyone but the archive's owner — it skips.
 */
const archive = process.env['DIARY_ARCHIVE'];

function collectDiaryFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      collectDiaryFiles(path, found);
    } else if (DIARY_FILE_NAME.test(entry)) {
      found.push(path);
    }
  }
  return found;
}

describe.skipIf(!archive)('diary corpus round trip', () => {
  it('reproduces every archived diary file byte for byte', () => {
    const files = collectDiaryFiles(archive as string);
    expect(files.length).toBeGreaterThan(0);

    const mismatches: { path: string; at: number; expected: string; actual: string }[] = [];
    for (const path of files) {
      const text = readFileSync(path, 'utf8');
      const rendered = renderDiaryMarkdown(parseDiaryMarkdown(text));
      if (rendered !== text) {
        let at = 0;
        while (at < text.length && text[at] === rendered[at]) {
          at++;
        }
        mismatches.push({
          path,
          at,
          expected: JSON.stringify(text.slice(at, at + 60)),
          actual: JSON.stringify(rendered.slice(at, at + 60)),
        });
      }
    }

    const report = mismatches
      .slice(0, 20)
      .map(m => `${m.path}\n  first difference at char ${m.at}\n  expected ${m.expected}\n  actual   ${m.actual}`)
      .join('\n\n');
    expect(mismatches, `${mismatches.length} of ${files.length} files did not round-trip:\n\n${report}`).toHaveLength(0);
  });
});
