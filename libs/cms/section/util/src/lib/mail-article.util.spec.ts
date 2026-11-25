import { describe, expect, it } from 'vitest';

import {
  ARTICLE_SECTION_SHAPE, ImageActionType, ImageType, ViewPosition, type ArticleSection, type MailBlock, type SectionModel, type UserModel, type WebsiteModel,
} from '@okr/shared-models';

import { articlesToInsert, articleSlug, mailArticle, mailBlocksFromArticle, newsArticleUrl, teaserBlocks } from './mail-article.util';

const counter = () => { let n = 0; return () => `n${++n}`; };
function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) Object.values(Object.freeze(value)).forEach(deepFreeze);
  return value;
}
function objectsIn(value: unknown, out = new Set<unknown>()): Set<unknown> {
  if (typeof value === 'object' && value !== null && !out.has(value)) {
    out.add(value);
    Object.values(value).forEach((v) => objectsIn(v, out));
  }
  return out;
}
const sharesNothing = (a: unknown, b: unknown) => [...objectsIn(a)].every((o) => !objectsIn(b).has(o));

const image = (url: string, extra: object = {}) => ({ label: url, type: ImageType.Image, url, actionUrl: '', altText: `alt ${url}`, overlay: '', documentKey: '', credit: '', ...extra });
const article = (properties: object = {}, rest: object = {}) => deepFreeze({
  okey: 'a1', type: 'article', state: 'published', name: 'news1', title: '', subTitle: '', index: '', roleNeeded: 'public', isArchived: false, tenants: ['scs'],
  content: { htmlContent: '<p>alt</p>', colSize: 4, position: ViewPosition.Top }, properties: { images: [], ...properties }, ...rest,
}) as unknown as ArticleSection;
const replace = (html: string) => html.replace(/@APPNAME@/g, 'Seeclub');
const blocksOf = (section: ArticleSection) => mailBlocksFromArticle(section, replace, counter());

describe('mailArticle', () => {
  it('is an article of the tenant with the blocks and no old fields', () => {
    const blocks = [{ id: 'e', type: 'events', calendarKey: 'scs', maxEvents: 5 }] as MailBlock[];
    const section = mailArticle('scs', blocks);
    expect(section).toMatchObject({ okey: '', type: 'article', tenants: ['scs'], isArchived: false, title: '', subTitle: '', properties: { blocks } });
    expect(Object.keys(section.properties)).toEqual(['blocks']);
    for (const field of ['content', 'intro', 'introPosition', 'journalKey']) expect(section).not.toHaveProperty(field);
    expect(JSON.stringify(section)).not.toMatch(/htmlContent|images|cta|datePublished/);
  });

  it('shares nothing with the shape of an article', () => {
    expect(sharesNothing(mailArticle('scs', []), ARTICLE_SECTION_SHAPE)).toBe(true);
  });
});

