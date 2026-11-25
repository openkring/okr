import { describe, expect, it } from 'vitest';

import type { MailEventLine } from '@okr/shared-util-core';

import { sanitizeEmailBody } from '../../pdf/sanitize';
import { letterBodyOf, MAX_CONTENT_BYTES, mailCalendarKeys, renderMailContent, sentContentOf, type MailContent } from './mail-content';
import { noticeBlocks, renderMailBlocks, type MailBlockContext } from './render-mail-blocks.logic';
import { MailPageError, renderMailPageContent, type MailRenderContext, type MailSection } from './render-mail-page.logic';

const EVENTS: Record<string, MailEventLine[]> = { club: [{ date: '04.12.2026', time: '19:00', title: 'Fondue', place: 'Clubhaus' }] };

async function contextOf(): Promise<MailRenderContext & { color: string }> {
  const { default: hb } = await import('handlebars');
  return { hb, sanitize: sanitizeEmailBody, events: EVENTS, appOrigin: 'https://app.example.ch', color: '#014da2' };
}

async function blockContext(target: 'mail' | 'print'): Promise<MailBlockContext> {
  return { ...await contextOf(), target };
}

async function render(order: string[], sections: MailSection[]): Promise<MailContent> {
  return renderMailContent(order, sections, await contextOf());
}

async function refusal(order: string[], sections: MailSection[]): Promise<string> {
  try {
    await render(order, sections);
    return 'rendered';
  } catch (e) {
    return e instanceof MailPageError ? `${e.code} ${e.blockId ?? '-'}` : `not a MailPageError: ${String(e)}`;
  }
}

const text = (id: string, html: string) => ({ id, type: 'text', html });
const button = (id: string, url: string) => ({ id, type: 'button', cta: { label: 'Anmelden', url, style: 'primary' } });
const events = (id: string, calendarKey: unknown = 'club') => ({ id, type: 'events', calendarKey, maxEvents: 5 });
const blockArticle = (okey: string, blocks: unknown, extra: Partial<MailSection> = {}): MailSection =>
  ({ okey, type: 'article', properties: { images: [], blocks }, ...extra }) as MailSection;
const oldArticle = (okey: string, htmlContent: string, extra: Partial<MailSection> = {}): MailSection =>
  ({ okey, type: 'article', content: { htmlContent }, properties: { images: [] }, ...extra });
const oldEvents = (okey: string): MailSection => ({ okey, type: 'events', name: 'club', title: 'Termine' });

describe('renderMailContent: an article with blocks', () => {
  const blocks = [text('t', '<p>Hallo</p>'), button('b', '/club'), events('e')];

  it('gives the mail, the letter and the blocks of the Mitteilung', async () => {
    expect(await render(['a'], [blockArticle('a', blocks)])).toStrictEqual({
      html: (await renderMailBlocks(blocks, await blockContext('mail'))).html,
      letterHtml: (await renderMailBlocks(blocks, await blockContext('print'))).html,
      notice: await noticeBlocks(blocks, await contextOf()),
    });
  });

  it('lists the events in all three', async () => {
    const { html, letterHtml, notice } = await render(['a'], [blockArticle('a', blocks)]);
    expect(html).toContain('Fondue');
    expect(letterHtml).toContain('Fondue');
    expect(JSON.stringify(notice)).toContain('Fondue');
  });

  it('keeps what the mail says: the brand colour in the mail only', async () => {
    const { html, letterHtml } = await render(['a'], [blockArticle('a', blocks)]);
    expect(html).toContain('#014da2');
    expect(letterHtml).not.toContain('background-color:#014da2');
    expect(letterHtml).toContain('https://app.example.ch/club');
  });

  it('counts only the blocks when old fields stand beside them', async () => {
    const both = blockArticle('a', blocks, { title: 'Alter Titel', intro: 'Alte Einleitung', content: { htmlContent: '<p>Alter Text</p>' } });
    const content = await render(['a'], [both]);
    expect(content).toStrictEqual(await render(['a'], [blockArticle('a', blocks)]));
    expect(JSON.stringify(content)).not.toContain('Alte');
  });

  it('is an old section when `blocks` is no list', async () => {
    for (const value of [undefined, null, 'x', {}]) {
      const content = await render(['a'], [oldArticle('a', '<p>Alt</p>', { properties: { images: [], blocks: value } as never })]);
      expect(content).toStrictEqual({ html: await renderMailPageContent(['a'], [oldArticle('a', '<p>Alt</p>')], await contextOf()) });
    }
  });

  it('is an old section when only an unlisted or archived section has blocks', async () => {
    const old = oldArticle('a', '<p>Alt</p>');
    expect(await render(['a'], [old, blockArticle('x', blocks)])).not.toHaveProperty('notice');
    expect(await render(['a', 'x'], [old, blockArticle('x', blocks, { isArchived: true })])).not.toHaveProperty('letterHtml');
  });

  it('changes nothing in a second sanitizer pass but the <p> margin', async () => {
    const { html, letterHtml } = await render(['a'], [blockArticle('a', blocks)]);
    const once = (s: string) => s.replace(/(margin:0 0 16px;?)+/g, '');
    expect(once(await sanitizeEmailBody(html))).toBe(once(html));
    expect(once(await sanitizeEmailBody(letterHtml ?? ''))).toBe(once(letterHtml ?? ''));
  });
});

