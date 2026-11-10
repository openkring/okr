import { describe, expect, it } from 'vitest';
import { courseAnswerPageParams, courseAnswerTenantOk, decideCourseAnswer, tenantGroupAdminKeys } from './course-answer';
import { courseAnswerNotice, courseAnswerPage, courseAnswerResultPage, COURSE_REFUSAL_TEXT } from './course-mail';

const app = { courseKey: 'c1', courseState: 'invited', tenants: ['scs'], firstName: 'Anna', lastName: 'Muster' };
const course = { name: 'Juniorenkurs', startDate: '20261101', endDate: '20261130', tenants: ['scs'] };
const TODAY = '20261110';

describe('decideCourseAnswer', () => {
  it('allows an invited application on its course', () => expect(decideCourseAnswer(app, course, 'c1', true, TODAY)).toBeUndefined());
  it('allows changing an earlier answer', () => {
    expect(decideCourseAnswer({ ...app, courseState: 'accepted' }, course, 'c1', true, TODAY)).toBeUndefined();
    expect(decideCourseAnswer({ ...app, courseState: 'declined' }, course, 'c1', true, TODAY)).toBeUndefined();
  });
  it('allows answering on the last day', () => expect(decideCourseAnswer(app, course, 'c1', true, '20261130')).toBeUndefined());
  it('refuses a missing or archived application', () => {
    expect(decideCourseAnswer(undefined, course, 'c1', true, TODAY)).toBe('not-found');
    expect(decideCourseAnswer({ ...app, isArchived: true }, course, 'c1', true, TODAY)).toBe('not-found');
  });
  it('refuses a tenant mismatch', () => expect(decideCourseAnswer(app, course, 'c1', false, TODAY)).toBe('not-found'));
  it('refuses an application that was never invited', () => {
    expect(decideCourseAnswer({ ...app, courseState: 'registered' }, course, 'c1', true, TODAY)).toBe('not-found');
    expect(decideCourseAnswer({ ...app, courseState: '' }, course, 'c1', true, TODAY)).toBe('not-found');
  });
  it('refuses an old application document without course fields', () =>
    expect(decideCourseAnswer({ tenants: ['scs'] }, course, 'c1', true, TODAY)).toBe('moved'));
  it('refuses an application moved to another course', () =>
    expect(decideCourseAnswer({ ...app, courseKey: 'c2' }, course, 'c1', true, TODAY)).toBe('moved'));
  it('refuses a missing or archived course', () => {
    expect(decideCourseAnswer(app, undefined, 'c1', true, TODAY)).toBe('not-found');
    expect(decideCourseAnswer(app, { ...course, isArchived: true }, 'c1', true, TODAY)).toBe('not-found');
  });
  it('refuses an ended course', () => expect(decideCourseAnswer(app, course, 'c1', true, '20261201')).toBe('ended'));
  it('falls back to the start date when the course has no end date', () => {
    expect(decideCourseAnswer(app, { ...course, endDate: '' }, 'c1', true, '20261101')).toBeUndefined();
    expect(decideCourseAnswer(app, { ...course, endDate: '' }, 'c1', true, '20261102')).toBe('ended');
  });
});

describe('decideCourseAnswer — the application itself was refused or withdrawn', () => {
  it('refuses a denied or cancelled application as not found', () => {
    expect(decideCourseAnswer({ ...app, state: 'closed.denied' }, course, 'c1', true, TODAY)).toBe('not-found');
    expect(decideCourseAnswer({ ...app, state: 'closed.cancelled' }, course, 'c1', true, TODAY)).toBe('not-found');
  });
  it('still lets an approved or open application answer', () => {
    expect(decideCourseAnswer({ ...app, state: 'closed.approved' }, course, 'c1', true, TODAY)).toBeUndefined();
    expect(decideCourseAnswer({ ...app, state: 'applied' }, course, 'c1', true, TODAY)).toBeUndefined();
  });
});

describe('tenantGroupAdminKeys', () => {
  it('returns the admins only when the group belongs to the tenant', () => {
    expect(tenantGroupAdminKeys({ tenants: ['scs'], adminKeys: ['p1', 'p1', 'p2'] }, 'scs')).toEqual(['p1', 'p2']);
    expect(tenantGroupAdminKeys({ tenants: ['other'], adminKeys: ['p1'] }, 'scs')).toEqual([]);
    expect(tenantGroupAdminKeys({ adminKeys: ['p1'] }, 'scs')).toEqual([]);
    expect(tenantGroupAdminKeys(undefined, 'scs')).toEqual([]);
    expect(tenantGroupAdminKeys({ tenants: ['scs'], adminKeys: ['p1'] }, '')).toEqual([]);
  });
});

