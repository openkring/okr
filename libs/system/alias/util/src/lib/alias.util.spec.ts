import { describe, expect, it } from 'vitest';

import { AliasModel, AliasSpaceModel } from '@okr/shared-models';

import { buildTargetUrl, getAliasUsability, getEffectiveTracking, isSafeTargetUrl } from './alias.util';

function newAlias(): AliasModel {
  const alias = new AliasModel('scs');
  alias.space = 'qr';
  alias.alias = 'Ab3xK9';
  alias.targetUrl = 'https://app.seeclub.org/anmeldung';
  return alias;
}

describe('getAliasUsability', () => {
  it('is ok for a fresh, unlimited alias', () => {
    expect(getAliasUsability(newAlias(), '20260822')).toBe('ok');
  });

  it('reports a revoked alias as disabled, not as missing', () => {
    const alias = newAlias();
    alias.isEnabled = false;
    expect(getAliasUsability(alias, '20260822')).toBe('disabled');
  });

  it('reports an archived alias', () => {
    const alias = newAlias();
    alias.isArchived = true;
    expect(getAliasUsability(alias, '20260822')).toBe('archived');
  });

  it('is notYetValid strictly before validFrom', () => {
    const alias = newAlias();
    alias.validFrom = '20260901';
    expect(getAliasUsability(alias, '20260831')).toBe('notYetValid');
    expect(getAliasUsability(alias, '20260901')).toBe('ok');
  });

  it('treats validUntil as inclusive — the last day still works', () => {
    const alias = newAlias();
    alias.validUntil = '20260831';
    expect(getAliasUsability(alias, '20260831')).toBe('ok');
    expect(getAliasUsability(alias, '20260901')).toBe('expired');
  });

  it('is exhausted once useCount reaches maxUses', () => {
    const alias = newAlias();
    alias.maxUses = 2;
    alias.useCount = 1;
    expect(getAliasUsability(alias, '20260822')).toBe('ok');
    alias.useCount = 2;
    expect(getAliasUsability(alias, '20260822')).toBe('exhausted');
  });

  it('ignores maxUses when it is 0 (unlimited)', () => {
    const alias = newAlias();
    alias.useCount = 9999;
    expect(getAliasUsability(alias, '20260822')).toBe('ok');
  });

  it('reports disabled before expired when both apply — the operator cause wins', () => {
    const alias = newAlias();
    alias.isEnabled = false;
    alias.validUntil = '20200101';
    expect(getAliasUsability(alias, '20260822')).toBe('disabled');
  });
});

describe('isSafeTargetUrl', () => {
  it('accepts https', () => {
    expect(isSafeTargetUrl('https://app.seeclub.org/x')).toBe(true);
  });

  it('rejects javascript, data and plain http — a public redirector must not launder them', () => {
    expect(isSafeTargetUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeTargetUrl('data:text/html,<script>')).toBe(false);
    expect(isSafeTargetUrl('http://app.seeclub.org/x')).toBe(false);
  });

  it('rejects a non-url string', () => {
    expect(isSafeTargetUrl('not a url')).toBe(false);
    expect(isSafeTargetUrl('')).toBe(false);
  });
});

describe('buildTargetUrl', () => {
  it('returns the url target verbatim', () => {
    expect(buildTargetUrl(newAlias(), 'https://app.seeclub.org'))
      .toBe('https://app.seeclub.org/anmeldung');
  });

  it('builds the route from a model target at resolve time, so a rename cannot orphan a printed code', () => {
    const alias = newAlias();
    alias.targetType = 'model';
    alias.targetUrl = '';
    alias.targetKey = 'person.abc123';
    expect(buildTargetUrl(alias, 'https://app.seeclub.org'))
      .toBe('https://app.seeclub.org/person/abc123');
  });

  // Dieser Fall stand hier bis 2026-08-22 mit der UMGEKEHRTEN Erwartung
  // ('.../calevent/abc123') und hat damit den Fehler festgeschrieben: calevent hat keine
  // /{modelType}/{okey}-Route, der okey haette an :listId gebunden und eine leere Liste
  // gerendert. Ein leerer String wird im Resolver zum 404 — der ehrliche Ausgang.
  it('builds no url for a model target the app cannot route to (calevent, trip)', () => {
    const alias = newAlias();
    alias.targetType = 'model';
    alias.targetUrl = '';
    alias.targetKey = 'calevent.abc123';
    expect(buildTargetUrl(alias, 'https://app.seeclub.org')).toBe('');

    alias.targetKey = 'trip.abc123';
    expect(buildTargetUrl(alias, 'https://app.seeclub.org')).toBe('');
  });

  it('returns an empty string for a pure identifier — there is nothing to redirect to', () => {
    const alias = newAlias();
    alias.targetType = 'none';
    alias.targetUrl = '';
    expect(buildTargetUrl(alias, 'https://app.seeclub.org')).toBe('');
  });

  it('returns an empty string for a malformed model key rather than a broken url', () => {
    const alias = newAlias();
    alias.targetType = 'model';
    alias.targetUrl = '';
    alias.targetKey = 'calevent';
    expect(buildTargetUrl(alias, 'https://app.seeclub.org')).toBe('');
  });
});

describe('getEffectiveTracking', () => {
  it('takes the space defaults when the alias inherits', () => {
    const space = new AliasSpaceModel('scs');
    expect(getEffectiveTracking(newAlias(), space)).toEqual({ level: 'counter', retentionDays: 365 });
  });

  it('lets the alias override the level', () => {
    const alias = newAlias();
    alias.trackingLevel = 'off';
    expect(getEffectiveTracking(alias, new AliasSpaceModel('scs')).level).toBe('off');
  });

  it('lets the alias shorten retention but keeps the space value at 0 (inherit)', () => {
    const alias = newAlias();
    alias.retentionDays = 30;
    expect(getEffectiveTracking(alias, new AliasSpaceModel('scs')).retentionDays).toBe(30);
  });
});
