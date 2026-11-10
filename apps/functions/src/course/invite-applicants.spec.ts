import { describe, expect, it, vi } from 'vitest';
import { HttpsError } from 'firebase-functions/v2/https';

import {
  decideInvite,
  inviteOneApplication,
  inviteRecipients,
  mayManageCourseServer,
  safeErrorFields,
  parseInviteRequest,
  visibleApplicants,
} from './invite-applicants';
import { courseInvitationMail } from './course-mail';

const course = { okey: 'c1', name: 'Juniorenkurs', audience: ['youth'], tenants: ['scs'], groupKey: 'g1', responsiblePersons: [{ key: 'pR' }] };

/** A raw application as Firestore returns it, including the PII the rows must never carry. */
const app = (okey: string, extra: Record<string, unknown> = {}): Record<string, unknown> & { okey: string } => ({
  okey,
  tenants: ['scs'],
  firstName: `F${okey}`,
  lastName: `L${okey}`,
  applicationAs: 'youth',
  state: 'applied',
  dateOfBirth: '20120315',
  email: `${okey}@example.ch`,
  parentEmail: '',
  streetName: 'Seestrasse', streetNumber: '1', zipCode: '8000', city: 'Zürich',
  ssnId: '756.1234.5678.97',
  phone: '+41 79 000 00 00',
  properties: [{ key: 'rowingExperience', value: 'ja' }],
  ...extra,
});

describe('visibleApplicants (D7)', () => {
  const apps = [
    app('a1'),                                                      // youth, open
    app('a2', { applicationAs: 'adult' }),                          // adult, not on the course
    app('a3', { applicationAs: 'adult', courseKey: 'c1', courseState: 'registered' }), // adult ON the course
    app('a4', { state: 'closed.approved' }),                        // closed
    app('a5', { isArchived: true }),                                // archived
    app('a6', { applicationAs: 'transfer', state: 'reviewing' }),   // transfer, open
  ];

  it('a non-privileged manager sees only applicants on the course or in its audience', () => {
    const keys = visibleApplicants(apps, course, false).map(r => r.key);
    expect(keys).toEqual(expect.arrayContaining(['a1', 'a3']));
    expect(keys).not.toContain('a2');
    expect(keys).not.toContain('a6');
    expect(keys).toHaveLength(2);
  });

  it('a privileged user sees all open applicants', () => {
    const keys = visibleApplicants(apps, course, true).map(r => r.key).sort();
    expect(keys).toEqual(['a1', 'a2', 'a3', 'a6']);
  });

  it('never lists closed or archived applications', () => {
    const keys = visibleApplicants(apps, course, true).map(r => r.key);
    expect(keys).not.toContain('a4');
    expect(keys).not.toContain('a5');
  });

  it('rows carry name, type, age, course and state only — no address, AHV, contact or properties', () => {
    const rows = visibleApplicants(apps, course, true, { c1: 'Juniorenkurs' }, 2026);
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual(['age', 'applicationAs', 'courseKey', 'courseName', 'courseState', 'firstName', 'key', 'lastName', 'lockedReason']);
    }
    const a1 = rows.find(r => r.key === 'a1');
    expect(a1).toEqual({ key: 'a1', firstName: 'Fa1', lastName: 'La1', applicationAs: 'youth', age: 14, courseKey: '', courseName: '', courseState: '', lockedReason: '' });
    expect(rows.find(r => r.key === 'a3')).toMatchObject({ courseKey: 'c1', courseName: 'Juniorenkurs', courseState: 'registered' });
  });

  it('tolerates old documents without course fields or date of birth', () => {
    const rows = visibleApplicants([{ okey: 'x', tenants: ['scs'], state: 'applied' }], { okey: 'c1' }, true);
    expect(rows).toEqual([{ key: 'x', firstName: '', lastName: '', applicationAs: 'adult', age: null, courseKey: '', courseName: '', courseState: '', lockedReason: '' }]);
  });

  it('an unknown age is null, never undefined (the callable would send null anyway)', () => {
    const [row] = visibleApplicants([app('a1', { dateOfBirth: '' })], course, true);
    expect(row.age).toBeNull();
  });

  it('locks, for a non-privileged manager, a visible applicant holding a place on another course', () => {
    const onOther = app('a7', { courseKey: 'c2', courseState: 'accepted' });
    const rows = visibleApplicants([onOther], course, false, { c2: 'Skiff 2' });
    expect(rows).toHaveLength(1);   // D7 visibility unchanged
    expect(rows[0]).toMatchObject({ key: 'a7', courseName: 'Skiff 2', lockedReason: 'on-other-course' });
  });

  it('does not lock a privileged user, nor an applicant whose other course state holds no place', () => {
    expect(visibleApplicants([app('a7', { courseKey: 'c2', courseState: 'accepted' })], course, true)[0].lockedReason).toBe('');
    expect(visibleApplicants([app('a8', { courseKey: 'c2', courseState: 'declined' })], course, false)[0].lockedReason).toBe('');
    expect(visibleApplicants([app('a9', { courseKey: 'c1', courseState: 'registered' })], course, false)[0].lockedReason).toBe('');
  });

  it('a course without audience shows a non-privileged manager only its own applicants', () => {
    const keys = visibleApplicants(apps, { okey: 'c1' }, false).map(r => r.key);
    expect(keys).toEqual(['a3']);
  });

  it('sorts by last name, then first name', () => {
    const rows = visibleApplicants([
      app('b', { lastName: 'Zürcher', firstName: 'Anna' }),
      app('a', { lastName: 'Ämmer', firstName: 'Ben' }),
      app('c', { lastName: 'Ämmer', firstName: 'Alma' }),
    ], course, true);
    expect(rows.map(r => r.key)).toEqual(['c', 'a', 'b']);
  });
});

