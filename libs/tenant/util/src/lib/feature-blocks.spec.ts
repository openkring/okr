import { describe, expect, it } from 'vitest';
import { FEATURE_BLOCKS } from './feature-blocks';
import type { MenuSpec } from './feature-catalogue.types';
import { blockOwnersOfMenuKey } from './feature-routes.util';
import { holdersOf } from './feature-deps.util';
import { effectiveFeatures } from './feature-rollout.util';

/**
 * `blockOfMenuKey` (`feature-routes.util.ts`) is fed a menu doc's `name` — the field
 * `MenuService.read` resolves by (`findByKey(this.list(), name, 'name')`,
 * `menu.service.ts`) — but it matches against every `MenuSpec.key` in the catalogue. That
 * only works if `key === name` on EVERY spec, always. Nothing in the type system pins this
 * (see `MenuSpec`'s doc comment in `feature-catalogue.types.ts`); a block author who writes
 * a spec where they differ — entirely legal per the type — silently breaks the feature-block
 * visibility filter (`MenuStore.menu` in `cms-menu-feature`): the item is misclassified as a
 * tenant-authored entry and always renders, even when its owning block is disabled for the
 * tenant. Nothing goes red anywhere else — this spec is the only thing that catches it.
 *
 * Deliberately asserts against the REAL `FEATURE_BLOCKS`, not a local fixture (contrast with
 * `blockOfMenuKey`'s own tests in `feature-routes.util.spec.ts`, which use a local catalogue
 * specifically to avoid churning as Tasks 12-18 add ~29 more blocks). This assertion is a
 * universal quantifier — "every spec, forever, key === name" — so it does NOT churn as blocks
 * are added; asserting it against the real catalogue is the whole point.
 */
describe('FEATURE_BLOCKS menu spec invariant', () => {
  it('every MenuSpec (recursively, including children) has key === name', () => {
    const mismatches: string[] = [];
    const visit = (blockId: string, spec: MenuSpec): void => {
      if (spec.key !== spec.name) {
        mismatches.push(`block '${blockId}': spec key '${spec.key}' !== name '${spec.name}'`);
      }
      (spec.children ?? []).forEach(child => visit(blockId, child));
    };
    FEATURE_BLOCKS.forEach(block => block.menu.forEach(spec => visit(block.id, spec)));
    expect(mismatches).toEqual([]);
  });
});

/**
 * Spec 1.101 phase 2: every domain's maintenance check sits at the END of that domain's context
 * menu, behind a divider whose `roleNeeded` matches the row. They no longer live under `aoc-menu`.
 */
