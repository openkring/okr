import { describe, expect, it } from 'vitest';
import { MAIL_SECTION_TYPES, SectionModel } from '@okr/shared-models';
import { mailPageHasContent, mailPageRefusalKey, mailSectionCategory, newMailPage, sectionSummary } from './mail-page.util';

const article = (html: string): SectionModel => ({ type: 'article', content: { htmlContent: html }, properties: {} } as unknown as SectionModel);
const button = (url: string, label = 'Los'): SectionModel =>
  ({ type: 'button', properties: { action: { url, altText: '' }, style: { label } } } as unknown as SectionModel);
const events = (name: string): SectionModel => ({ type: 'events', name } as unknown as SectionModel);
const imageArticle = (image: Record<string, string>): SectionModel =>
  ({ type: 'article', content: { htmlContent: '' }, properties: { images: [image] } } as unknown as SectionModel);

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
    expect(mailPageHasContent([button('/club')])).toBe(true); // the server makes an app path absolute
    expect(mailPageHasContent([button('//evil.org')])).toBe(false);
    expect(mailPageHasContent([button('club.html')])).toBe(false);
    expect(mailPageHasContent([button('javascript:alert(1)')])).toBe(false);
  });
  it('counts an article image only when the server resolves it, or by its alt text', () => {
    expect(mailPageHasContent([imageArticle({ url: 'tenant/scs/pic.jpg' })])).toBe(true);
    expect(mailPageHasContent([imageArticle({ url: 'https://example.org/pic.jpg' })])).toBe(true);
    expect(mailPageHasContent([imageArticle({ url: 'http://example.org/pic.jpg' })])).toBe(false);
    expect(mailPageHasContent([imageArticle({ url: '   ' })])).toBe(false);
    expect(mailPageHasContent([imageArticle({ url: 'http://example.org/pic.jpg', altText: 'Boot' })])).toBe(true);
    expect(mailPageHasContent([imageArticle({ url: '', label: 'Boot' })])).toBe(true);
  });
  it('counts the intro and the button of an article', () => {
    const cta = (url: string, label = 'Los'): SectionModel =>
      ({ type: 'article', content: { htmlContent: '' }, properties: { images: [], cta: { label, url, style: 'primary' } } } as unknown as SectionModel);
    expect(mailPageHasContent([{ ...article(''), intro: 'Hallo' } as SectionModel])).toBe(true);
    expect(mailPageHasContent([{ ...article(''), intro: '  ' } as SectionModel])).toBe(false);
    expect(mailPageHasContent([cta('https://a.ch')])).toBe(true);
    expect(mailPageHasContent([cta('/club')])).toBe(true);
    expect(mailPageHasContent([cta('https://a.ch', '')])).toBe(false);
    expect(mailPageHasContent([cta('#top')])).toBe(false);
  });
  it('never counts an events section: the server needs upcoming events, which the client does not load', () => {
    expect(mailPageHasContent([events('cal1')])).toBe(false);
    expect(mailPageHasContent([events('')])).toBe(false);
    expect(mailPageHasContent([events('cal1'), article('<p></p>')])).toBe(false);
    expect(mailPageHasContent([events('cal1'), article('<p>Hi</p>')])).toBe(true);
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
  it('falls back to the intro, then the button label of an article without text', () => {
    expect(sectionSummary({ ...article(''), intro: 'Hallo' } as SectionModel)).toBe('Hallo');
    expect(sectionSummary({ type: 'article', content: { htmlContent: '' }, properties: { cta: { label: 'Los', url: '/x' } } } as unknown as SectionModel)).toBe('Los');
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

describe('mailPageRefusalKey', () => {
  const refusal = (message: string, code = 'functions/failed-precondition') => ({ code, message });

  it('maps each page refusal to its message', () => {
    expect(mailPageRefusalKey(refusal('no-content'))).toBe('page_refused_no_content');
    expect(mailPageRefusalKey(refusal('sent'))).toBe('page_refused_sent');
    expect(mailPageRefusalKey(refusal('not-found'))).toBe('page_refused_gone');
    expect(mailPageRefusalKey(refusal('foreign'))).toBe('page_refused_gone');
    expect(mailPageRefusalKey(refusal('unknown-section-type'))).toBe('page_refused_section');
  });
  it('accepts the code without the functions/ prefix', () => {
    expect(mailPageRefusalKey(refusal('sent', 'failed-precondition'))).toBe('page_refused_sent');
  });
  it('leaves every other error to the caller', () => {
    expect(mailPageRefusalKey(refusal('price-changed'))).toBeUndefined();
    expect(mailPageRefusalKey(refusal('insufficient-credit'))).toBeUndefined();
    expect(mailPageRefusalKey(refusal('toString'))).toBeUndefined();
    expect(mailPageRefusalKey(refusal('no-content', 'functions/internal'))).toBeUndefined();
    expect(mailPageRefusalKey(new Error('no-content'))).toBeUndefined();
    expect(mailPageRefusalKey(undefined)).toBeUndefined();
    expect(mailPageRefusalKey('no-content')).toBeUndefined();
  });
});