describe('renderMailContent: blocks beside old sections', () => {
  const sections = [blockArticle('b', [text('t', '<p>Bravo</p>')]), oldArticle('a', '<p>Alpha</p>', { title: 'Titel' }), oldEvents('e')];
  const at = (s: string | undefined, part: string): number => (s ?? '').indexOf(part);

  it('keeps the order of the page in the mail, the letter and the Mitteilung', async () => {
    const { html, letterHtml, notice } = await render(['e', 'b', 'a'], sections);
    for (const part of [html, letterHtml, JSON.stringify(notice)]) {
      expect(at(part, 'Fondue')).toBeGreaterThanOrEqual(0);
      expect(at(part, 'Bravo')).toBeGreaterThan(at(part, 'Fondue'));
      expect(at(part, 'Alpha')).toBeGreaterThan(at(part, 'Bravo'));
    }
  });

  it('takes the old html into the mail, the letter and a text block', async () => {
    const old = await renderMailPageContent(['a'], [sections[1]], await contextOf());
    const { html, letterHtml, notice } = await render(['b', 'a'], sections);
    expect(html).toBe(`${(await renderMailBlocks([text('t', '<p>Bravo</p>')], await blockContext('mail'))).html}\n${old}`);
    expect(letterHtml).toBe(`${(await renderMailBlocks([text('t', '<p>Bravo</p>')], await blockContext('print'))).html}\n${old}`);
    expect(notice?.[1]).toStrictEqual({ id: 'a', type: 'text', html: old });
  });

  it('sanitizes an old section for the Mitteilung', async () => {
    const { notice } = await render(['b', 'a'], [sections[0], oldArticle('a', '<p onclick="x()">Text</p><script>alert(1)</script>')]);
    expect(JSON.stringify(notice)).not.toMatch(/onclick|script/);
  });

  it('has no block for an old section that shows nothing', async () => {
    const { notice } = await render(['b', 'a'], [sections[0], oldArticle('a', '')]);
    expect(notice?.map((b) => b.id)).toEqual(['t']);
  });

  it('renders every article with blocks of the page', async () => {
    const { html, notice } = await render(['b', 'c'], [sections[0], blockArticle('c', [text('u', '<p>Charlie</p>')])]);
    expect(at(html, 'Charlie')).toBeGreaterThan(at(html, 'Bravo'));
    expect(notice?.map((b) => b.id)).toEqual(['t', 'u']);
  });
});

