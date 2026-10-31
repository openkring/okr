import { describe, expect, it } from 'vitest';

import { androidDisplay, appleDisplay, buildPushData, buildTokenMessage, nativeChannelFor, selectUserDocs, withAppName } from './push';

describe('buildPushData', () => {
  const base = { type: 'calevent', title: 'Training', body: 'Faellt aus', url: '/calevent/e1', tenantId: 'scs' };

  it('carries the routing fields', () => {
    expect(buildPushData(base)).toEqual({
      type: 'calevent', title: 'Training', body: 'Faellt aus', url: '/calevent/e1', tenantId: 'scs',
    });
  });

  it('OMITS every badge field when the sender passes none — no sender knows the total', () => {
    const data = buildPushData(base);
    expect(data['badgeTasks']).toBeUndefined();
    expect(data['badgeAdd']).toBeUndefined();
    expect(data['badgeId']).toBeUndefined();
    expect(data['badgeCount']).toBeUndefined();
  });

  it('writes the task part as a string, including 0', () => {
    expect(buildPushData({ ...base, badgeTasks: 3 })['badgeTasks']).toBe('3');
    expect(buildPushData({ ...base, badgeTasks: 0 })['badgeTasks']).toBe('0');
  });

  it('writes badgeAdd only together with its de-duplication id', () => {
    expect(buildPushData({ ...base, badgeAdd: 'invitation', badgeId: 'inv-1' })).toMatchObject({
      badgeAdd: 'invitation', badgeId: 'inv-1',
    });
    expect(buildPushData({ ...base, badgeAdd: 'invitation' })['badgeAdd']).toBeUndefined();
  });

  it('carries channelId so several pushes about one event collapse into one banner', () => {
    expect(buildPushData({ ...base, channelId: 'calevent.e1' })['channelId']).toBe('calevent.e1');
  });

  it('omits channelId when empty rather than sending a blank tag', () => {
    expect(buildPushData({ ...base, channelId: '' })['channelId']).toBeUndefined();
  });
});

describe('selectUserDocs', () => {
  // Barbara (2026-09-15): one person, an scs account and a kwa account. `limit(1)` returned
  // whichever doc id sorted first — the kwa one — so every scs push went to the kwa app.
  const scs = { uid: 'cU69', tenants: ['scs'], isArchived: false };
  const kwa = { uid: 'CPhf', tenants: ['kwa'], isArchived: false };

  it('keeps only the account of the tenant the push is about', () => {
    expect(selectUserDocs([kwa, scs], 'scs')).toEqual([scs]);
  });

  it('returns NO account when the person has none in that tenant — never a foreign app', () => {
    expect(selectUserDocs([kwa], 'scs')).toEqual([]);
  });

  it('drops archived accounts', () => {
    expect(selectUserDocs([{ ...scs, isArchived: true }], 'scs')).toEqual([]);
  });

  it('tolerates a legacy account without a tenants array', () => {
    expect(selectUserDocs([{ uid: 'x', tenants: undefined, isArchived: false }], 'scs')).toEqual([]);
  });
});

describe('withAppName', () => {
  it('prefixes the title with the app name so a multi-club member sees the source', () => {
    expect(withAppName('Seeclub Stäfa', 'Breitensport')).toBe('Seeclub Stäfa · Breitensport');
  });

  it('leaves the title alone when the app name is unknown', () => {
    expect(withAppName('', 'Breitensport')).toBe('Breitensport');
  });

  it('does not double the prefix when the title already starts with it', () => {
    expect(withAppName('Seeclub Stäfa', 'Seeclub Stäfa · Breitensport')).toBe('Seeclub Stäfa · Breitensport');
  });
});

describe('buildPushData tenant', () => {
  it('carries tenantId so the service worker can refuse a foreign tenant push', () => {
    const data = buildPushData({ type: 'calevent', title: 't', body: 'b', url: '/x', tenantId: 'scs' });
    expect(data['tenantId']).toBe('scs');
  });
});

