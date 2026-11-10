import { describe, expect, it } from 'vitest';
import { FEATURE_BLOCKS } from './feature-blocks';
import { FINANCE_SPLIT_BLOCKS, planFinanceSplit } from './finance-split.util';

describe('planFinanceSplit', () => {
  it('adds the three blocks to a tenant with finance', () => {
    const plan = planFinanceSplit({ enabledFeatures: ['subject', 'finance'], billing: 'exempt', options: [] });
    expect(plan.addBlocks).toEqual(['cost-accounting', 'expense', 'asset']);
    expect(plan.enabledFeatures).toEqual(['subject', 'finance', 'cost-accounting', 'expense', 'asset']);
    expect(plan.addOptions).toEqual([]);
    expect(plan.options).toBeUndefined();
  });

  it('also adds the three options for a stripe tenant', () => {
    const plan = planFinanceSplit({ enabledFeatures: ['finance'], billing: 'stripe', options: ['buchhaltung'] });
    expect(plan.addBlocks).toEqual(['cost-accounting', 'expense', 'asset']);
    expect(plan.addOptions).toEqual(['kostenrechnung', 'spesen-ocr', 'anlagen']);
    expect(plan.options).toEqual(['buchhaltung', 'kostenrechnung', 'spesen-ocr', 'anlagen']);
  });

  it('treats a missing options array as empty', () => {
    expect(planFinanceSplit({ enabledFeatures: ['finance'], billing: 'stripe' }).options)
      .toEqual(['kostenrechnung', 'spesen-ocr', 'anlagen']);
  });

  it('leaves a legacy tenant without enabledFeatures untouched, stripe or not', () => {
    expect(planFinanceSplit({ billing: 'stripe', options: [] })).toEqual({ addBlocks: [], addOptions: [] });
    expect(planFinanceSplit({})).toEqual({ addBlocks: [], addOptions: [] });
  });

  it('leaves a tenant without finance untouched, stripe or not', () => {
    expect(planFinanceSplit({ enabledFeatures: ['subject'], billing: 'stripe', options: [] }))
      .toEqual({ addBlocks: [], addOptions: [] });
  });

  it('is idempotent: a second run plans nothing', () => {
    const first = planFinanceSplit({ enabledFeatures: ['finance', 'expense'], billing: 'stripe', options: ['anlagen'] });
    expect(first.addBlocks).toEqual(['cost-accounting', 'asset']);
    expect(first.addOptions).toEqual(['kostenrechnung', 'spesen-ocr']);
    const second = planFinanceSplit({ enabledFeatures: first.enabledFeatures, billing: 'stripe', options: first.options });
    expect(second).toEqual({ addBlocks: [], addOptions: [] });
  });

  it('names blocks that exist in the catalogue and depend on finance', () => {
    FINANCE_SPLIT_BLOCKS.forEach(id => {
      expect(FEATURE_BLOCKS.find(b => b.id === id)?.dependsOn).toContain('finance');
    });
  });
});
