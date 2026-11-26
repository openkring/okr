import { describe, expect, it } from 'vitest';

import { AvatarInfo, MandateModel } from '@okr/shared-models';

import {
  grantorKeysFor,
  isMandateActive,
  isMeetingOpenForProxies,
  mayRecordProxy,
  mandatePartyName,
  mayReceiveProxy,
  newFamilyMandate,
  newProxyMandate,
  proxiesHeldBy,
  proxyFor,
  proxyReplaces,
  proxyRevokeAction,
  revokePatch,
} from './mandate.util';

const TODAY = '20261126';
const YESTERDAY = '20261125';
const TOMORROW = '20261127';

function mandate(patch: Partial<MandateModel> = {}): MandateModel {
  return {
    ...new MandateModel('scs'),
    okey: 'm1',
    kind: 'family',
    grantorKey: 'g1',
    granteeKey: 'h1',
    actions: ['calevent.attend', 'invitation.answer'],
    ...patch,
  };
}

function proxy(patch: Partial<MandateModel> = {}): MandateModel {
  return mandate({ kind: 'proxy', actions: ['meeting.represent'], meetingKey: 'mt1', ...patch });
}

function avatar(key: string): AvatarInfo {
  return { key, name1: 'A', name2: 'B', modelType: 'person', type: '', subType: '', label: '' };
}

describe('isMandateActive', () => {
  it('is active when both bounds are open', () => {
    expect(isMandateActive(mandate({ validFrom: '', validTo: '' }), TODAY)).toBe(true);
  });
  it('is active on the last day (validTo is inclusive)', () => {
    expect(isMandateActive(mandate({ validTo: TODAY }), TODAY)).toBe(true);
  });
  it('is not active after validTo', () => {
    expect(isMandateActive(mandate({ validTo: YESTERDAY }), TODAY)).toBe(false);
  });
  it('is not active before validFrom', () => {
    expect(isMandateActive(mandate({ validFrom: TOMORROW }), TODAY)).toBe(false);
  });
  it('is active from validFrom on', () => {
    expect(isMandateActive(mandate({ validFrom: TODAY }), TODAY)).toBe(true);
  });
  it('is not active once revoked', () => {
    expect(isMandateActive(mandate({ revokedAt: '20261120120000' }), TODAY)).toBe(false);
  });
  it('is not active when archived', () => {
    expect(isMandateActive(mandate({ isArchived: true }), TODAY)).toBe(false);
  });
});

describe('grantorKeysFor', () => {
  it('returns the grantors of active family mandates that include the action', () => {
    const list = [mandate({ grantorKey: 'g1' }), mandate({ okey: 'm2', grantorKey: 'g2', actions: ['calevent.attend'] })];
    expect(grantorKeysFor(list, 'h1', 'calevent.attend', TODAY)).toEqual(['g1', 'g2']);
  });
  it('ignores proxies', () => {
    expect(grantorKeysFor([proxy()], 'h1', 'meeting.represent', TODAY)).toEqual([]);
  });
  it('ignores mandates without the action', () => {
    const list = [mandate({ actions: ['calevent.attend'] })];
    expect(grantorKeysFor(list, 'h1', 'invitation.answer', TODAY)).toEqual([]);
  });
  it('ignores other grantees', () => {
    expect(grantorKeysFor([mandate({ granteeKey: 'x' })], 'h1', 'calevent.attend', TODAY)).toEqual([]);
  });
  it('ignores inactive mandates', () => {
    expect(grantorKeysFor([mandate({ validTo: YESTERDAY })], 'h1', 'calevent.attend', TODAY)).toEqual([]);
  });
  it('dedupes two mandates from the same grantor', () => {
    const list = [mandate(), mandate({ okey: 'm2' })];
    expect(grantorKeysFor(list, 'h1', 'calevent.attend', TODAY)).toEqual(['g1']);
  });
});

