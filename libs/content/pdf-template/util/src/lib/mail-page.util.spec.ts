import { describe, expect, it } from 'vitest';
import { MAIL_SECTION_TYPES, SectionModel } from '@okr/shared-models';
import { mailPageHasContent, mailSectionCategory, newMailPage, sectionSummary } from './mail-page.util';

const article = (html: string): SectionModel => ({ type: 'article', content: { htmlContent: html }, properties: {} } as unknown as SectionModel);
const button = (url: string, label = 'Los'): SectionModel =>
  ({ type: 'button', properties: { action: { url, altText: '' }, style: { label } } } as unknown as SectionModel);
const events = (name: string): SectionModel => ({ type: 'events', name } as unknown as SectionModel);

describe('newMailPage', () => {
  it('is a mail page with one tenant, the sender, createdAt and no mailingKey', () => {
    const p = newMailPage('scs', 'uid1');
    expect(p.type).toBe('mail');
    expect(p.tenants).toEqual(['scs']);
    expect(p.senderUid).toBe('uid1');
    expect(Number.isNaN(Date.parse(p.createdAt))).toBe(false);
    expect('mailingKey' in p).toBe(false);
    expect('groupKey' in p).toBe(false);
  });
  it('sets groupKey only when given', () => {
    expect(newMailPage('scs', 'u', 'g1').groupKey).toBe('g1');
  });
});

describe('mailPageHasContent', () => {
  it('is false for an empty page and an empty article', () => {
    expect(mailPageHasContent([])).toBe(false);
    expect(mailPageHasContent([article('<p></p>')])).toBe(false);
    expect(mailPageHasContent([article('<p>&nbsp;</p>')])).toBe(false);
  });
  it('is true for text or an image', () => {
    expect(mailPageHasContent([article('<p>Hi</p>')])).toBe(true);
    expect(mailPageHasContent([article('<img src="x">')])).toBe(true);
  });
  it('counts a button only with a safe url', () => {
    expect(mailPageHasContent([button('https://a.ch')])).toBe(true);
    expect(mailPageHasContent([button('mailto:a@b.ch')])).toBe(true);
    expect(mailPageHasContent([button('/relative')])).toBe(false);
    expect(mailPageHasContent([button('javascript:alert(1)')])).toBe(false);
  });
  it('counts an events section with a calendar name', () => {
    expect(mailPageHasContent([events('cal1')])).toBe(true);
    expect(mailPageHasContent([events('')])).toBe(false);
  });
  it('ignores archived sections', () => {
    expect(mailPageHasContent([{ ...article('<p>Hi</p>'), isArchived: true } as SectionModel])).toBe(false);
  });
});

describe('sectionSummary', () => {
  it('strips tags and truncates an article at 60 chars', () => {
    const s = sectionSummary(article('<p><b>' + 'a'.repeat(100) + '</b></p>'));
    expect(s).toBe('a'.repeat(60));
  });
  it('gives the button label and the calendar name', () => {
    expect(sectionSummary(button('https://a.ch', 'Anmelden'))).toBe('Anmelden');
    expect(sectionSummary(events('cal1'))).toBe('cal1');
  });
});

describe('mailSectionCategory', () => {
  it('lists the mail section types', () => {
    const c = mailSectionCategory('scs');
    expect(c.name).toBe('section_type');
    expect(c.i18n).toBe('@cms/section/feature.section_type');
    expect(c.items.map(i => i.name)).toEqual([...MAIL_SECTION_TYPES]);
  });
});