describe('renderMailContent: refusals', () => {
  it('no-content for empty blocks, events alone and a page without sections', async () => {
    expect(await refusal(['a'], [blockArticle('a', [])])).toBe('no-content -');
    expect(await refusal(['a'], [blockArticle('a', [events('e')])])).toBe('no-content -');
    expect(await refusal([], [])).toBe('no-content -');
  });

  it('names the block at fault', async () => {
    expect(await refusal(['a'], [blockArticle('a', [text('t', '<p>x</p>'), { id: 'm', type: 'map' }])])).toBe('unknown-block-type m');
    expect(await refusal(['a'], [blockArticle('a', [button('b', 'club.html')])])).toBe('invalid-block b');
  });

  it('refuses an old section without a template beside blocks', async () => {
    expect(await refusal(['a', 'm'], [blockArticle('a', [text('t', '<p>x</p>')]), { okey: 'm', type: 'map' }])).toBe('unknown-section-type -');
  });

  it('too-large for a mail html over the limit, in bytes, with and without blocks', async () => {
    // two bytes each
    const long = `<p>${'ä'.repeat(MAX_CONTENT_BYTES / 2)}</p>`;
    expect(long.length).toBeLessThan(MAX_CONTENT_BYTES);
    expect(await refusal(['a'], [blockArticle('a', [text('t', long)])])).toBe('too-large -');
    expect(await refusal(['a'], [oldArticle('a', long)])).toBe('too-large -');
  });

  it('too-large when the stored content exceeds the limit although the mail does not', async () => {
    const half = `<p>${'x'.repeat(MAX_CONTENT_BYTES / 2)}</p>`;
    expect(await refusal(['a'], [blockArticle('a', [text('t', half)])])).toBe('too-large -');
    expect(await refusal(['a'], [oldArticle('a', half)])).toBe('rendered');
  });

  it('renders a long mail below the limits', async () => {
    expect(await refusal(['a'], [blockArticle('a', [text('t', `<p>${'x'.repeat(400_000)}</p>`)])])).toBe('rendered');
  });
});

describe('sentContentOf and letterBodyOf', () => {
  it('a page with blocks: what is stored, and what the letters print', async () => {
    const content = await render(['a'], [blockArticle('a', [text('t', '<p>Hallo</p>')])]);
    expect(sentContentOf(content)).toStrictEqual({ letterBody: content.letterHtml, noticeBlocks: content.notice });
    expect(letterBodyOf(content)).toBe(content.letterHtml);
    // Firestore refuses `undefined`
    expect(JSON.parse(JSON.stringify(sentContentOf(content)))).toStrictEqual(sentContentOf(content));
  });

  it('a page without blocks: nothing stored, the letters print the mail', async () => {
    const content = await render(['a'], [oldArticle('a', '<p>Alt</p>')]);
    expect(sentContentOf(content)).toBeUndefined();
    expect(letterBodyOf(content)).toBe(content.html);
  });
});

describe('mailCalendarKeys', () => {
  it('takes the calendars of events sections and events blocks, each once', () => {
    expect(mailCalendarKeys([oldEvents('e'), blockArticle('a', [events('1', 'club'), events('2', ' jugend '), text('t', '')])])).toEqual(['club', 'jugend']);
  });

  it('takes no empty key and none with a slash from a block', () => {
    expect(mailCalendarKeys([blockArticle('a', [events('1', ''), events('2', '  '), events('3', 'a/b'), events('4', 7), events('5', null), null, 'x', { type: 'events' }])])).toEqual([]);
  });

  it('reads no more blocks than a mail may have', () => {
    const many = Array.from({ length: 60 }, (_, i) => events(`${i}`, `k${i}`));
    expect(mailCalendarKeys([blockArticle('a', many)])).toHaveLength(50);
  });

  it('leaves out other sections and a section without a name', () => {
    expect(mailCalendarKeys([{ okey: 'x', type: 'events' }, oldArticle('a', ''), { okey: 'b', type: 'button', properties: { blocks: [events('1')] } } as MailSection])).toEqual([]);
  });
});