describe('FEATURE_BLOCKS Wartung rows (1.101 phase 2)', () => {
  const findContext = (name: string) => {
    for (const block of FEATURE_BLOCKS) {
      const hit = block.menu.find(spec => spec.name === name);
      if (hit) return hit;
    }
    return undefined;
  };
  const cases: [string, string, string, string, string, string][] = [
    // context menu, divider, divider role, row, action, row role
    ['c-calevents', 'maint-divider', 'admin', 'calevent-check-duplicates', 'call', 'admin'],
    ['c-pages', 'maint-divider-content', 'contentAdmin', 'page-integrity', 'navigate', 'contentAdmin'],
    ['c-documents', 'maint-divider', 'admin', 'document-orphans', 'navigate', 'admin'],
    ['c-trips', 'maint-divider', 'admin', 'trip-kiosk', 'navigate', 'admin'],
    ['c-diary', 'maint-divider', 'admin', 'diary-import', 'navigate', 'admin'],
  ];

  it.each(cases)('%s ends with %s then %s', (ctx, divider, dividerRole, row, action, rowRole) => {
    const children = findContext(ctx)?.children ?? [];
    const tail = children.slice(-2);
    expect(tail.map(c => c.name)).toEqual([divider, row]);
    expect(tail[0]).toMatchObject({ action: 'divider', url: '', roleNeeded: dividerRole });
    expect(tail[1]).toMatchObject({ action, roleNeeded: rowRole });
  });

  it('c-persons ends with the divider, the favourite-address check and the Bexio contacts page, all admin', () => {
    const tail = (findContext('c-persons')?.children ?? []).slice(-3);
    expect(tail.map(c => c.name)).toEqual(['maint-divider', 'person-check-favaddress', 'person-bexio-contacts']);
    expect(tail[0]).toMatchObject({ action: 'divider', url: '', roleNeeded: 'admin' });
    expect(tail.slice(1).map(c => [c.url, c.action, c.roleNeeded])).toEqual([
      ['checkFavAddresses', 'call', 'admin'],
      ['/person/bexio-contacts', 'navigate', 'admin'],
    ]);
  });

  it('c-trips holds the tripAdmin maintenance row before the admin-only kiosk row', () => {
    const tail = (findContext('c-trips')?.children ?? []).slice(-4);
    expect(tail.map(c => c.name)).toEqual(['maint-divider-trip', 'trip-maintenance', 'maint-divider', 'trip-kiosk']);
    expect(tail[1]).toMatchObject({ action: 'navigate', url: '/trips/maintenance', roleNeeded: 'tripAdmin' });
    expect(tail[3]).toMatchObject({ action: 'navigate', url: '/trips/kiosk', roleNeeded: 'admin' });
  });

  it('c-groups ends with the divider, the hygiene check and the three chat sync rows, all admin', () => {
    const children = findContext('c-groups')?.children ?? [];
    const tail = children.slice(-5);
    expect(tail.map(c => c.name)).toEqual(['maint-divider', 'group-check-hygiene', 'group-chat-members', 'group-chat-postpolicy', 'group-chat-guests']);
    expect(tail[0]).toMatchObject({ action: 'divider', url: '', roleNeeded: 'admin' });
    expect(tail.slice(1).map(c => [c.url, c.action, c.roleNeeded])).toEqual([
      ['checkHygiene', 'call', 'admin'],
      ['chatMembers', 'call', 'admin'],
      ['chatPostPolicy', 'call', 'admin'],
      ['chatGuests', 'call', 'admin'],
    ]);
  });

  it('c-membership ends with the member maintenance divider, the two membership reports and the SRV page, all memberAdmin', () => {
    const children = findContext('c-membership')?.children ?? [];
    const tail = children.slice(-4);
    expect(tail.map(c => c.name)).toEqual(['maint-divider-member', 'membership-old-juniors', 'membership-category-changes', 'membership-srv']);
    expect(tail[0]).toMatchObject({ action: 'divider', url: '', roleNeeded: 'memberAdmin' });
    expect(tail.slice(1).map(c => [c.url, c.action, c.roleNeeded])).toEqual([
      ['oldJuniors', 'call', 'memberAdmin'],
      ['categoryChanges', 'call', 'memberAdmin'],
      ['/membership/srv', 'navigate', 'memberAdmin'],
    ]);
  });

  it('the shared maint-divider doc is field-identical wherever it is declared', () => {
    const seen: string[] = [];
    const visit = (spec: MenuSpec): void => {
      if (spec.name.startsWith('maint-divider')) {
        const { children: _c, ...fields } = spec;
        seen.push(JSON.stringify(Object.entries(fields).sort()) + spec.name);
      }
      (spec.children ?? []).forEach(visit);
    };
    FEATURE_BLOCKS.forEach(b => b.menu.forEach(visit));
    const byName = new Map<string, Set<string>>();
    seen.forEach(s => {
      const name = /(maint-divider[a-z-]*)$/.exec(s)![1];
      byName.set(name, (byName.get(name) ?? new Set()).add(s));
    });
    byName.forEach(variants => expect(variants.size).toBe(1));
  });

  it('none of the new names sits under aoc-menu', () => {
    const aoc = FEATURE_BLOCKS.find(b => b.id === 'aoc')!;
    const names = new Set<string>();
    const visit = (spec: MenuSpec): void => {
      names.add(spec.name);
      (spec.children ?? []).forEach(visit);
    };
    aoc.menu.forEach(visit);
    for (const n of ['maint-divider', 'maint-divider-content', 'maint-divider-trip', 'calevent-check-duplicates', 'group-check-hygiene', 'person-check-favaddress', 'person-bexio-contacts', 'aoc-bexio', 'page-integrity', 'document-orphans', 'trip-maintenance', 'trip-kiosk', 'aoc-kiosk', 'diary-import', 'aoc-content', 'aoc-doc', 'aoc-diary', 'chat-maintenance', 'aoc-chat', 'aoc-account', 'aoc-auth']) {
      expect(names.has(n), n).toBe(false);
    }
  });
});

/**
 * Spec 1.101 phase 4: Chat-Wartung leaves `aoc-menu` and sits at the end of `contextMenuChat`.
 * That wrapper is declared twice (blocks `chat` and `subject`), and the cross-block identity test
 * compares only the OWN fields, never `children` — so the two child lists are pinned here.
 */
