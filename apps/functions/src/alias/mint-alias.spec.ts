import { describe, expect, it } from 'vitest';
import { AliasSpaceModel } from '@okr/shared-models';
import { assertTargetAcceptable } from './mint-alias';

function space(kind: 'redirect' | 'lookup'): AliasSpaceModel {
  const model = new AliasSpaceModel('bka');
  model.name = kind === 'lookup' ? 'person' : 'qr';
  model.kind = kind;
  model.targetTypes = ['model'];
  return model;
}

describe('assertTargetAcceptable', () => {
  it('still refuses an unroutable model target in a redirect space', () => {
    // The TP1 review finding, unchanged: a printed code that can only 404.
    expect(() => assertTargetAcceptable(space('redirect'), 'model', '', 'location.abc')).toThrow();
    expect(() => assertTargetAcceptable(space('redirect'), 'model', '', 'calevent.abc')).toThrow();
  });

  it('accepts a routable model target in a redirect space', () => {
    expect(() => assertTargetAcceptable(space('redirect'), 'model', '', 'person.abc')).not.toThrow();
  });

  it('accepts an unroutable model target in a lookup space', () => {
    // A lookup space never redirects — the app resolves targetKey itself. The detail-route
    // requirement is a property of redirecting, not of model targets.
    expect(() => assertTargetAcceptable(space('lookup'), 'model', '', 'location.abc')).not.toThrow();
  });

  it('still enforces the space targetTypes allowlist in a lookup space', () => {
    const lookup = space('lookup');
    lookup.targetTypes = ['model'];
    expect(() => assertTargetAcceptable(lookup, 'url', 'https://example.com', '')).toThrow();
  });
});
