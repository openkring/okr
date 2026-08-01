import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NON_PERSONAL_COLLECTIONS } from './allowlist';

/**
 * The allowlist exists twice on purpose — as a runtime constant here, and as a reasoned
 * `// not personal data:` comment block in `subject-data-map.ts`. This test is what keeps
 * the copies honest: without it, a collection exempted in one place and not the other
 * would either be silently skipped by check 11 or reported forever.
 */
describe('NON_PERSONAL_COLLECTIONS', () => {
  const source = readFileSync(join(__dirname, '..', 'subject-data-map.ts'), 'utf8');
  const documented = new Set(
    [...source.matchAll(/^\/\/ not personal data: ([A-Za-z0-9_-]+)/gm)].map((m) => m[1]),
  );

  it('finds the comment block at all (the regex still matches the file)', () => {
    expect(documented.size).toBeGreaterThan(10);
  });

  it('exempts exactly the collections the subject-data map documents as non-personal', () => {
    expect([...NON_PERSONAL_COLLECTIONS].sort()).toEqual([...documented].sort());
  });
});
