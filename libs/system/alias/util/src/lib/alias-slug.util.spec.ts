import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { AliasSpaceModel } from '@okr/shared-models';
import { isValidAliasFormat } from './alias-key.util';
import { toAliasSlug } from './alias-slug.util';

/** A lookup space as Task 3 seeds it — the format rule the slug has to satisfy. */
function lookupSpace(): AliasSpaceModel {
  const space = new AliasSpaceModel('bka');
  space.name = 'person';
  space.kind = 'lookup';
  space.caseSensitive = false;
  space.allowCustom = true;
  return space;
}

describe('toAliasSlug', () => {
  it('folds German umlauts to their two-letter form rather than dropping them', () => {
    // 'staefa' and 'stfa' are both ASCII; only one of them is still the word.
    expect(toAliasSlug('Stäfa')).toBe('staefa');
    expect(toAliasSlug('Chrüzli')).toBe('chruezli');
    expect(toAliasSlug('Öhningen')).toBe('oehningen');
    expect(toAliasSlug('Grüezi Bär')).toBe('grueezi-baer');
  });

  it('strips accents that are not umlauts', () => {
    expect(toAliasSlug('Zürich Café')).toBe('zuerich-cafe');
    expect(toAliasSlug('Genève')).toBe('geneve');
  });

  it('replaces every forbidden character with a single hyphen', () => {
    expect(toAliasSlug('Muster-Beispiel')).toBe('muster-beispiel');
    expect(toAliasSlug('Bootshaus / Steg')).toBe('bootshaus-steg');
    expect(toAliasSlug('foo_bar')).toBe('foo-bar');
    expect(toAliasSlug('a  b   c')).toBe('a-b-c');
    expect(toAliasSlug('  --Rand--  ')).toBe('rand');
  });

  // Fixtures are INVENTED. libs/ is the public half of this repo (openkring/okr); a real
  // person's name in a test here is published, which is a stricter bar than the corpus rule.
  // Place names stay real: public geography is what makes the umlaut cases honest.
  it('lowercases, because lookup spaces are case-insensitive', () => {
    expect(toAliasSlug('TESTNAME')).toBe('testname');
  });

  it('returns the empty string when nothing survives', () => {
    // The caller must treat '' as "no alias", never write it as a document id.
    expect(toAliasSlug('---')).toBe('');
    expect(toAliasSlug('   ')).toBe('');
    expect(toAliasSlug('')).toBe('');
  });

  it('produces something isValidAliasFormat accepts', () => {
    const space = lookupSpace();
    for (const label of ['Stäfa', 'Muster-Beispiel', 'Bootshaus / Steg', 'Zürich Café']) {
      expect(isValidAliasFormat(toAliasSlug(label), space)).toBe(true);
    }
  });

  it('is idempotent — slugging a slug changes nothing', () => {
    // Task 5 re-runs against already-slugged decisions; a non-idempotent slug would
    // silently mint a second alias for the same person on every run.
    for (const label of ['Stäfa', 'Muster-Beispiel', 'a  b']) {
      expect(toAliasSlug(toAliasSlug(label))).toBe(toAliasSlug(label));
    }
  });
});

const ARCHIVE = process.env['DIARY_ARCHIVE'] ?? '';

function markdownFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return markdownFiles(full);
    return full.endsWith('.md') ? [full] : [];
  });
}

/**
 * Frontmatter in this archive uses BOTH list shapes — `people: [a, b]` inline and
 * `tags:` + `  - a` block. Measured 2026-08-23: parsing only the block form yields 0 people
 * across all 2405 files, which is why the size guards in the test below exist.
 */
function frontmatterList(front: string, key: string): string[] {
  const inline = new RegExp(`^${key}:\\s*\\[(.*)\\]\\s*$`, 'm').exec(front)?.[1];
  if (inline !== undefined) {
    return inline.split(',').map((v) => v.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
  }
  const block = new RegExp(`^${key}:\\s*\\n((?:[ \\t]*-[ \\t].*\\n?)*)`, 'm').exec(front)?.[1] ?? '';
  return block.split('\n')
    .map((line) => /^[ \t]*-[ \t]+(.*)$/.exec(line)?.[1]?.trim().replace(/^["']|["']$/g, '') ?? '')
    .filter(Boolean);
}

/** Every `people` entry and every `location` scalar of the real archive. */
function corpusLabels(): { people: Set<string>; locations: Set<string> } {
  const people = new Set<string>();
  const locations = new Set<string>();
  for (const file of markdownFiles(ARCHIVE)) {
    const front = /^---\n([\s\S]*?)\n---/.exec(readFileSync(file, 'utf8'))?.[1];
    if (!front) continue;
    const location = /^location:\s*(.+)$/m.exec(front)?.[1]?.trim().replace(/^["']|["']$/g, '');
    if (location) locations.add(location);
    for (const value of frontmatterList(front, 'people')) people.add(value);
  }
  return { people, locations };
}

describe.skipIf(ARCHIVE === '')('toAliasSlug against the real archive', () => {
  it('turns every corpus label into a valid alias', () => {
    const space = lookupSpace();
    const { people, locations } = corpusLabels();
    // Guard against a wrong DIARY_ARCHIVE quietly passing an empty check.
    expect(people.size).toBeGreaterThan(400);
    expect(locations.size).toBeGreaterThan(100);
    for (const label of [...people, ...locations]) {
      const slug = toAliasSlug(label);
      expect(slug, `label ${JSON.stringify(label)} slugged to ''`).not.toBe('');
      expect(isValidAliasFormat(slug, space), `label ${JSON.stringify(label)} → ${slug}`).toBe(true);
    }
  });

  it('has exactly the collisions we already know about', () => {
    // Two distinct labels can slug to the same alias, and here that is usually CORRECT: the
    // archive spells one person both ways — an umlaut in one entry, its transcription in
    // another, or the same spelling with different capitalisation. Merging those into one alias
    // is the feature, not a defect. (No example is given: every real pair is a real name.)
    //
    // What must never happen is a SILENT merge of two different people. So the count is frozen:
    // a new collision, or a known one disappearing, fails this test and sends a human to the
    // decisions file, where every original behind a slug is listed side by side.
    //
    // Counts, not slugs, are asserted — a slug is derived from a real name and must not enter
    // the repository. Measured 2026-08-23 against 476 person and 115 location labels.
    const KNOWN_COLLISIONS = { people: 6, locations: 0 };

    const collidingSlugs = (labels: Set<string>): number => {
      const bySlug = new Map<string, string[]>();
      for (const label of labels) {
        const slug = toAliasSlug(label);
        bySlug.set(slug, [...(bySlug.get(slug) ?? []), label]);
      }
      return [...bySlug.values()].filter((group) => group.length > 1).length;
    };

    const { people, locations } = corpusLabels();
    expect(collidingSlugs(people)).toBe(KNOWN_COLLISIONS.people);
    expect(collidingSlugs(locations)).toBe(KNOWN_COLLISIONS.locations);
  });
});
