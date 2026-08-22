import { describe, expect, it } from 'vitest';

import { AliasCollection, AliasModel } from './alias.model';
import { AliasSpaceCollection, AliasSpaceModel } from './alias-space.model';

describe('AliasModel', () => {
  it('is scoped to the given tenant and starts unused', () => {
    const alias = new AliasModel('scs');
    expect(alias.tenants).toEqual(['scs']);
    expect(alias.isArchived).toBe(false);
    expect(alias.useCount).toBe(0);
    expect(alias.lastUsedAt).toBe('');
  });

  it('is enabled and unlimited by default — a printed code must not expire by accident', () => {
    const alias = new AliasModel('scs');
    expect(alias.isEnabled).toBe(true);
    expect(alias.validUntil).toBe('');
    expect(alias.maxUses).toBe(0);
  });

  it('inherits its tracking level from the space unless overridden', () => {
    expect(new AliasModel('scs').trackingLevel).toBe('inherit');
    expect(new AliasModel('scs').retentionDays).toBe(0);
  });

  it('defaults to a url target with empty target fields', () => {
    const alias = new AliasModel('scs');
    expect(alias.targetType).toBe('url');
    expect(alias.targetUrl).toBe('');
    expect(alias.targetKey).toBe('');
  });

  it('names the collection', () => {
    expect(AliasCollection).toBe('aliases');
  });
});

describe('AliasSpaceModel', () => {
  it('defaults to a redirect space with a 6-char look-alike-free code', () => {
    const space = new AliasSpaceModel('scs');
    expect(space.kind).toBe('redirect');
    expect(space.length).toBe(6);
    expect(space.charset).toBe('base32-safe');
  });

  it('tracks counters but never per-click detail by default', () => {
    const space = new AliasSpaceModel('scs');
    expect(space.trackingLevel).toBe('counter');
    expect(space.retentionDays).toBe(365);
  });

  it('accepts only url targets until a space says otherwise', () => {
    expect(new AliasSpaceModel('scs').targetTypes).toEqual(['url']);
  });

  it('names the collection', () => {
    expect(AliasSpaceCollection).toBe('aliasSpaces');
  });
});