describe('proxyFor / proxiesHeldBy', () => {
  it('finds the active proxy of a grantor for a meeting', () => {
    const p = proxy();
    expect(proxyFor([p], 'mt1', 'g1', TODAY)).toBe(p);
    expect(proxyFor([p], 'mt2', 'g1', TODAY)).toBeUndefined();
    expect(proxyFor([p], 'mt1', 'g2', TODAY)).toBeUndefined();
  });
  it('lists the active proxies a grantee holds for a meeting', () => {
    const list = [proxy(), proxy({ okey: 'm2', grantorKey: 'g2' }), proxy({ okey: 'm3', grantorKey: 'g3', revokedAt: '20261120120000' }), mandate()];
    expect(proxiesHeldBy(list, 'mt1', 'h1', TODAY).map((m) => m.okey)).toEqual(['m1', 'm2']);
  });
});

describe('mayReceiveProxy', () => {
  it('is false when the cap is reached', () => {
    expect(mayReceiveProxy([proxy()], 'mt1', 'h1', 1, TODAY)).toBe(false);
  });
  it('is false when the cap is 0', () => {
    expect(mayReceiveProxy([], 'mt1', 'h1', 0, TODAY)).toBe(false);
  });
  it('is true below the cap', () => {
    expect(mayReceiveProxy([proxy()], 'mt1', 'h1', 2, TODAY)).toBe(true);
  });
  it('does not count a revoked proxy', () => {
    expect(mayReceiveProxy([proxy({ revokedAt: '20261120120000' })], 'mt1', 'h1', 1, TODAY)).toBe(true);
  });
});

describe('proxyReplaces', () => {
  it('returns the active proxy of the same grantor and meeting', () => {
    const p = proxy();
    expect(proxyReplaces([p], 'mt1', 'g1', TODAY)).toBe(p);
  });
  it('returns undefined for another meeting', () => {
    expect(proxyReplaces([proxy()], 'mt2', 'g1', TODAY)).toBeUndefined();
  });
});

describe('revokePatch', () => {
  it('stamps who revoked and when', () => {
    expect(revokePatch('p1', '20261126101500')).toEqual({ revokedAt: '20261126101500', revokedByKey: 'p1' });
  });
});

describe('factories', () => {
  it('builds a family mandate', () => {
    const m = newFamilyMandate('scs', avatar('g1'), avatar('h1'), ['calevent.attend'], '', 'g1');
    expect(m).toMatchObject({
      tenants: ['scs'], kind: 'family', grantorKey: 'g1', granteeKey: 'h1', actions: ['calevent.attend'],
      validTo: '', meetingKey: '', createdByKey: 'g1',
    });
    expect(m.grantee?.key).toBe('h1');
  });
  it('builds a proxy mandate for exactly the meeting', () => {
    const m = newProxyMandate('scs', avatar('g1'), avatar('h1'), 'mt1', 'p9');
    expect(m).toMatchObject({ kind: 'proxy', actions: ['meeting.represent'], meetingKey: 'mt1', createdByKey: 'p9', grantorKey: 'g1', granteeKey: 'h1' });
  });
});

describe('mandatePartyName', () => {
  const grantee = { key: 'h1', name1: 'Beat', name2: 'Muster' } as AvatarInfo;
  const grantor = { key: 'g2', name1: 'Anna', name2: 'Muster' } as AvatarInfo;
  const given = [mandate({ granteeKey: 'h1', grantee })];
  const received = [mandate({ okey: 'm2', grantorKey: 'g2', grantor })];

  it('reads the grantee of a Vollmacht I gave', () => {
    expect(mandatePartyName('h1', given, received)).toBe('Beat');
  });
  it('reads the grantor of a Vollmacht I received', () => {
    expect(mandatePartyName('g2', given, received)).toBe('Anna');
  });
  it('is empty for an unknown person or an empty key, never the key', () => {
    expect(mandatePartyName('zz', given, received)).toBe('');
    expect(mandatePartyName('', given, received)).toBe('');
  });
});