describe('mailBlocksFromArticle', () => {
  it('puts title, subtitle and intro in front, as text', () => {
    const header = (rest: object) => blocksOf(article({ blocks: [] }, rest));
    expect(header({ title: 'Über @APPNAME@', subTitle: 'a < b', intro: 'eins\r\nzwei' })).toEqual([{ id: 'n1', type: 'text', html: '<h2>Über Seeclub</h2><p>a &lt; b</p><p>eins<br>zwei</p>' }]);
    expect(header({ title: 'T', subTitle: 'S', intro: 'I', introPosition: 'above' })).toEqual([{ id: 'n1', type: 'text', html: '<p>I</p><h2>T</h2><p>S</p>' }]);
    expect(header({ title: '  ', intro: '' })).toEqual([]);
  });

  it('turns every block into one of a mail', () => {
    const section = article({
      blocks: [
        { id: 'a', type: 'text', html: '<p>@APPNAME@</p>', htmlI18n: { en: '<p>x</p>' }, align: 'right' },
        { id: 'b', type: 'image', image: image('a.jpg', { actionUrl: 'https://a.ch', overlay: 'Legende' }), imageStyle: { width: '30%', action: ImageActionType.OpenSlider, zoomFactor: 4, captionPosition: 'middle-overlay' } },
        { id: 'c', type: 'gallery', images: [image('a.jpg'), image('b.jpg')], layout: 'mosaic', slideshow: { effect: 'fade', autoplay: true, interval: 3, duration: 1 }, imageStyle: { action: ImageActionType.Zoom } },
        { id: 'd', type: 'button', cta: { label: 'Los', labelI18n: { en: 'Go' }, url: 'club.html', style: 'secondary' }, align: 'center' },
        {
          id: 'e', type: 'columns', stackReverse: true, columns: [
            { size: 4, blocks: [{ id: 'e1', type: 'text', html: '<p>l</p>', htmlI18n: { en: '<p>x</p>' } }] },
            { size: 8, blocks: [{ id: 'e2', type: 'image', image: image('c.jpg') }, { id: 'e3', type: 'button', cta: { label: 'x', url: '/', style: 'primary' } }] },
          ],
        },
        { id: 'f', type: 'divider' },
        { id: 'g', type: 'space', size: 'large' },
      ],
    });
    const result = blocksOf(section);
    expect(result).toEqual([
      { id: 'n1', type: 'text', html: '<p>Seeclub</p>', align: 'right' },
      { id: 'n2', type: 'image', image: image('a.jpg', { overlay: 'Legende' }), imageStyle: { width: '30%', captionPosition: 'bottom' } },
      { id: 'n3', type: 'gallery', images: [image('a.jpg'), image('b.jpg')] },
      { id: 'n4', type: 'button', cta: { label: 'Los', url: 'club.html', style: 'secondary' }, align: 'center' },
      {
        id: 'n5', type: 'columns', columns: [
          { size: 4, blocks: [{ id: 'n6', type: 'text', html: '<p>l</p>' }] },
          { size: 8, blocks: [{ id: 'n7', type: 'image', image: image('c.jpg') }, { id: 'n8', type: 'button', cta: { label: 'x', url: '/', style: 'primary' } }] },
        ],
      },
      { id: 'n9', type: 'divider' },
      { id: 'n10', type: 'space', size: 'large' },
    ]);
    expect(sharesNothing(result, section)).toBe(true);
  });

  it.each([['primary', 'primary'], ['secondary', 'primary'], ['tertiary', 'primary'], ['neutral', 'neutral'], ['x', 'neutral'], [undefined, 'neutral']])('maps the tone %s to %s', (tone, expected) =>
    expect(blocksOf(article({ blocks: [{ id: 'k', type: 'callout', html: '<p>@APPNAME@</p>', htmlI18n: { en: 'x' }, tone }] }))).toEqual([{ id: 'n1', type: 'callout', html: '<p>Seeclub</p>', tone: expected }]));

  it('takes the German text of the translations when the text is empty', () => {
    expect(blocksOf(article({ blocks: [{ id: 'a', type: 'text', html: '', htmlI18n: { de: '<p>de</p>', en: '<p>en</p>' } }] }))).toEqual([{ id: 'n1', type: 'text', html: '<p>de</p>' }]);
  });

  it('keeps the link of a picture that follows it', () => {
    const imageStyle = { action: ImageActionType.FollowLink };
    expect(blocksOf(article({ blocks: [{ id: 'a', type: 'image', image: image('a.jpg', { actionUrl: '/club' }), imageStyle }] })))
      .toEqual([{ id: 'n1', type: 'image', image: image('a.jpg', { actionUrl: '/club' }), imageStyle }]);
  });

  it.each(['https://a.ch/x', ' /club ', 'mailto:a@b.ch', 'tel:+41'])('keeps the link %s of a picture', (actionUrl) => {
    const imageStyle = { action: ImageActionType.FollowLink };
    const [made] = blocksOf(article({ blocks: [{ id: 'a', type: 'gallery', images: [image('a.jpg', { actionUrl })], imageStyle }] })) as { images: { actionUrl: string }[] }[];
    expect(made.images[0].actionUrl).toBe(actionUrl.trim());
  });

  it.each(['club.html', '#top', '#', 'www.a.ch', '//evil.org', 'http://a.ch', 'javascript:alert(1)', 'data:x', 'mailto:', 'tel:', '/a\\b', 'https://', '/club\u007f', 5, undefined])('drops the link %j of a picture, which a mail cannot open', (actionUrl) => {
    const imageStyle = { action: ImageActionType.FollowLink };
    const section = article({ blocks: [{ id: 'a', type: 'image', image: image('a.jpg', { actionUrl }), imageStyle }, { id: 'b', type: 'gallery', images: [image('b.jpg', { actionUrl })], imageStyle }] });
    expect(blocksOf(section)).toMatchObject([{ image: image('a.jpg') }, { images: [image('b.jpg')] }]);
  });

  it('keeps an unknown block, also in a column: it is an error to fix', () => {
    const section = article({ blocks: [{ id: 'v', type: 'video', src: { a: [1] } }, { id: 'c', type: 'columns', columns: [{ size: 6, blocks: [{ id: 'w', type: 'video' }] }, { size: 6, blocks: [] }] }] });
    const result = blocksOf(section);
    expect(result).toEqual([{ id: 'n1', type: 'video', src: { a: [1] } }, { id: 'n2', type: 'columns', columns: [{ size: 6, blocks: [{ id: 'n3', type: 'video' }] }, { size: 6, blocks: [] }] }]);
    expect(sharesNothing(result, section)).toBe(true);
  });

  it('equal columns when the stored sizes are none', () => {
    const sizes = (...stored: unknown[]) => (blocksOf(article({ blocks: [{ id: 'c', type: 'columns', columns: stored.map((size) => ({ size, blocks: [] })) }] }))[0] as { columns: { size: number }[] }).columns.map((c) => c.size);
    expect(sizes(3, 6, 3)).toEqual([3, 6, 3]);
    expect(sizes(6, 5)).toEqual([6, 6]);
    expect(sizes('6', undefined, 4)).toEqual([4, 4, 4]);
  });

  it('converts an old article as it is drawn, a hidden picture not', () => {
    const properties = { images: [image('a.jpg')], cta: { label: 'Los', url: '/', style: 'primary', labelI18n: { en: 'Go' } }, contentI18n: { en: '<p>x</p>' }, imageStyle: { zoomFactor: 9 } };
    const at = (position: ViewPosition, extra: object = {}) => blocksOf(article({ ...properties, ...extra }, { title: 'T', content: { htmlContent: '<p>@APPNAME@</p>', colSize: 4, position } }));
    const cta = { label: 'Los', url: '/', style: 'primary' };
    expect(at(ViewPosition.Top)).toEqual([
      { id: 'n1', type: 'text', html: '<h2>T</h2>' }, { id: 'n2', type: 'image', image: image('a.jpg') }, { id: 'n3', type: 'text', html: '<p>Seeclub</p>' }, { id: 'n4', type: 'button', cta },
    ]);
    expect(at(ViewPosition.Left)[1]).toEqual({
      id: 'n2', type: 'columns', columns: [{ size: 4, blocks: [{ id: 'n3', type: 'image', image: image('a.jpg') }] }, { size: 8, blocks: [{ id: 'n4', type: 'text', html: '<p>Seeclub</p>' }] }],
    });
    expect(at(ViewPosition.None).map((b) => b.type)).toEqual(['text', 'text', 'button']);
    const slideshow = { effect: 'fade', autoplay: true, interval: 3, duration: 1 };
    expect(at(ViewPosition.Top, { images: [image('a.jpg'), { url: '' }, image('b.jpg')], imageLayout: 'mosaic', slideshow })[1]).toEqual({ id: 'n2', type: 'gallery', images: [image('a.jpg'), image('b.jpg')] });
  });

  it('leaves out the empty text and the empty button of an old article', () => {
    expect(blocksOf(article({ images: [image('a.jpg')], cta: { label: '', url: ' ', style: 'primary' } }, { content: { htmlContent: '<p></p>', colSize: 4, position: ViewPosition.Top } })))
      .toEqual([{ id: 'n1', type: 'image', image: image('a.jpg') }]);
  });

  it('never throws on malformed articles', () => {
    const malformed = [
      undefined, null, 'x', {}, { type: 'article' }, { type: 'article', title: 5, subTitle: {}, intro: [], content: 'x', properties: 'x' },
      article({ images: [null, 'x', { url: 5 }], cta: 'x', imageStyle: 5, imageLayout: 5, slideshow: 'x', contentI18n: 5 }, { content: { htmlContent: 5, position: 'x', colSize: 'x' } }),
      article({
        blocks: [
          null, 5, {}, { type: 5 }, { type: 'text' }, { type: 'text', html: 5, htmlI18n: 'x' }, { type: 'callout' }, { type: 'image' }, { type: 'image', image: 'x', imageStyle: 'x' },
          { type: 'image', image: { url: 5, type: 'x' }, imageStyle: { captionPosition: 'x', width: 5, constructor: 5 } }, { type: 'gallery' }, { type: 'gallery', images: [null, 'x', {}] },
          { type: 'button' }, { type: 'button', cta: { label: 5, url: {}, style: 'x' }, align: 'x' }, { type: 'columns' }, { type: 'columns', columns: 'x' },
          { type: 'columns', columns: [null, {}, { blocks: 'x' }, { size: {}, blocks: [null, 5, { type: 'columns', columns: [{ blocks: [{ type: 'gallery' }] }] }] }] }, { type: 'space', size: 5 },
        ],
      }),
    ];
    for (const section of malformed) expect(() => blocksOf(section as unknown as ArticleSection)).not.toThrow();
  });
});

