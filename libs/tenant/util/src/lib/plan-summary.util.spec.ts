import { describe, expect, it } from 'vitest';
import { signal } from '@angular/core';

import type { PlanEntry } from './apply-preview.types';
import { FEATURE_PICKER_I18N_KEYS, type FeaturePickerI18n } from './feature-picker-i18n';
import { summarizePlanConsequences } from './plan-summary.util';

/** A stand-in store resolution: every key resolves to the key itself, so the test can see WHICH. */
const i18n = Object.fromEntries(
  Object.keys(FEATURE_PICKER_I18N_KEYS).map(k => [k, signal(`«${k}»`)]),
) as unknown as FeaturePickerI18n;

const entry = (over: Partial<PlanEntry>): PlanEntry => ({
  kind: 'menu-extended', subject: 'calevent-all', consequence: 'deutscher Satz', ...over,
});

describe('summarizePlanConsequences', () => {
  it('is empty for an empty plan', () => {
    expect(summarizePlanConsequences([], i18n)).toBe('');
  });

  it('shows a single occurrence without a count prefix, but names its subject', () => {
    expect(summarizePlanConsequences([entry({ consequenceKey: 'menu_shared' })], i18n))
      .toBe('«plan_menu_shared» (calevent-all)');
  });

  it('collapses the same sentence across subjects into one counted line naming them all', () => {
    const entries = ['a', 'b', 'c'].map(subject => entry({ subject, consequenceKey: 'menu_shared' }));
    expect(summarizePlanConsequences(entries, i18n)).toBe('3 × «plan_menu_shared» (a, b, c)');
  });

  it('keeps distinct sentences, each with its own subjects, in first-seen order', () => {
    const entries = [
      entry({ subject: 'a', consequenceKey: 'menu_created' }),
      entry({ subject: 'b', consequenceKey: 'menu_shared' }),
      entry({ subject: 'c', consequenceKey: 'menu_shared' }),
    ];
    expect(summarizePlanConsequences(entries, i18n))
      .toBe('«plan_menu_created» (a) 2 × «plan_menu_shared» (b, c)');
  });

  it('elides the subject list beyond twelve names', () => {
    const entries = Array.from({ length: 14 }, (_, i) => entry({ subject: `r${i}`, consequenceKey: 'menu_shared' }));
    expect(summarizePlanConsequences(entries, i18n))
      .toBe('14 × «plan_menu_shared» (r0, r1, r2, r3, r4, r5, r6, r7, r8, r9, r10, r11, …)');
  });

  it('falls back to the planner German sentence when no key is set', () => {
    expect(summarizePlanConsequences([entry({}), entry({ subject: 'b' })], i18n))
      .toBe('2 × deutscher Satz (calevent-all, b)');
  });
});

describe('summarizePlanConsequences({ withSubjects: false })', () => {
  it('leaves the distinct sentences alone, without count or subject names', () => {
    const entries = [
      entry({ subject: 'a', consequenceKey: 'menu_shared' }),
      entry({ subject: 'a', consequenceKey: 'menu_attached' }),
      entry({ subject: 'a', consequenceKey: 'menu_shared' }),
    ];
    expect(summarizePlanConsequences(entries, i18n, { withSubjects: false }))
      .toBe('«plan_menu_shared» «plan_menu_attached»');
  });
});