// Native Android (Capacitor) shows NOTHING for a data-only message — there is no service worker.
// The `android` block applies only to native Android app instances; web tokens ignore it.
describe('androidDisplay', () => {
  it('gives native Android a visible notification with title and body', () => {
    expect(androidDisplay('Seeclub Stäfa · Training', 'Fällt aus', 'high')).toEqual({
      priority: 'high',
      notification: { title: 'Seeclub Stäfa · Training', body: 'Fällt aus', channelId: 'okr_default' },
    });
  });

  it('passes a collapse tag so several pushes about one thing replace each other', () => {
    expect(androidDisplay('t', 'b', 'normal', 'calevent.e1').notification).toEqual({ title: 't', body: 'b', channelId: 'okr_default', tag: 'calevent.e1' });
  });

  it('omits an empty tag rather than sending a blank one', () => {
    expect(androidDisplay('t', 'b', 'normal', '').notification).toEqual({ title: 't', body: 'b', channelId: 'okr_default' });
  });
});

// Native iOS shows NOTHING for a background push (apns-push-type background, content-available) —
// TestFlight build 4: only an alert push produced a banner and the icon badge (spec 1.10 Phase 3).
describe('appleDisplay', () => {
  it('sends a visible alert with title, body and sound', () => {
    expect(appleDisplay('Seeclub Stäfa · Training', 'Fällt aus')).toEqual({
      headers: { 'apns-priority': '10', 'apns-push-type': 'alert' },
      payload: { aps: { alert: { title: 'Seeclub Stäfa · Training', body: 'Fällt aus' }, sound: 'default' } },
    });
  });

  it('adds the badge only when the sender knows its part', () => {
    expect(appleDisplay('t', 'b', 3).payload?.aps).toMatchObject({ badge: 3 });
    expect(appleDisplay('t', 'b', 0).payload?.aps).toMatchObject({ badge: 0 });
    expect(appleDisplay('t', 'b').payload?.aps).not.toHaveProperty('badge');
  });

  // An alert combined with content-available is undefined per Apple (see the chat push).
  it('never marks the alert as a background push', () => {
    expect(appleDisplay('t', 'b', 1).payload?.aps).not.toHaveProperty('content-available');
  });
});

describe('buildTokenMessage / nativeChannelFor (1.127 B1)', () => {
  const data = { type: 'chat', tenantId: 'scs', title: 'T', body: 'B', url: '/x' };
  const entry = { token: 'tok', uid: 'u', docId: 'd' };

  it('buildTokenMessage gives an android token its kind channel', () => {
    const m = buildTokenMessage({ ...entry, platform: 'android' }, data, 4, { priority: 'normal' });
    expect(m.android?.notification?.channelId).toBe('okr_chat');
    expect(m.android?.notification?.notificationCount).toBe(4);
    expect(m.token).toBe('tok');
  });

  it('old token keeps okr_default and no badge-only push', () => {
    const m = buildTokenMessage(entry, data, undefined, { priority: 'normal' });
    expect(m.android?.notification?.channelId).toBe('okr_default');
    expect(m.data).toEqual(data);
  });

  it('badge undefined leaves aps.badge and notification_count out; 0 sets aps.badge 0', () => {
    const none = buildTokenMessage({ ...entry, platform: 'ios' }, data, undefined, { priority: 'normal' });
    expect((none.apns?.payload?.aps as Record<string, unknown>)['badge']).toBeUndefined();
    expect(none.android?.notification && 'notificationCount' in none.android.notification).toBe(false);
    const zero = buildTokenMessage({ ...entry, platform: 'ios' }, data, 0, { priority: 'normal' });
    expect((zero.apns?.payload?.aps as Record<string, unknown>)['badge']).toBe(0);
  });

  it('nativeChannelFor maps sender types', () => {
    expect(nativeChannelFor('chat')).toBe('okr_chat');
    expect(nativeChannelFor('video-call')).toBe('okr_call');
    expect(nativeChannelFor('task')).toBe('okr_tasks');
    expect(nativeChannelFor('calevent')).toBe('okr_events');
    expect(nativeChannelFor('file-transfer')).toBe('okr_default');
    expect(nativeChannelFor('trackRequest')).toBe('okr_default');
    expect(nativeChannelFor('whatever')).toBe('okr_default');
  });
});