describe('teaserBlocks', () => {
  const url = 'https://seeclub.org/news-artikel?slug=news1';
  const teaser = (section: ArticleSection) => teaserBlocks(section, url, { more: 'Weiterlesen' }, counter());
  const cover = { ...image('c.jpg'), actionUrl: url };

  it('is cover, title and excerpt, and a button', () => {
    const html = `<p>${Array.from({ length: 40 }, (_, i) => `w${i}`).join(' ')} &amp; mehr</p>`;
    const section = article({ blocks: [{ id: 'a', type: 'text', html }, { id: 'b', type: 'image', image: image('b.jpg') }], cover: image('c.jpg', { actionUrl: 'javascript:x' }) }, { title: 'A & B', subTitle: 'S', intro: 'I' });
    const result = teaser(section);
    expect(result).toEqual([
      { id: 'n1', type: 'image', image: cover, imageStyle: { action: ImageActionType.FollowLink } },
      { id: 'n2', type: 'text', html: `<h2>A &amp; B</h2><p>${Array.from({ length: 30 }, (_, i) => `w${i}`).join(' ')}…</p>` },
      { id: 'n3', type: 'button', cta: { label: 'Weiterlesen', url, style: 'primary' } },
    ]);
    expect(sharesNothing(result, section)).toBe(true);
  });

  it('keeps the entities of the text as they are, as the news list draws them', () => {
    expect(teaser(article({}, { title: 'T', content: { htmlContent: '<p>a &amp; b &lt;c&gt;</p>', colSize: 4, position: ViewPosition.Top } }))[0]).toMatchObject({ html: '<h2>T</h2><p>a &amp; b &lt;c&gt;</p>' });
  });

  it('has no picture without a cover and no text without one', () => {
    expect(teaser(article({}, { title: 'T', content: undefined })).map((b) => b.type)).toEqual(['text', 'button']);
    expect(teaser(article({}, { content: { htmlContent: '<p></p>' } })).map((b) => b.type)).toEqual(['button']);
    expect(teaser(article({ images: [{ url: ' ' }] }, { title: 'T' })).map((b) => b.type)).toEqual(['text', 'button']);
    expect(teaser(article({ images: [image('a.jpg')] }, { title: 'T' })).map((b) => b.type)).toEqual(['image', 'text', 'button']);
  });

  it('never throws on malformed articles', () => {
    for (const section of [undefined, null, {}, { type: 'article', title: 5, content: 'x', properties: { blocks: [null], cover: 'x' } }, { type: 'article', content: { htmlContent: 5 }, properties: { images: 'x' } }]) {
      expect(() => teaser(section as unknown as ArticleSection)).not.toThrow();
    }
  });
});

