import { describe, expect, it } from 'vitest';

import { isUsableEmailTemplate, layoutHasContent, resetLinkPresent } from './render-email.logic';

describe('isUsableEmailTemplate', () => {
  const ok = { kind: 'emailText', tenants: ['system'], currentVersion: 1 } as const;

  it('rejects archived, draft-only and foreign templates', () => {
    expect(isUsableEmailTemplate(ok, 'system', 'emailText')).toBe(true);
    expect(isUsableEmailTemplate({ ...ok, currentVersion: 0 }, 'system', 'emailText')).toBe(false);
    expect(isUsableEmailTemplate({ ...ok, isArchived: true }, 'system', 'emailText')).toBe(false);
    expect(isUsableEmailTemplate({ ...ok, tenants: ['p13'] }, 'system', 'emailText')).toBe(false);
    expect(isUsableEmailTemplate({ ...ok, kind: 'emailLayout' }, 'system', 'emailText')).toBe(false);
  });

  it('wants the expected owner as the only entry of tenants', () => {
    expect(isUsableEmailTemplate({ ...ok, tenants: ['scs'] }, 'scs', 'emailText')).toBe(true);
    expect(isUsableEmailTemplate({ ...ok, tenants: ['p13', 'scs'] }, 'scs', 'emailText')).toBe(false);
    expect(isUsableEmailTemplate({ ...ok, tenants: ['scs', 'scs'] }, 'scs', 'emailText')).toBe(false);
    expect(isUsableEmailTemplate({ ...ok, tenants: ['p13', 'system'] }, 'system', 'emailText')).toBe(false);
    expect(isUsableEmailTemplate({ ...ok, tenants: ['system'] }, 'scs', 'emailText')).toBe(false);
    expect(isUsableEmailTemplate({ ...ok, tenants: undefined }, 'scs', 'emailText')).toBe(false);
  });

  it('reads a legacy doc without kind as pdf', () => {
    expect(isUsableEmailTemplate({ tenants: ['scs'], currentVersion: 1 }, 'scs', 'pdf')).toBe(true);
    expect(isUsableEmailTemplate({ tenants: ['scs'], currentVersion: 1 }, 'scs', 'emailText')).toBe(false);
    expect(isUsableEmailTemplate(undefined, 'scs', 'emailText')).toBe(false);
  });
});

describe('resetLinkPresent', () => {
  it('requires the link in both halves, escaped or raw in HTML', () => {
    const link = 'https://a.ch/?a=1&b=2';
    const escaped = 'https://a.ch/?a&#x3D;1&amp;b&#x3D;2';
    expect(resetLinkPresent({ html: escaped, text: link }, link, escaped)).toBe(true);
    expect(resetLinkPresent({ html: link, text: link }, link, escaped)).toBe(true);
    expect(resetLinkPresent({ html: link, text: escaped }, link, escaped)).toBe(false);
    expect(resetLinkPresent({ html: 'x', text: link }, link, escaped)).toBe(false);
  });
});

describe('layoutHasContent', () => {
  it('detects the content slot', () => {
    expect(layoutHasContent('<td>{{{ content }}}</td>')).toBe(true);
    expect(layoutHasContent('<td>{{content}}</td>')).toBe(false);
  });
});