describe('mayManageCourseServer', () => {
  it('privileged and admin may manage any course', () => {
    expect(mayManageCourseServer(course, 'pX', { privileged: true }, [])).toBe(true);
    expect(mayManageCourseServer(course, 'pX', { admin: true }, [])).toBe(true);
  });
  it('a responsible person may manage', () => expect(mayManageCourseServer(course, 'pR', {}, [])).toBe(true));
  it('an admin of the course group may manage', () => expect(mayManageCourseServer(course, 'pG', {}, ['pG'])).toBe(true));
  it('anybody else may not (permission-denied)', () => {
    expect(mayManageCourseServer(course, 'pX', { memberAdmin: true, treasurer: true }, ['pG'])).toBe(false);
    expect(mayManageCourseServer(course, '', {}, [''])).toBe(false);
    expect(mayManageCourseServer({ okey: 'c1' }, 'pR', {}, [])).toBe(false);
  });
  it('a role must be exactly true', () => expect(mayManageCourseServer(course, 'pX', { privileged: 'true' }, [])).toBe(false));
});

describe('parseInviteRequest', () => {
  const keys = (n: number) => Array.from({ length: n }, (_, i) => `k${i}`);
  it('accepts up to 100 keys and drops duplicates', () => {
    expect(parseInviteRequest({ courseKey: 'c1', applicationKeys: keys(100) }).applicationKeys).toHaveLength(100);
    expect(parseInviteRequest({ courseKey: 'c1', applicationKeys: ['a', 'a', 'b'] }).applicationKeys).toEqual(['a', 'b']);
  });
  it('refuses more than 100 keys with invalid-argument', () => {
    expect(() => parseInviteRequest({ courseKey: 'c1', applicationKeys: keys(101) })).toThrow(HttpsError);
    try { parseInviteRequest({ courseKey: 'c1', applicationKeys: keys(101) }); } catch (e) { expect((e as HttpsError).code).toBe('invalid-argument'); }
  });
  it('refuses a missing course, a missing or empty key list and bad keys', () => {
    for (const data of [
      undefined, {}, { courseKey: '', applicationKeys: ['a'] }, { courseKey: 'c/1', applicationKeys: ['a'] },
      { courseKey: 'c1' }, { courseKey: 'c1', applicationKeys: [] }, { courseKey: 'c1', applicationKeys: [3] },
      { courseKey: 'c1', applicationKeys: ['a/b'] },
    ]) {
      expect(() => parseInviteRequest(data)).toThrow(HttpsError);
    }
  });
});

