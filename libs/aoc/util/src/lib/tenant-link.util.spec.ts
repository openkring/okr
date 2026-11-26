import { describe, expect, it } from 'vitest';
import { resolveTenantLink } from './tenant-link.util';

describe('resolveTenantLink', () => {
  it('resolveTenantLink rejects a tenant without app-config', () =>
    expect(resolveTenantLink('sc5', 'runtime', undefined)).toEqual({ kind: 'chooser', note: 'unknown' }));

  it('switches in runtime mode', () =>
    expect(resolveTenantLink('scs', 'runtime', { appName: 'Seeclub' })).toEqual({ kind: 'switch', tenantId: 'scs' }));

  it("redirects to the tenant's own app in fixed mode", () =>
    expect(resolveTenantLink('scs', 'fixed', { appDomain: 'app.seeclub.org' })).toEqual({ kind: 'redirect', url: 'https://app.seeclub.org' }));

  it('redirects to the conventional hosting url without an app domain', () =>
    expect(resolveTenantLink('p13', 'fixed', {})).toEqual({ kind: 'redirect', url: 'https://p13-app-54aef.web.app' }));

  it('rejects an invalid id without reading', () =>
    expect(resolveTenantLink('../x', 'runtime', { appName: 'x' })).toEqual({ kind: 'chooser', note: 'unknown' }));

  it('goes home without a reload when the link names the tenant already running', () =>
    expect(resolveTenantLink('scs', 'runtime', { appName: 'Seeclub' }, 'scs')).toEqual({ kind: 'home' }));

  it('still switches to another tenant', () =>
    expect(resolveTenantLink('p13', 'runtime', { appName: 'P13' }, 'scs')).toEqual({ kind: 'switch', tenantId: 'p13' }));
});
