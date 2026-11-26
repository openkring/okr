import { afterEach, describe, expect, it, vi } from 'vitest';
import { TENANT_THEME_TIMEOUT_MS } from './tenant-theme';
import { loadTenantTheme, tenantThemeHref } from './tenant-theme';

const links = () => Array.from(document.head.querySelectorAll('link#okr-tenant-theme')) as HTMLLinkElement[];

afterEach(() => {
  links().forEach((l) => l.remove());
  vi.restoreAllMocks();
});

describe('tenantThemeHref', () => {
  it('points at the tenant stylesheet', () =>
    expect(tenantThemeHref('scs')).toBe('assets/tenant-themes/scs.css'));

  it.each(['../x', '', 'SCS', 'scs/../p13'])('throws on %j', (id) =>
    expect(() => tenantThemeHref(id)).toThrow());
});

describe('loadTenantTheme', () => {
  it('appends one stylesheet link with the tenant href', () => {
    void loadTenantTheme(document, 'scs');
    expect(links()).toHaveLength(1);
    expect(links()[0].getAttribute('href')).toBe('assets/tenant-themes/scs.css');
    expect(links()[0].rel).toBe('stylesheet');
  });

  it('replaces an existing tenant link', () => {
    void loadTenantTheme(document, 'scs');
    void loadTenantTheme(document, 'p13');
    expect(links()).toHaveLength(1);
    expect(links()[0].getAttribute('href')).toBe('assets/tenant-themes/p13.css');
  });

  it('resolves true on load', async () => {
    const done = loadTenantTheme(document, 'scs');
    links()[0].dispatchEvent(new Event('load'));
    await expect(done).resolves.toBe(true);
  });

  it('loadTenantTheme resolves false on load error', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const done = loadTenantTheme(document, 'scs');
    links()[0].dispatchEvent(new Event('error'));
    await expect(done).resolves.toBe(false);
    expect(log).toHaveBeenCalledTimes(1);
  });

  it('loadTenantTheme resolves false after the timeout', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const done = loadTenantTheme(document, 'scs');
      vi.advanceTimersByTime(TENANT_THEME_TIMEOUT_MS);
      await expect(done).resolves.toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('resolves false for an invalid tenant without touching the document', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(loadTenantTheme(document, '../x')).resolves.toBe(false);
    expect(links()).toHaveLength(0);
  });
});
