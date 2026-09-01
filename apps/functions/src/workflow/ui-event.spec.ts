import { describe, expect, it } from 'vitest';

import {
  COOLDOWN_SECONDS, EVENT_OF_KIND, cooldownDocId, isWithinCooldown, verifyButtonSource, verifyMenuSource,
} from './ui-event';

describe('EVENT_OF_KIND', () => {
  it('is a closed map — the client picks a KIND, never an event name', () => {
    // the reportIncident rule: a client that could name the event could fire any rule
    expect(EVENT_OF_KIND).toEqual({ button: 'ui.buttonClicked', menu: 'ui.menuCalled' });
  });

  it('has no entry for an invented kind', () => {
    expect(EVENT_OF_KIND['membership.ended']).toBeUndefined();
    expect(EVENT_OF_KIND['']).toBeUndefined();
  });
});

describe('verifyButtonSource', () => {
  const ok = { type: 'button', isArchived: false, tenants: ['scs'], name: 'schluessel-bestellen' };

  it('accepts a live button section of the caller tenant and returns the DOCUMENT name', () => {
    // This return value is the whole point: `sourceName` is what a rule matches on with
    // paramIs, and it must come from the document, never from the request.
    expect(verifyButtonSource(ok, 'scs')).toBe('schluessel-bestellen');
  });

  it('rejects a section of another tenant', () => {
    expect(verifyButtonSource({ ...ok, tenants: ['bka'] }, 'scs')).toBeUndefined();
  });

  it('accepts a section shared with the caller tenant among others', () => {
    expect(verifyButtonSource({ ...ok, tenants: ['bka', 'scs'] }, 'scs')).toBe('schluessel-bestellen');
  });

  it('rejects an archived section', () => {
    expect(verifyButtonSource({ ...ok, isArchived: true }, 'scs')).toBeUndefined();
  });

  it('rejects a section that is not a button', () => {
    expect(verifyButtonSource({ ...ok, type: 'article' }, 'scs')).toBeUndefined();
    expect(verifyButtonSource({ ...ok, type: 'form' }, 'scs')).toBeUndefined();
  });

  it('rejects a section with no name — there is nothing for a rule to match on', () => {
    expect(verifyButtonSource({ ...ok, name: '' }, 'scs')).toBeUndefined();
    expect(verifyButtonSource({ ...ok, name: '   ' }, 'scs')).toBeUndefined();
  });

  it('rejects a missing document and a document with no tenants', () => {
    expect(verifyButtonSource(undefined, 'scs')).toBeUndefined();
    expect(verifyButtonSource({ ...ok, tenants: undefined }, 'scs')).toBeUndefined();
  });
});

describe('verifyMenuSource', () => {
  const ok = { action: 'workflow', isArchived: false, tenants: ['scs'], name: 'abo-kuendigen' };

  it('accepts a live workflow menu item and returns the DOCUMENT name', () => {
    expect(verifyMenuSource(ok, 'scs')).toBe('abo-kuendigen');
  });

  it("rejects a plain 'call' item — every existing call menu is untouched by construction", () => {
    // decision O3: opting in is a new MenuAction value, not a marker on 'call'
    expect(verifyMenuSource({ ...ok, action: 'call' }, 'scs')).toBeUndefined();
    expect(verifyMenuSource({ ...ok, action: 'navigate' }, 'scs')).toBeUndefined();
    expect(verifyMenuSource({ ...ok, action: 'toggle' }, 'scs')).toBeUndefined();
  });

  it('rejects another tenant, an archived item, a nameless item and a missing document', () => {
    expect(verifyMenuSource({ ...ok, tenants: ['bka'] }, 'scs')).toBeUndefined();
    expect(verifyMenuSource({ ...ok, isArchived: true }, 'scs')).toBeUndefined();
    expect(verifyMenuSource({ ...ok, name: '' }, 'scs')).toBeUndefined();
    expect(verifyMenuSource(undefined, 'scs')).toBeUndefined();
  });
});

describe('isWithinCooldown', () => {
  const now = 1_800_000_000_000;

  it('is true for a second call inside the window', () => {
    expect(isWithinCooldown(now - 5_000, now)).toBe(true);
  });

  it('is false once the window has passed', () => {
    expect(isWithinCooldown(now - (COOLDOWN_SECONDS + 1) * 1000, now)).toBe(false);
  });

  it('is false when there is no previous call', () => {
    expect(isWithinCooldown(undefined, now)).toBe(false);
  });

  it('is false for a clock that jumped backwards rather than blocking forever', () => {
    expect(isWithinCooldown(now + 60_000, now)).toBe(false);
  });
});

describe('cooldownDocId', () => {
  it('scopes the cooldown to the pair (user, source)', () => {
    expect(cooldownDocId('uid1', 'sec1')).not.toBe(cooldownDocId('uid2', 'sec1'));
    expect(cooldownDocId('uid1', 'sec1')).not.toBe(cooldownDocId('uid1', 'sec2'));
  });

  it('is a legal Firestore document id — no slashes', () => {
    expect(cooldownDocId('uid/1', 'sec/1')).not.toContain('/');
  });
});
