import { describe, expect, it, vi } from 'vitest';

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

  it('keeps noEscape apart in the cache', async () => {
    const escaped = await compileTemplate('k', '{{v}}');
    const raw = await compileTemplate('k', '{{v}}', undefined, { noEscape: true });
    expect(escaped({ v: 'a=b&c' })).not.toBe('a=b&c');
    expect(raw({ v: 'a=b&c' })).toBe('a=b&c');
  });

  it('disables the log helper only when asked, and keeps that apart in the cache', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const quiet = await compileTemplate('l', '{{log v}}x', undefined, { noLog: true });
    expect(quiet({ v: 'secret' })).toBe('x');
    expect(info).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();

    const pdf = await compileTemplate('l', '{{log v}}x');
    expect(pdf({ v: 'secret' })).toBe('x');
    expect([...info.mock.calls, ...log.mock.calls].flat()).toContain('secret');
    info.mockRestore();
    log.mockRestore();
  });

  it('renders a tenant name with & literally when noEscape is set', async () => {
    const t = await compileTemplate('s', 'Hallo {{app_name}}', undefined, { noEscape: true });
    expect(t({ app_name: 'Verein & Co' })).toBe('Hallo Verein & Co');
  });
});