describe('articlesToInsert', () => {
  const member = { roles: { registered: true } } as unknown as UserModel;
  const admin = { roles: { contentAdmin: true } } as unknown as UserModel;
  const keys = (sections: unknown[], user: UserModel | undefined = member) => articlesToInsert(deepFreeze(sections) as SectionModel[], user, 'scs').map((s) => s.okey);

  it('takes the published articles of the tenant', () => {
    expect(keys([
      article({}, { okey: 'ok' }), article({}, { okey: 'draft', state: 'draft' }), article({}, { okey: 'archived', isArchived: true }), article({}, { okey: 'journal', journalKey: 'j1' }),
      article({}, { okey: 'foreign', tenants: ['p13'] }), article({}, { okey: 'no tenants', tenants: undefined }), article({}, { okey: 'hero', type: 'hero' }), article({}, { okey: 'no journal', journalKey: '' }),
      article({}, { okey: 'shared', tenants: ['p13', 'scs'] }), null, undefined, 'x', {},
    ])).toEqual(['ok', 'no journal', 'shared']);
  });

  it('takes what the user sees in the app', () => {
    const sections = ['public', 'none', 'registered', 'contentAdmin', 'anonymous', undefined, 'unknown role'].map((roleNeeded) => article({}, { okey: `${roleNeeded}`, roleNeeded }));
    expect(keys(sections, member)).toEqual(['public', 'none', 'registered', 'undefined']);
    expect(keys(sections, admin)).toEqual(['public', 'none', 'registered', 'contentAdmin', 'undefined']);
    expect(keys(sections, {} as UserModel)).toEqual(['public', 'none', 'undefined']);
    expect(articlesToInsert(sections, undefined, 'scs').map((s) => s.okey)).toEqual(['public', 'none', 'anonymous', 'undefined']);
  });

  it('newest first, without a date last, otherwise in the given order', () => {
    const dated = (okey: string, datePublished: unknown) => article({ datePublished }, { okey });
    expect(keys([dated('none', undefined), dated('old', '20250101'), dated('empty', ' '), dated('new', '20261101'), dated('new2', '20261101'), dated('bad', 5)])).toEqual(['new', 'new2', 'old', 'none', 'empty', 'bad']);
    expect(keys([article({}, { okey: 'bare', properties: undefined }), dated('a', '20250101')])).toEqual(['a', 'bare']);
  });

  it.each([undefined, null, 'x'])('never throws on %j', (sections) => expect(articlesToInsert(sections as unknown as SectionModel[], member, 'scs')).toEqual([]));
});