describe('courseAnswerPageParams — what the link page shows', () => {
  const full = {
    ...app, firstName: 'Anna', lastName: 'Verborgen', email: 'anna.verborgen@example.org', phone: '+41 79 555 12 34',
    dateOfBirth: '20120317', ssnId: '756.1234.5678.97', streetName: 'Geheimweg', city: 'Hintertupf',
    parentEmail: 'eltern@example.org', parentPhone: '+41 44 999 88 77',
  };
  const params = courseAnswerPageParams({ appName: 'Seeclub' }, full, course, {
    postUrl: 'https://x/courseAnswer', courseKey: 'c1', applicationKey: 'a1', signature: 'sig',
  });
  const page = courseAnswerPage(params);
  it('carries the first name, the course and the link', () => {
    expect(page).toContain('Anna');
    expect(page).toContain('Juniorenkurs');
    expect(params).toMatchObject({ courseKey: 'c1', applicationKey: 'a1', signature: 'sig', state: 'invited' });
  });
  it('contains no other personal data of the application', () => {
    for (const v of ['Verborgen', 'anna.verborgen@example.org', '+41 79 555 12 34', '20120317', '17.03.2012', '756.1234.5678.97',
      'Geheimweg', 'Hintertupf', 'eltern@example.org', '+41 44 999 88 77']) {
      expect(page).not.toContain(v);
    }
  });
});

describe('courseAnswerTenantOk', () => {
  it('needs the application tenant on the course', () => {
    expect(courseAnswerTenantOk(app, course)).toBe(true);
    expect(courseAnswerTenantOk(app, { ...course, tenants: ['other'] })).toBe(false);
    expect(courseAnswerTenantOk({ ...app, tenants: [] }, course)).toBe(false);
    expect(courseAnswerTenantOk(undefined, course)).toBe(false);
    expect(courseAnswerTenantOk(app, undefined)).toBe(false);
  });
});

describe('courseAnswerPage', () => {
  const page = courseAnswerPage({
    appName: 'Seeclub', firstName: 'Anna', courseName: 'Juniorenkurs', startDate: '20261101', endDate: '20261130',
    state: 'invited', postUrl: 'https://x/courseAnswer', courseKey: 'c1', applicationKey: 'a1', signature: 'sig',
  });
  it('greets by first name and names the course with its dates', () => {
    expect(page).toContain('Hallo Anna');
    expect(page).toContain('Juniorenkurs');
    expect(page).toContain('01.11.2026');
    expect(page).toContain('30.11.2026');
  });
  it('shows nothing else from the application', () => {
    expect(page).not.toContain('Muster');
    expect(page).not.toContain('@');
    expect(page).not.toMatch(/\+41|07\d/);
  });
  it('offers both answers and posts c, a and s', () => {
    expect(page).toContain('value="accept"');
    expect(page).toContain('value="decline"');
    expect(page).toContain('name="c" value="c1"');
    expect(page).toContain('name="a" value="a1"');
    expect(page).toContain('name="s" value="sig"');
    expect(page).toContain('method="post"');
  });
  it('shows the current answer', () => {
    const accepted = courseAnswerPage({ appName: '', firstName: 'Anna', courseName: 'K', startDate: '', endDate: '', state: 'accepted', postUrl: 'u', courseKey: 'c', applicationKey: 'a', signature: 's' });
    expect(accepted).toContain('bereits zugesagt');
    expect(page).not.toContain('bereits');
  });
  it('escapes user text', () => {
    const evil = courseAnswerPage({ appName: '', firstName: '<script>', courseName: '"x"', startDate: '', endDate: '', postUrl: 'u', courseKey: 'c', applicationKey: 'a', signature: 's' });
    expect(evil).not.toContain('<script>');
    expect(evil).toContain('&lt;script&gt;');
  });
});

describe('courseAnswerResultPage and refusal texts', () => {
  it('shows title and message', () => {
    const html = courseAnswerResultPage({ appName: 'Seeclub', title: 'Danke', message: 'Gespeichert.' });
    expect(html).toContain('Danke');
    expect(html).toContain('Gespeichert.');
  });
  it('the refusal for a bad link carries no data and no app hint', () => {
    expect(COURSE_REFUSAL_TEXT.invalid.message).not.toMatch(/App/);
    const html = courseAnswerResultPage({ appName: '', ...COURSE_REFUSAL_TEXT.invalid });
    expect(html).not.toContain('Hallo');
  });
});

describe('courseAnswerNotice', () => {
  it('says who accepted which course', () => {
    const { subject, html } = courseAnswerNotice({ firstName: 'Anna', lastName: 'Muster', courseName: 'Juniorenkurs', answer: 'accepted' });
    expect(subject).toBe('Anna Muster hat für Juniorenkurs zugesagt');
    expect(html).toContain('Anna Muster');
  });
  it('says who declined', () => {
    expect(courseAnswerNotice({ firstName: 'Anna', lastName: 'Muster', courseName: 'K', answer: 'declined' }).subject).toBe('Anna Muster hat für K abgesagt');
  });
});