describe('inviteRecipients (application spec §6.2 TO/CC)', () => {
  it('youth with both addresses: TO the applicant, CC the parent', () =>
    expect(inviteRecipients({ applicationAs: 'youth', email: 'kid@x.ch', parentEmail: 'mum@x.ch' })).toEqual({ to: 'kid@x.ch', cc: ['mum@x.ch'] }));
  it('youth with only the parent address: TO the parent', () =>
    expect(inviteRecipients({ applicationAs: 'youth', email: '', parentEmail: 'mum@x.ch' })).toEqual({ to: 'mum@x.ch', cc: [] }));
  it('youth with only the own address: TO the applicant', () =>
    expect(inviteRecipients({ applicationAs: 'youth', email: 'kid@x.ch' })).toEqual({ to: 'kid@x.ch', cc: [] }));
  it('adult: TO the applicant, never a parent CC', () =>
    expect(inviteRecipients({ applicationAs: 'adult', email: 'a@x.ch', parentEmail: 'mum@x.ch' })).toEqual({ to: 'a@x.ch', cc: [] }));
  it('no e-mail and no parent e-mail → nobody', () => {
    expect(inviteRecipients({ applicationAs: 'youth', email: '', parentEmail: '' })).toBeUndefined();
    expect(inviteRecipients({ applicationAs: 'adult', email: ' ' })).toBeUndefined();
    expect(inviteRecipients({})).toBeUndefined();
  });
  it('the same address twice is not copied to itself', () =>
    expect(inviteRecipients({ applicationAs: 'youth', email: 'f@x.ch', parentEmail: 'F@x.ch' })).toEqual({ to: 'f@x.ch', cc: [] }));
});

describe('decideInvite', () => {
  it('invites an open application the caller may see', () => expect(decideInvite(app('a1'), 'scs', course, false)).toBeUndefined());
  it('a missing, archived or other-tenant application is not-found', () => {
    expect(decideInvite(undefined, 'scs', course, true)).toBe('not-found');
    expect(decideInvite(app('a1', { isArchived: true }), 'scs', course, true)).toBe('not-found');
    expect(decideInvite(app('a1', { tenants: ['p13'] }), 'scs', course, true)).toBe('not-found');
  });
  it('an applicant a non-privileged manager could not see is not-found, even when closed', () => {
    expect(decideInvite(app('a2', { applicationAs: 'adult' }), 'scs', course, false)).toBe('not-found');
    expect(decideInvite(app('a2', { applicationAs: 'adult', state: 'closed.denied' }), 'scs', course, false)).toBe('not-found');
    expect(decideInvite(app('a2', { applicationAs: 'adult' }), 'scs', course, true)).toBeUndefined();
  });
  it('a closed application is closed', () => {
    expect(decideInvite(app('a1', { state: 'closed.approved' }), 'scs', course, false)).toBe('closed');
    expect(decideInvite(app('a1', { state: 'closed.cancelled' }), 'scs', course, true)).toBe('closed');
  });
});

describe('decideInvite — applicant on another course', () => {
  const onOther = app('a7', { courseKey: 'c2', courseState: 'invited' });
  it('a non-privileged manager may not move them (on-other-course)', () =>
    expect(decideInvite(onOther, 'scs', course, false)).toBe('on-other-course'));
  it('a privileged user may', () => expect(decideInvite(onOther, 'scs', course, true)).toBeUndefined());
  it('a declined place on the other course does not hold them', () =>
    expect(decideInvite(app('a7', { courseKey: 'c2', courseState: 'declined' }), 'scs', course, false)).toBeUndefined());
});