describe('isMeetingOpenForProxies', () => {
  it('is open while draft or invited', () => {
    expect(isMeetingOpenForProxies({ state: 'draft' })).toBe(true);
    expect(isMeetingOpenForProxies({ state: 'invited' })).toBe(true);
  });
  it('is closed from held on', () => {
    expect(isMeetingOpenForProxies({ state: 'held' })).toBe(false);
    expect(isMeetingOpenForProxies({ state: 'approved' })).toBe(false);
  });
  it('treats a legacy meeting without state as a draft', () => {
    expect(isMeetingOpenForProxies({ state: undefined as unknown as 'draft' })).toBe(true);
  });
});

describe('mayRecordProxy', () => {
  const meeting = { okey: 'mt1', state: 'invited' as const, chair: avatar('c1') };
  it('lets the grantor record their own proxy', () => {
    expect(mayRecordProxy(meeting, 'g1', 'g1', 1, false)).toBe(true);
  });
  it('lets the chair record a proxy for anybody', () => {
    expect(mayRecordProxy(meeting, 'g1', 'c1', 1, false)).toBe(true);
  });
  it('lets an admin record a proxy for anybody', () => {
    expect(mayRecordProxy(meeting, 'g1', 'x', 1, true)).toBe(true);
  });
  it('refuses another plain attendee', () => {
    expect(mayRecordProxy(meeting, 'g1', 'x', 1, false)).toBe(false);
  });
  it('refuses when the tenant allows no proxies', () => {
    expect(mayRecordProxy(meeting, 'g1', 'g1', 0, true)).toBe(false);
  });
  it('refuses once the meeting is held', () => {
    expect(mayRecordProxy({ ...meeting, state: 'held' }, 'g1', 'g1', 1, true)).toBe(false);
  });
  it('refuses for a meeting not stored yet', () => {
    expect(mayRecordProxy({ ...meeting, okey: '' }, 'g1', 'g1', 1, true)).toBe(false);
  });
  it('refuses without a caller', () => {
    expect(mayRecordProxy(meeting, 'g1', '', 1, true)).toBe(false);
  });
});

describe('proxyRevokeAction', () => {
  const meeting = { okey: 'mt1', state: 'invited' as const, chair: avatar('c1') };
  it('lets the holder give the proxy back', () => {
    expect(proxyRevokeAction(meeting, proxy(), 'h1', false, TODAY)).toBe('give_back');
  });
  it('lets the holder give it back even when they are also the chair or an admin', () => {
    expect(proxyRevokeAction({ ...meeting, chair: avatar('h1') }, proxy(), 'h1', true, TODAY)).toBe('give_back');
  });
  it('lets the grantor, the chair and an admin revoke it', () => {
    expect(proxyRevokeAction(meeting, proxy(), 'g1', false, TODAY)).toBe('revoke');
    expect(proxyRevokeAction(meeting, proxy(), 'c1', false, TODAY)).toBe('revoke');
    expect(proxyRevokeAction(meeting, proxy(), 'x', true, TODAY)).toBe('revoke');
  });
  it('offers nothing to another plain attendee', () => {
    expect(proxyRevokeAction(meeting, proxy(), 'x', false, TODAY)).toBe('');
  });
  it('offers nothing once the meeting is held; a legacy meeting without state counts as a draft', () => {
    expect(proxyRevokeAction({ ...meeting, state: 'held' }, proxy(), 'g1', true, TODAY)).toBe('');
    expect(proxyRevokeAction({ okey: 'mt1', state: undefined as unknown as 'draft', chair: avatar('c1') }, proxy(), 'g1', false, TODAY)).toBe('revoke');
  });
  it('offers nothing for a revoked proxy, a family Vollmacht or a proxy of another meeting', () => {
    expect(proxyRevokeAction(meeting, proxy({ revokedAt: '20261120', revokedByKey: 'g1' }), 'g1', false, TODAY)).toBe('');
    expect(proxyRevokeAction(meeting, mandate(), 'g1', true, TODAY)).toBe('');
    expect(proxyRevokeAction(meeting, proxy({ meetingKey: 'mt2' }), 'g1', true, TODAY)).toBe('');
  });
  it('offers nothing without a caller', () => {
    expect(proxyRevokeAction(meeting, proxy(), '', true, TODAY)).toBe('');
  });
});
