import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FEATURE_CATALOGUE } from './feature-catalogue';
import { NON_BLOCK_DOMAINS, PENDING_CLASSIFICATION } from './feature-catalogue.non-blocks';

/** Repo-root-relative path to libs/, from this spec file's directory. */
const LIBS_DIR = join(__dirname, '../../../../..', 'libs');

/**
 * A top-level domain "has a feature lib" if `libs/<name>/feature` exists (flat domains
 * like `calevent`) OR `libs/<name>/<sub>/feature` exists for any subdomain (container
 * domains like `finance`, whose 13 subdomains each carry their own layer split). Per the
 * repo owner's ruling, one catalogue block covers a whole container domain — e.g. one
 * `finance` block for all finance subdomains — so completeness is judged, and each domain
 * returned, at the TOP level only (deduplicated), never per-subdomain. Depth is capped at
 * 2; no depth-3 `feature` directory exists today, and an unbounded walk would be slower
 * and risk false positives from `node_modules`/`dist`.
 */
function featureDomains(): string[] {
  const topLevel = readdirSync(LIBS_DIR, { withFileTypes: true })
    .filter(e => e.isDirectory() && e.name !== 'node_modules')
    .map(e => e.name);

  return topLevel.filter(name => {
    const domainDir = join(LIBS_DIR, name);
    if (existsSync(join(domainDir, 'feature'))) return true;
    return readdirSync(domainDir, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .some(e => existsSync(join(domainDir, e.name, 'feature')));
  });
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
