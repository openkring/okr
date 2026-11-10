import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const FORBIDDEN = /from\s+['"](@angular\/|vest|rxjs)|import\s+['"](@angular\/|vest|rxjs)|require\(\s*['"](@angular\/|vest|rxjs)|import\(\s*['"](@angular\/|vest|rxjs)/;
const FORBIDDEN_BARRELS = /from\s+['"]@okr\/shared-util-(core|angular)['"]|import\(\s*['"]@okr\/shared-util-(core|angular)['"]/;
const FORBIDDEN_LAYERS = /from\s+['"]@okr\/[a-z0-9-]*-(feature|ui)['"]/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sourceFiles(p);
    return p.endsWith('.ts') && !p.endsWith('.spec.ts') ? [p] : [];
  });
}

describe('cms-website-render stays Node-safe', () => {
  const root = join(__dirname, '..');
  const files = sourceFiles(root);

  it('finds the lib sources', () => {
    expect(files.length).toBeGreaterThan(1);
  });

  it.each(files.map((f) => [f.slice(root.length + 1), f]))('%s imports no @angular/*, vest, rxjs or util barrels', (_n, f) => {
    const src = readFileSync(f, 'utf8');
    expect(src).not.toMatch(FORBIDDEN);
    expect(src).not.toMatch(FORBIDDEN_LAYERS);
    expect(src).not.toMatch(FORBIDDEN_BARRELS);
  });
});