describe('contextMenuChat Wartung rows (1.101 phase 4)', () => {
  const copies = FEATURE_BLOCKS
    .map(b => ({ id: b.id, spec: b.menu.find(m => m.name === 'contextMenuChat') }))
    .filter((c): c is { id: string; spec: MenuSpec } => !!c.spec);

  it('is declared by exactly the chat and subject blocks', () => {
    expect(copies.map(c => c.id).sort()).toEqual(['chat', 'subject']);
  });

  it.each(['chat', 'subject'])('the %s copy ends with the admin divider and the Chat-Wartung row', id => {
    const tail = (copies.find(c => c.id === id)?.spec.children ?? []).slice(-2);
    expect(tail.map(c => c.name)).toEqual(['maint-divider', 'chat-maintenance']);
    expect(tail[0]).toMatchObject({ action: 'divider', url: '', roleNeeded: 'admin' });
    expect(tail[1]).toMatchObject({ key: 'chat-maintenance', action: 'navigate', url: '/chat/maintenance', roleNeeded: 'admin', label: '@item.chat-maintenance' });
  });

  it('both copies carry field-identical children', () => {
    const [a, b] = copies.map(c => JSON.stringify(c.spec.children));
    expect(a).toBe(b);
  });
});

/**
 * Spec 1.101 phase 5: `aoc-menu` holds the four AOC hub rows. The tools the hub cards link to
 * (users, register, privacy audit, activity, escalations, workflow rules, features) are no longer
 * menu rows — and with that `aoc` is the only block left declaring the shared parent.
 */
describe('aoc-menu hub rows (1.101 phase 5)', () => {
  const aocMenu = FEATURE_BLOCKS.find(b => b.id === 'aoc')?.menu.find(m => m.name === 'aoc-menu');

  it('lists the four hub rows in area order, then the closing divider', () => {
    expect(aocMenu?.children?.map(c => c.name)).toEqual(['aoc-access', 'aoc-ops', 'aoc-config', 'aoc-data', 'divider_empty']);
  });

  it.each([
    ['aoc-access', '/aoc/access'],
    ['aoc-ops', '/aoc/ops'],
    ['aoc-config', '/aoc/config'],
    ['aoc-data', '/aoc/data'],
  ])('%s navigates to %s, admin only, with its own menu label', (name, url) => {
    expect(aocMenu?.children?.find(c => c.name === name)).toMatchObject({
      key: name, action: 'navigate', url, roleNeeded: 'admin', label: `@item.${name}`,
    });
  });

  it('is declared by the aoc block alone', () => {
    expect(blockOwnersOfMenuKey(FEATURE_BLOCKS, 'aoc-menu')).toEqual(['aoc']);
  });

  it('no block declares a row the hub absorbed', () => {
    for (const key of ['aoc-admin', 'aoc-sessions', 'aoc-email', 'user-all', 'priv-register', 'priv-audit', 'activity-all', 'ticket-all', 'workflow-all', 'tenant-features']) {
      expect(blockOwnersOfMenuKey(FEATURE_BLOCKS, key), key).toEqual([]);
    }
  });
});

/**
 * Spec 1.101 phase 5, final review (controller ruling): `aoc` is `core: true`. After phase 5 the
 * AOC hub is the only menu path to users, the privacy register/audit, system activities and the
 * feature picker — a tenant that switched `aoc` off would strand its admins outside all of them.
 */
describe('aoc is a core block (1.101 phase 5)', () => {
  const aoc = FEATURE_BLOCKS.find(b => b.id === 'aoc');
  const coreIds = FEATURE_BLOCKS.filter(b => b.core === true).map(b => b.id);

  it('is core and sits in the core bundle, so the picker offers no switch', () => {
    expect(aoc).toMatchObject({ core: true, bundle: 'core', defaultAvailability: 'ga' });
  });

  it('stays effective for a tenant whose stored selection omits it', () => {
    const effective = effectiveFeatures({ catalogue: FEATURE_BLOCKS, rollouts: [], enabled: [], tenantId: 'p13' });
    expect(effective.has('aoc')).toBe(true);
  });

  it('names no dependency, so it does not hold document on for every tenant', () => {
    expect(aoc?.dependsOn).toEqual([]);
    expect(holdersOf(FEATURE_BLOCKS, 'document', coreIds)).not.toContain('aoc');
  });

  /**
   * A core block is always effective, so any dependency it names becomes permanently 'required'
   * (`holdersOf` counts core blocks as holders) — its target can never be switched off. The rule
   * (see the `cms`, `avatar` and `aoc` blocks) is therefore: a core block names no non-core
   * dependency. `vcard` predates this guard and still holds `subject`/`relationship` on; it is
   * allowlisted as-is so that any NEW violation, or a new edge on vcard, still fails here.
   */
  const KNOWN_CORE_TO_NON_CORE: Record<string, string[]> = { vcard: ['subject', 'relationship'] };

  it('no core block depends on a non-core block, except the allowlisted pre-existing vcard edges', () => {
    const core = new Set(coreIds);
    for (const block of FEATURE_BLOCKS.filter(b => b.core === true)) {
      const nonCore = block.dependsOn.filter(dep => !core.has(dep));
      expect(nonCore, block.id).toEqual(KNOWN_CORE_TO_NON_CORE[block.id] ?? []);
    }
  });
});
