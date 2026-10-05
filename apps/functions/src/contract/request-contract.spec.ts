import { describe, expect, it } from 'vitest';
import { ButtonAction } from '@okr/shared-models';
import { verifyContractSource } from './request-contract';

const section = (over: Record<string, unknown> = {}) => ({
  type: 'button', tenants: ['scs'], isArchived: false,
  properties: { action: { type: ButtonAction.Contract, url: 'skiffPlatz' } }, ...over,
});

describe('verifyContractSource', () => {
  it('returns the kind of a contract button of the tenant', () => {
    expect(verifyContractSource(section(), 'scs')).toBe('skiffPlatz');
  });
  it('refuses another action, another tenant, an archived or a non-button section', () => {
    expect(verifyContractSource(section({ properties: { action: { type: ButtonAction.Workflow, url: 'skiffPlatz' } } }), 'scs')).toBeUndefined();
    expect(verifyContractSource(section(), 'kring')).toBeUndefined();
    expect(verifyContractSource(section({ isArchived: true }), 'scs')).toBeUndefined();
    expect(verifyContractSource(section({ type: 'article' }), 'scs')).toBeUndefined();
    expect(verifyContractSource(undefined, 'scs')).toBeUndefined();
  });
});