describe('inviteOneApplication', () => {
  const deps = (over: Partial<Parameters<typeof inviteOneApplication>[4]> = {}) => ({
    send: vi.fn(async () => undefined),
    update: vi.fn(async () => undefined),
    now: () => new Date('2026-11-10T09:30:00Z'),
    log: vi.fn(),
    ...over,
  });

  it('mails first, then writes courseKey, invited, invitedAt (Zurich) and clears answeredAt', async () => {
    const d = deps();
    expect(await inviteOneApplication(app('a1', { parentEmail: 'mum@x.ch' }), 'scs', course, false, d)).toBeUndefined();
    expect(d.send).toHaveBeenCalledWith({ to: 'a1@example.ch', cc: ['mum@x.ch'] }, 'Fa1');
    expect(d.update).toHaveBeenCalledWith({ courseKey: 'c1', courseState: 'invited', invitedAt: '20261110103000', answeredAt: '' });
  });

  it('no address → no-email, nothing sent, nothing written', async () => {
    const d = deps();
    expect(await inviteOneApplication(app('a1', { email: '', parentEmail: '' }), 'scs', course, false, d)).toBe('no-email');
    expect(d.send).not.toHaveBeenCalled();
    expect(d.update).not.toHaveBeenCalled();
  });

  it('a failed mail → mail-failed, state unchanged, only safe fields logged', async () => {
    const d = deps({ send: vi.fn(async () => { throw Object.assign(new Error('550 rejected a1@example.ch'), { code: 'EENVELOPE', responseCode: 550 }); }) });
    expect(await inviteOneApplication(app('a1'), 'scs', course, false, d)).toBe('mail-failed');
    expect(d.update).not.toHaveBeenCalled();
    expect(d.log).toHaveBeenCalledWith(expect.any(String), { code: 'EENVELOPE', responseCode: 550 });
    expect(JSON.stringify(d.log.mock.calls)).not.toContain('@');
  });

  it('a failed write after the mail → write-failed, never throws (the batch goes on)', async () => {
    const d = deps({ update: vi.fn(async () => { throw Object.assign(new Error('deadline'), { code: 4 }); }) });
    await expect(inviteOneApplication(app('a1'), 'scs', course, false, d)).resolves.toBe('write-failed');
    expect(d.send).toHaveBeenCalledTimes(1);
    expect(d.log).toHaveBeenCalledWith(expect.any(String), { code: 4 });
  });

  it('a refusal sends nothing', async () => {
    const d = deps();
    expect(await inviteOneApplication(app('a7', { courseKey: 'c2', courseState: 'registered' }), 'scs', course, false, d)).toBe('on-other-course');
    expect(await inviteOneApplication(undefined, 'scs', course, true, d)).toBe('not-found');
    expect(d.send).not.toHaveBeenCalled();
  });
});

describe('safeErrorFields', () => {
  it('keeps code and responseCode only — no message, no object', () => {
    expect(safeErrorFields(Object.assign(new Error('to a@b.ch failed'), { code: 'EAUTH', responseCode: 535, response: 'a@b.ch' })))
      .toEqual({ code: 'EAUTH', responseCode: 535 });
    expect(safeErrorFields(new Error('a@b.ch'))).toEqual({});
    expect(safeErrorFields(undefined)).toEqual({});
  });
});

describe('courseInvitationMail', () => {
  const mail = courseInvitationMail({
    appName: 'Seeclub', firstName: 'Anna', courseName: 'Skiff <1>', startDate: '20261101', endDate: '20261130',
    answerUrl: 'https://example.test/courseAnswer?c=c1&a=a1&s=sig',
  });
  it('has the subject «Einladung: {course name}»', () => expect(mail.subject).toBe('Einladung: Skiff <1>'));
  it('greets by first name, names the course and dates, links «Antworten», says no login is needed', () => {
    expect(mail.html).toContain('Hallo Anna');
    expect(mail.html).toContain('Skiff &lt;1&gt;');
    expect(mail.html).toContain('01.11.2026 – 30.11.2026');
    expect(mail.html).toContain('>Antworten<');
    expect(mail.html).toContain('href="https://example.test/courseAnswer?c=c1&amp;a=a1&amp;s=sig"');
    expect(mail.html).toMatch(/kein Login/);
  });
});
