import { describe, expect, it } from 'vitest';
import { signal } from '@angular/core';

import type { PlanEntry } from './apply-preview.types';
import { FEATURE_PICKER_I18N_KEYS, planConsequence, type FeaturePickerI18n } from './feature-picker-i18n';

/** A stand-in store resolution: every key resolves to the key itself, so the test can see WHICH. */
const i18n = Object.fromEntries(
  Object.keys(FEATURE_PICKER_I18N_KEYS).map(k => [k, signal(`«${k}»`)]),
) as unknown as FeaturePickerI18n;

const entry = (over: Partial<PlanEntry>): PlanEntry => ({
  kind: 'block-enabled', subject: 'calevent', consequence: 'deutscher Satz', ...over,
});

describe('planConsequence', () => {
  it('translates the key the planner named', () => {
    expect(planConsequence(entry({ consequenceKey: 'block_enabled' }), i18n)).toBe('«plan_block_enabled»');
  });

  it('tells the two menu-extended sentences apart, which `kind` alone cannot', () => {
    const shared = entry({ kind: 'menu-extended', consequenceKey: 'menu_shared' });
    const children = entry({ kind: 'menu-extended', consequenceKey: 'menu_children' });
    expect(planConsequence(shared, i18n)).not.toBe(planConsequence(children, i18n));
  });

  it('falls back to the German sentence when the function predates the key', () => {
    expect(planConsequence(entry({}), i18n)).toBe('deutscher Satz');
  });

  it('falls back rather than rendering nothing for an unknown key', () => {
    const unknown = entry({ consequenceKey: 'not_a_key' as never });
    expect(planConsequence(unknown, i18n)).toBe('deutscher Satz');
  });

  it('has a key for every consequence the planner can emit', () => {
    const keys: PlanEntry['consequenceKey'][] = [
      'block_enabled', 'block_enabled_dependency', 'block_withheld', 'block_disabled',
      'menu_created', 'menu_shared', 'menu_children', 'menu_reactivated', 'menu_attached',
      'seed_created', 'field_overwritten', 'field_pinned', 'field_unpinned',
    ];
    for (const key of keys) {
      expect(planConsequence(entry({ consequenceKey: key }), i18n)).toBe(`«plan_${key}»`);
    }
  });
});
