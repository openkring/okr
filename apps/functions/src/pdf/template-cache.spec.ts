import { describe, expect, it } from 'vitest';

import { compileTemplate } from './template-cache';

describe('compileTemplate', () => {
  it('recompiles a draft edited under the same version number', async () => {
    const before = await compileTemplate('tmpl@2', '<img src="old.svg">{{name}}');
    const after = await compileTemplate('tmpl@2', '<img src="new.png">{{name}}');
    expect(before({ name: 'A' })).toBe('<img src="old.svg">A');
    expect(after({ name: 'A' })).toBe('<img src="new.png">A');
  });

  it('reuses the compile for unchanged content', async () => {
    const first = await compileTemplate('tmpl@3', '<p>{{x}}</p>', 'p{}');
    const second = await compileTemplate('tmpl@3', '<p>{{x}}</p>', 'p{}');
    expect(second).toBe(first);
  });

  it('recompiles when only the css changes', async () => {
    const a = await compileTemplate('tmpl@4', '<html><head></head></html>', 'p{color:red}');
    const b = await compileTemplate('tmpl@4', '<html><head></head></html>', 'p{color:blue}');
    expect(b({})).toContain('color:blue');
    expect(a).not.toBe(b);
  });
});
