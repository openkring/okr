import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { AliasModel } from '@okr/shared-models';

import {
  ALIAS_TARGET_ROUTES,
  buildModelTargetUrl,
  isRoutableTargetKey,
  splitTargetKey,
} from './alias-target-routes';

describe('splitTargetKey', () => {
  it('splits a prefixed key', () => {
    expect(splitTargetKey('person.abc123')).toEqual({ modelType: 'person', okey: 'abc123' });
  });

  it('rejects a bare okey, an empty half and a stray extra segment', () => {
    expect(splitTargetKey('abc123')).toBeUndefined();
    expect(splitTargetKey('person.')).toBeUndefined();
    expect(splitTargetKey('.abc123')).toBeUndefined();
    expect(splitTargetKey('person.abc.123')).toBeUndefined();
  });
});

describe('isRoutableTargetKey', () => {
  it('accepts the model types that really have a detail route', () => {
    expect(isRoutableTargetKey('person.abc')).toBe(true);
    expect(isRoutableTargetKey('group.abc')).toBe(true);
  });

  // Der TP1-Befund, festgenagelt: beide sahen unter der alten /{modelType}/{okey}-Annahme wie
  // gültige Ziele aus und hätten einen 302 auf eine FALSCHE Seite erzeugt — der teuerste
  // Ausgang, weil ein gedrucktes Plakat ihn trägt.
  it('rejects calevent and trip — neither has a /{modelType}/{okey} route', () => {
    expect(isRoutableTargetKey('calevent.abc')).toBe(false);
    expect(isRoutableTargetKey('trip.abc')).toBe(false);
  });

  it('rejects an unknown model type outright', () => {
    expect(isRoutableTargetKey('unicorn.abc')).toBe(false);
  });
});

describe('buildModelTargetUrl', () => {
  const modelAlias = (targetKey: string): AliasModel => {
    const alias = new AliasModel('scs');
    alias.targetType = 'model';
    alias.targetKey = targetKey;
    return alias;
  };

  it('builds the person detail url — the diary case', () => {
    expect(buildModelTargetUrl(modelAlias('person.abc123'), 'https://app.seeclub.org'))
      .toBe('https://app.seeclub.org/person/abc123');
  });

  it('builds nothing for an unroutable model type', () => {
    expect(buildModelTargetUrl(modelAlias('calevent.abc123'), 'https://app.seeclub.org')).toBe('');
    expect(buildModelTargetUrl(modelAlias('trip.abc123'), 'https://app.seeclub.org')).toBe('');
  });
});

describe('ALIAS_TARGET_ROUTES', () => {
  it('names a plausible path segment for every entry', () => {
    for (const [modelType, segment] of Object.entries(ALIAS_TARGET_ROUTES)) {
      expect(segment, modelType).toMatch(/^[a-z][a-z0-9-]*$/);
    }
  });

  // Gleiches Muster wie apps/functions/src/privacy/audit/allowlist.spec.ts: die Karte kann den
  // Routen-Katalog zur Laufzeit nicht importieren (Angular in einer Angular-freien Lib), also
  // liest der Test seine Quelle als Text und schlägt fehl, sobald die Karte ein Segment
  // behauptet, das dort nicht als Pfad steht.
  it('every mapped segment exists as a path in the feature catalogue', () => {
    const source = readFileSync(
      join(__dirname, '..', '..', '..', '..', '..', 'tenant', 'routes', 'src', 'lib', 'feature-catalogue.ts'),
      'utf8',
    );
    expect(source.length, 'feature-catalogue.ts not found — fix the relative path')
      .toBeGreaterThan(1000);
    for (const segment of Object.values(ALIAS_TARGET_ROUTES)) {
      expect(source, `path: '${segment}' missing from feature-catalogue.ts`)
        .toContain(`path: '${segment}'`);
    }
  });
});
