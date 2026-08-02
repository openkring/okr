import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FEATURE_CATALOGUE } from './feature-catalogue';
import { NON_BLOCK_DOMAINS, PENDING_CLASSIFICATION } from './feature-catalogue.non-blocks';

/** Repo-root-relative path to libs/, from this spec file's directory. */
const LIBS_DIR = join(__dirname, '../../../../..', 'libs');

function featureDomains(): string[] {
  return readdirSync(LIBS_DIR, { withFileTypes: true })
    .filter(e => e.isDirectory() && e.name !== 'node_modules')
    .map(e => e.name)
    .filter(name => existsSync(join(LIBS_DIR, name, 'feature')));
}

describe('catalogue completeness', () => {
  it('every libs/*/feature domain is a block or an explicit non-block', () => {
    const known = new Set([
      ...FEATURE_CATALOGUE.map(b => b.id),
      ...Object.keys(NON_BLOCK_DOMAINS),
      ...PENDING_CLASSIFICATION,
    ]);
    const unclassified = featureDomains().filter(d => !known.has(d));
    expect(unclassified).toEqual([]);
  });

  it('block ids are unique', () => {
    const ids = FEATURE_CATALOGUE.map(b => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every dependsOn target exists in the catalogue', () => {
    const ids = new Set(FEATURE_CATALOGUE.map(b => b.id));
    const dangling = FEATURE_CATALOGUE
      .flatMap(b => b.dependsOn.map(d => ({ block: b.id, dep: d })))
      .filter(({ dep }) => !ids.has(dep));
    expect(dangling).toEqual([]);
  });

  it('every menu key is unique across the whole catalogue', () => {
    const keys: string[] = [];
    const visit = (s: { key: string; children?: { key: string }[] }): void => {
      keys.push(s.key);
      (s.children ?? []).forEach(c => visit(c as never));
    };
    FEATURE_CATALOGUE.forEach(b => b.menu.forEach(visit));
    expect(new Set(keys).size).toBe(keys.length);
  });
});
