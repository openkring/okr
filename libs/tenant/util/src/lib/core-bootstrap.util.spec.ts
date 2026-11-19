import { describe, expect, it } from 'vitest';

import type { FeatureBlock } from './feature-catalogue.types';
import { coreBootstrapBlocks } from './core-bootstrap.util';

const block = (id: string, core = false): FeatureBlock => ({ id, core, menu: [] } as unknown as FeatureBlock);
const catalogue = [block('auth', true), block('cms', true), block('profile', true), block('vcard', true), block('calevent'), block('finance')];

describe('coreBootstrapBlocks', () => {
  it('gives every core block to a tenant that has never stored one (new tenant, first save)', () => {
    expect(coreBootstrapBlocks(catalogue, []).map(b => b.id)).toEqual(['auth', 'cms', 'profile', 'vcard']);
    expect(coreBootstrapBlocks(catalogue, ['calevent', 'finance']).map(b => b.id)).toEqual(['auth', 'cms', 'profile', 'vcard']);
  });

  it('leaves an established tenant alone, even when one core block is not stored (vcard on scs)', () => {
    expect(coreBootstrapBlocks(catalogue, ['auth', 'cms', 'profile', 'calevent'])).toEqual([]);
  });

  it('leaves a legacy tenant without the field alone (it reads as every block enabled)', () => {
    expect(coreBootstrapBlocks(catalogue, undefined)).toEqual([]);
  });
});