describe('articleSlug', () => {
  it.each([
    [{ name: '20260730news_coupedelajeunesse', okey: 'qwia9mb' }, '20260730news_coupedelajeunesse'],
    [{ name: '  a  ', okey: 'b' }, 'a'],
    [{ name: '', okey: '645sg5sabenrlhc0t1us' }, '645sg5sabenrlhc0t1us'],
    [{ name: '   ', okey: 'abc' }, 'abc'],
    [{ okey: 'abc' }, 'abc'],
    [{ name: 5, okey: 'abc' }, 'abc'],
  ])('%j → %s (the rule of publicApi)', (doc, slug) => expect(articleSlug(doc as { name: string; okey: string })).toBe(slug));
});

describe('newsArticleUrl', () => {
  const site = { okey: 'scs', domain: 'https://seeclub.org' };
  const url = (rest: object = {}, s: unknown = site) => newsArticleUrl(s as Pick<WebsiteModel, 'okey' | 'domain'>, article({}, rest));

  it('is the page of a public article', () => {
    expect(url()).toBe('https://seeclub.org/news-artikel?slug=news1');
    expect(url({ roleNeeded: 'none' })).toBe('https://seeclub.org/news-artikel?slug=news1');
    expect(url({ name: 'ä b&c?' })).toBe('https://seeclub.org/news-artikel?slug=%C3%A4%20b%26c%3F');
    expect(url({ name: '' })).toBe('https://seeclub.org/news-artikel?slug=a1');
    expect(url({ tenants: ['p13', 'scs'] })).toBe('https://seeclub.org/news-artikel?slug=news1');
    expect(url({ tenants: ['la21staefa'] }, { okey: 'la21staefa', domain: ' https://la21staefa.ch// ' })).toBe('https://la21staefa.ch/news-artikel?slug=news1');
  });

  it.each([
    { state: 'draft' }, { state: undefined }, { isArchived: true }, { roleNeeded: 'registered' }, { roleNeeded: '' }, { roleNeeded: undefined }, { roleNeeded: 'anonymous' },
    { type: 'hero' }, { name: '', okey: '' }, { name: '\ud800' }, { tenants: ['p13'] }, { tenants: ['system'] }, { tenants: [] }, { tenants: undefined }, { tenants: 'scs' },
  ])('there is none for %j', (rest) => expect(url(rest)).toBeUndefined());

  it.each([undefined, null, {}, { okey: 'p13', domain: 'https://p13.ch' }, { okey: 'scs' }, { okey: 'scs', domain: '' }, { okey: 'scs', domain: 'http://seeclub.org' }, { okey: 'scs', domain: 'seeclub.org' }, { okey: 'scs', domain: 5 }, { okey: 'scs', domain: 'https://' }])(
    'there is none on the site %j', (s) => expect(newsArticleUrl(s as unknown as WebsiteModel, article())).toBeUndefined());

  it('never throws without an article', () => expect(newsArticleUrl(site, undefined as unknown as ArticleSection)).toBeUndefined());
});
