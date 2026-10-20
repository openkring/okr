import { describe, expect, it } from 'vitest';

import { RoleName } from '@okr/shared-models';
import { OPERATOR_TENANT_ID } from '@okr/shared-util-core';

import { AOC_AREA_IDS, AOC_AREAS, AOC_AREA_ROUTES, AocArea, isOperationVisible, visibleAocCards } from './aoc-areas';

const ctx = (tenantId: string, over: { enabled?: string[]; roles?: RoleName[] } = {}) => ({
  tenantId,
  isEnabled: (b: string) => (over.enabled ? over.enabled.includes(b) : true),
  hasRole: (r: RoleName) => (over.roles ? over.roles.includes(r) : true),
});
const ids = (area: AocArea, c: ReturnType<typeof ctx>) => visibleAocCards(AOC_AREAS, area, c).map(x => x.id);

/** Every route target, verified against feature-catalogue.ts / the app routes (2026-10-20). */
const EXPECTED_ROUTES: Record<string, string> = {
  users: '/user/all/c-users',
  sessions: '/aoc/sessions',
  register: '/security/register',
  privacyAudit: '/security/privacy-audit',
  allocation: '/operator/allocation',
  activity: '/activity',
  emailEvents: '/aoc/email',
  chatMaintenance: '/operator/chat',
  escalations: '/ticket/all',
  features: '/tenant/features',
  workflow: '/workflow/all/workflow-context',
};
const EXPECTED_OPERATIONS: Record<string, string> = {
  iban: 'iban',
  validate: 'validate',
  reindex: 'reindex',
  accountTenants: 'migrate-account-tenants',
  matrixTenants: 'migrate-matrix-tenants',
};

describe('AOC_AREAS', () => {
  it('has unique ids', () => {
    const all = AOC_AREAS.map(c => c.id);
    expect(new Set(all).size).toBe(all.length);
  });

  it('pins every route target', () => {
    const routes = Object.fromEntries(AOC_AREAS.filter(c => 'route' in c.target).map(c => [c.id, (c.target as { route: string }).route]));
    expect(routes).toEqual(EXPECTED_ROUTES);
    for (const r of Object.values(routes)) expect(r.startsWith('/')).toBe(true);
  });

  it('pins every operation target', () => {
    const ops = Object.fromEntries(AOC_AREAS.filter(c => 'operation' in c.target).map(c => [c.id, (c.target as { operation: string }).operation]));
    expect(ops).toEqual(EXPECTED_OPERATIONS);
  });

  it('requires admin and has an i18n label and effect on every card', () => {
    for (const c of AOC_AREAS) {
      expect(c.roleNeeded).toBe('admin');
      expect(c.labelKey).toContain('hub.card.' + c.id + '.label');
      expect(c.effectKey).toContain('hub.card.' + c.id + '.effect');
    }
  });

  it('groups exactly the two migrations, operator only', () => {
    const m = AOC_AREAS.filter(c => c.group === 'migrations');
    expect(m.map(c => c.id)).toEqual(['accountTenants', 'matrixTenants']);
    for (const c of m) {
      expect(c.kind).toBe('migration');
      expect(c.tenants).toEqual([OPERATOR_TENANT_ID]);
    }
  });

  it('exposes the four hub routes', () => {
    expect(AOC_AREA_ROUTES).toEqual({ access: '/aoc/access', ops: '/aoc/ops', config: '/aoc/config', data: '/aoc/data' });
  });
});

describe('visibleAocCards', () => {
  it('hides operator cards for scs and shows them for bka', () => {
    expect(ids('ops', ctx('scs'))).not.toContain('emailEvents');
    expect(ids('ops', ctx('scs'))).not.toContain('chatMaintenance');
    expect(ids('access', ctx('scs'))).not.toContain('allocation');
    expect(ids('ops', ctx('bka'))).toEqual(['activity', 'emailEvents', 'chatMaintenance']);
    expect(ids('access', ctx('bka'))).toEqual(['users', 'sessions', 'register', 'privacyAudit', 'iban', 'allocation']);
    expect(ids('data', ctx('scs'))).toEqual(['validate', 'reindex']);
    expect(ids('data', ctx('bka'))).toEqual(['validate', 'reindex', 'accountTenants', 'matrixTenants']);
  });

  it('shows Eskalationen only for kring and only with the business block', () => {
    expect(ids('ops', ctx('scs'))).not.toContain('escalations');
    expect(ids('ops', ctx('bka'))).not.toContain('escalations');
    expect(ids('ops', ctx('kring'))).toContain('escalations');
    expect(ids('ops', ctx('kring', { enabled: ['aoc'] }))).not.toContain('escalations');
  });

  it('leaves exactly Eskalationen and Features on kring', () => {
    expect(ids('access', ctx('kring'))).toEqual([]);
    expect(ids('ops', ctx('kring'))).toEqual(['escalations']);
    expect(ids('config', ctx('kring'))).toEqual(['features']);
    expect(ids('data', ctx('kring'))).toEqual([]);
  });

  it('filters by role', () => {
    expect(ids('access', ctx('scs', { roles: ['registered'] }))).toEqual([]);
    expect(ids('access', ctx('scs', { roles: ['admin'] }))).toContain('users');
  });

  it('filters by feature block', () => {
    expect(ids('access', ctx('scs', { enabled: ['user'] }))).toEqual(['users']);
  });
});

describe('isOperationVisible', () => {
  it('allows an operation only when its card is visible in some area', () => {
    expect(isOperationVisible(AOC_AREAS, 'validate', ctx('scs'))).toBe(true);
    expect(isOperationVisible(AOC_AREAS, 'iban', ctx('scs'))).toBe(true);
    expect(isOperationVisible(AOC_AREAS, 'migrate-account-tenants', ctx('scs'))).toBe(false);
    expect(isOperationVisible(AOC_AREAS, 'migrate-account-tenants', ctx('bka'))).toBe(true);
    expect(isOperationVisible(AOC_AREAS, 'iban', ctx('kring'))).toBe(false);
    expect(isOperationVisible(AOC_AREAS, 'validate', ctx('scs', { roles: ['registered'] }))).toBe(false);
    expect(isOperationVisible(AOC_AREAS, 'reindex', ctx('scs', { enabled: ['user'] }))).toBe(false);
    expect(isOperationVisible(AOC_AREAS, 'unknown', ctx('bka'))).toBe(false);
  });

  it('lists the four areas in hub order', () => {
    expect(AOC_AREA_IDS).toEqual(['access', 'ops', 'config', 'data']);
  });
});
