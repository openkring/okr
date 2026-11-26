#!/usr/bin/env node
/**
 * Guards spec 1.173 (article blocks): an article may hold `properties.blocks`, and then its old fields
 * (`content.htmlContent`, `properties.images`, …) are empty or a lossy fallback. Every reader of the text
 * of a section must therefore go through withClassicFields / articleCover / articleBlocksOf / isFreeArticle
 * of @okr/shared-models, or be listed in ALLOWLIST with its reason.
 *
 * Scans libs/** and apps/functions/src/** (.ts, no specs) for a section's text being read:
 *   content?.htmlContent · content.htmlContent · ['htmlContent'] · `.content as { …htmlContent… }`  (a cast that reads it)
 * A hit outside the allowlist fails unless the line, or one of the 6 lines above it, contains
 * `withClassicFields` or `// not an article`.
 *
 * Limits (it is a text search, not a type check):
 *   - it does not see `const { content } = section; content.htmlContent` (the second line is not matched
 *     by name `content`) nor `const { htmlContent } = section.content` unless written that way: the
 *     destructuring form `{ ... htmlContent ... } = ...content` IS matched, other aliases are not;
 *   - it only looks at the TEXT (htmlContent). Readers of `properties.images` / `contentI18n` alone are
 *     not found; the design §9.4 search for those is repeated by hand when a reader is added;
 *   - a cast or destructuring split over several lines is not matched;
 *   - the marker within 6 lines is trusted: it cannot tell that the wrapped value is the one read;
 *   - an allowlisted file is not looked at again — keep the entries few and name the reason.
 *
 * Usage: node scripts/check-article-readers.mjs   (from any directory; exit 1 on any finding — CI friendly)
 */
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));

/** [path prefix or exact file, reason] */
const ALLOWLIST = [
  ['libs/shared/models/src/lib/article-blocks.util.ts', 'the shared module itself'],
  ['libs/shared/models/src/lib/section.shapes.ts', 'builds new sections with an empty text'],
  ['libs/cms/website/render/src/lib/section-mapper.ts', 'mapSection starts with withClassicFields; the nested accordion item does too'],
  ['libs/cms/section/ui/src/lib/editor-configuration.ts', 'the editor of one text field of the section being edited'],
  ['libs/cms/section/feature/src/lib/article-section.ts', 'draws the section = withClassicFields(rawSection)'],
  ['libs/cms/section/feature/src/lib/button-section.ts', 'other section type (button)'],
  ['libs/cms/section/feature/src/lib/chart-section.ts', 'other section type (chart)'],
  ['libs/cms/section/feature/src/lib/sankey-section.ts', 'other section type (sankey)'],
  ['libs/cms/section/feature/src/lib/spider-section.ts', 'other section type (spider)'],
  ['libs/cms/section/feature/src/lib/toc-section.ts', 'other section type (toc)'],
  ['libs/cms/section/feature/src/lib/testimonial-section.ts', 'other section type (testimonial)'],
  ['libs/chat/feature/src/lib/chat-maintenance.store.ts', 'creates new sections, reads none'],
  ['libs/subject/group/feature/src/lib/group.store.ts', 'creates new sections, reads none'],
  ['libs/travel/journal/', 'journal articles have no blocks'],
  ['apps/functions/src/journal/', 'journal articles have no blocks'],
];

const READ = [
  /content\??\.htmlContent\b/,
  /\[\s*['"]htmlContent['"]\s*\]/,
  /\.content\s+as\s+\{[^}]*\bhtmlContent\b/,
  /\{[^}]*\bhtmlContent\b[^}]*\}\s*=\s*[\w.?]*content\b/,
];
const MARKER = /withClassicFields|\/\/ not an article/;
const WINDOW = 6; // the two reads in publicApi/routes/news.ts are 5 lines below their withClassicFields
const HINT = 'wrap the section in withClassicFields(section) first (@okr/shared-models), or add `// not an article` / an allowlist entry with a reason';

const files = execSync(
  "find libs apps/functions/src -name '*.ts' -not -name '*.spec.ts' -not -name '*.d.ts' -not -path '*/node_modules/*'",
  { encoding: 'utf8' }).split('\n').filter(Boolean).sort();

const findings = [];
for (const path of files) {
  if (ALLOWLIST.some(([p]) => path === p || (p.endsWith('/') && path.startsWith(p)))) continue;
  const lines = readFileSync(path, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (!READ.some((re) => re.test(line))) return;
    if (lines.slice(Math.max(0, i - WINDOW), i + 1).some((l) => MARKER.test(l))) return;
    findings.push(`${path}:${i + 1}  reads an article's text without withClassicFields — ${HINT}`);
  });
}

if (findings.length) {
  console.error(findings.join('\n'));
  console.error(`\ncheck-article-readers: ${findings.length} finding(s)`);
  process.exit(1);
}
console.log(`check-article-readers: ok (${files.length} files)`);
