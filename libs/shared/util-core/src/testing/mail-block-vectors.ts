// libs/shared/util-core/src/testing/mail-block-vectors.ts
//
// The blocks of Versand mails (spec 1.176 §8.1, §9.1) with what the app says about them: one table for the app's rules
// (`mailBlocksValidations`, `mailBlocksHaveContent` in cms-section-util) and the server's renderer (`renderMailBlocks` in
// apps/functions). The invariant both specs check: what the app accepts is rendered without refusal, with content exactly
// when the app counts content. Test data only: not exported from the lib, and not part of its build.

/** One mail. `valid`: the app's validation accepts it; `hasContent`: the app counts content (§8.1). */
export interface MailBlockVector {
  name: string;
  blocks: unknown;
  valid: boolean;
  hasContent: boolean;
}

/** The calendar of the events vectors; the server spec gives it event lines. */
export const VECTOR_CALENDAR = 'club';

const picture = (url: string, extra: Record<string, unknown> = {}) =>
  ({ label: '', type: 1, url, altText: '', actionUrl: '', overlay: '', documentKey: '', credit: '', ...extra });
const text = (id: string, html: unknown) => ({ id, type: 'text', html });
const callout = (id: string, html: unknown) => ({ id, type: 'callout', html, tone: 'primary' });
const image = (id: string, url: string, extra: Record<string, unknown> = {}) => ({ id, type: 'image', image: picture(url, extra) });
const gallery = (id: string, images: unknown[]) => ({ id, type: 'gallery', images });
const button = (id: string, url: unknown, label = 'Anmelden') => ({ id, type: 'button', cta: { label, url, style: 'primary' } });
const events = (id: string, extra: Record<string, unknown> = {}) => ({ id, type: 'events', calendarKey: VECTOR_CALENDAR, maxEvents: 3, ...extra });
const columns = (id: string, sizes: number[], blocks: unknown[][]) => ({ id, type: 'columns', columns: sizes.map((size, i) => ({ size, blocks: blocks[i] ?? [] })) });
const many = (n: number) => Array.from({ length: n }, (_, i) => text(`t${i}`, `<p>Absatz ${i}</p>`));

const v = (name: string, blocks: unknown, valid: boolean, hasContent: boolean): MailBlockVector => ({ name, blocks, valid, hasContent });

export const MAIL_BLOCK_VECTORS: readonly MailBlockVector[] = [
  // empty content
  v('no blocks', [], true, false),
  v('an empty text', [text('t', '')], true, false),
  v('a text of blanks', [text('t', '<p> &nbsp;&#160;<br></p>')], true, false),
  v('a text with a line only', [text('t', '<hr>')], true, false),
  v('a text with a comment and a style only', [text('t', '<!-- x --><style>p { color: red }</style>')], true, false),
  v('a divider and a space', [{ id: 'd', type: 'divider' }, { id: 's', type: 'space', size: 'large' }], true, false),
  v('events only', [events('e')], true, false),
  v('columns with empty texts', [columns('c', [6, 6], [[text('c1', '')], [text('c2', '<p></p>')]])], true, false),
  v('an empty callout', [callout('k', '')], true, false),

  // texts and links
  v('a text', [text('t', '<p>Hallo</p>')], true, true),
  v('a callout', [callout('k', '<p>Wichtig</p>')], true, true),
  v('a text with an https link', [text('t', '<p><a href="https://a.ch">Seite</a></p>')], true, true),
  v('a text with an http link', [text('t', '<p><a href="http://a.ch">Seite</a></p>')], true, true),
  v('a text with an app link', [text('t', '<p><a href="/club">Club</a></p>')], true, true),
  v('a text with a javascript link keeps its words', [text('t', '<p><a href="javascript:alert(1)">Klick</a></p>')], true, true),
  v('a text with an empty link only', [text('t', '<p><a href="https://a.ch"></a></p>')], true, false),
  v('a text that is no text', [text('t', 42)], false, false),
  v('a callout without html', [{ id: 'k', type: 'callout', tone: 'neutral' }], false, false),

  // pictures inside a text or callout
  v('a text with a stored picture', [text('t', '<p><img src="tenant/scs/a.jpg" alt=""></p>')], true, true),
  v('a text with an https picture', [text('t', '<p><img src="https://a.ch/a.jpg" width="300"></p>')], true, true),
  v('a text with a picture of 3 px', [text('t', '<p><img src="https://a.ch/a.jpg" width="3"></p>')], true, true),
  v('a callout with a stored picture', [callout('k', '<img src="tenant/scs/a.jpg">')], true, true),
  v('a text with an http picture and an alt text', [text('t', '<p><img src="http://a.ch/a.jpg" alt="Der Steg"></p>')], false, true),
  v('a text with an http picture', [text('t', '<p><img src="http://a.ch/a.jpg"></p>')], false, false),
  v('a text with a data picture', [text('t', '<p><img src="data:image/png;base64,iVBORw0KGgo="></p>')], false, false),
  v('a text with a picture from the root', [text('t', '<p><img src="/a.jpg" alt=""></p>')], false, false),
  v('a text with a picture without address', [text('t', '<p><img alt="Bild"></p>')], false, true),
  v('a text with a tracking picture', [text('t', '<p><img src="https://t.example/p.gif" width="1" height="1" alt="Pixel"></p>')], false, false),
  v('a text with a tracking picture by style', [text('t', '<p><img src="tenant/scs/p.gif" style="height:2px"></p>')], false, false),
  v('a text with a tracking picture and words', [text('t', '<p>Hallo <img src="https://t.example/p.gif" width="1"></p>')], false, true),
  v('a callout with a data picture', [callout('k', '<img src="data:image/png;base64,iVBORw0KGgo=">')], false, false),
  v('a text with a good and a bad picture', [text('t', '<p><img src="tenant/scs/a.jpg"><img src="http://a.ch/b.jpg"></p>')], false, true),
  v('a text with a bad picture in a column', [columns('c', [6, 6], [[text('c1', '<img src="http://a.ch/a.jpg">')], []])], false, false),

  // picture blocks
  v('an image', [image('i', 'tenant/scs/a.jpg')], true, true),
  v('an image with an alt text', [image('i', 'https://a.ch/a.jpg', { altText: 'Der Steg' })], true, true),
  v('an image with an app link', [image('i', 'tenant/scs/a.jpg', { actionUrl: '/club' })], true, true),
  v('an image without url but with alt text', [image('i', '', { altText: 'Der Steg' })], false, true),
  v('an image without anything', [image('i', '')], false, false),
  v('an image with an http url', [image('i', 'http://a.ch/a.jpg')], false, true),
  v('an image with a data url', [image('i', 'data:image/png;base64,iVBORw0KGgo=')], false, true),
  v('an image that is no object', [{ id: 'i', type: 'image', image: 'x' }], false, false),

  // galleries
  v('a gallery of two', [gallery('g', [picture('tenant/scs/a.jpg'), picture('https://a.ch/b.jpg')])], true, true),
  v('a gallery of one', [gallery('g', [picture('tenant/scs/a.jpg')])], true, true),
  v('a gallery without pictures', [gallery('g', [])], false, false),
  v('a gallery of blank entries', [gallery('g', [picture(''), picture('')])], false, false),
  v('a gallery with an http picture', [gallery('g', [picture('tenant/scs/a.jpg'), picture('http://a.ch/b.jpg')])], false, true),
  v('a gallery with an entry that is no object', [gallery('g', [picture('tenant/scs/a.jpg'), 'x'])], false, true),

  // buttons
  v('a button to https', [button('b', 'https://a.ch')], true, true),
  v('a button to an app page', [button('b', '/club')], true, true),
  v('a button to mailto', [button('b', 'mailto:a@b.ch')], true, true),
  v('a button to tel', [button('b', 'tel:+41 44 000 00 00')], true, true),
  v('a button to http', [button('b', 'http://a.ch')], false, true),
  v('a button to a website page', [button('b', 'club.html')], false, true),
  v('a button to javascript', [button('b', 'javascript:alert(1)')], false, true),
  v('a button to //host', [button('b', '//evil.org')], false, true),
  v('a button without target', [button('b', '')], false, true),
  v('a button without label', [button('b', 'https://a.ch', '')], false, true),
  v('a button without cta', [{ id: 'b', type: 'button' }], false, false),

  // columns
  v('two columns of 6', [columns('c', [6, 6], [[text('c1', '<p>Links</p>')], [image('c2', 'tenant/scs/a.jpg')]])], true, true),
  v('columns of 4 and 8', [columns('c', [4, 8], [[button('c1', '/club')], []])], true, true),
  v('three columns of 4', [columns('c', [4, 4, 4], [[text('c1', '<p>a</p>')], [text('c2', '<p>b</p>')], [text('c3', '<p>c</p>')]])], true, true),
  v('columns of 5 and 5', [columns('c', [5, 5], [[text('c1', '<p>a</p>')], []])], false, true),
  v('one column', [columns('c', [12], [[text('c1', '<p>a</p>')]])], false, true),
  v('four columns', [columns('c', [3, 3, 3, 3], [[text('c1', '<p>a</p>')]])], false, true),
  // the app reads one level of columns only: what is deeper counts for nothing
  v('columns in columns', [columns('c', [6, 6], [[columns('cc', [6, 6], [[text('c1', '<p>a</p>')], []])], []])], false, false),
  v('events in a column', [columns('c', [6, 6], [[events('ce')], [text('c1', '<p>a</p>')]])], false, true),
  v('a gallery in a column', [columns('c', [6, 6], [[gallery('cg', [picture('tenant/scs/a.jpg')])], []])], false, true),
  v('a column without a list', [{ id: 'c', type: 'columns', columns: [{ size: 6 }, { size: 6, blocks: [] }] }], false, false),

  // events
  v('events and a text', [events('e', { title: 'Anlässe' }), text('t', '<p>Hallo</p>')], true, true),
  v('events without calendar', [events('e', { calendarKey: '' }), text('t', '<p>Hallo</p>')], false, true),
  v('events of 0', [events('e', { maxEvents: 0 }), text('t', '<p>Hallo</p>')], false, true),

  // ids, types and the number of blocks
  v('a block without id', [{ type: 'text', html: '<p>Hallo</p>' }], false, true),
  v('a block with an empty id', [text('', '<p>Hallo</p>')], false, true),
  v('two blocks with one id', [text('t', '<p>a</p>'), text('t', '<p>b</p>')], false, true),
  v('an id repeated in a column', [text('t', '<p>a</p>'), columns('c', [6, 6], [[text('t', '<p>b</p>')], []])], false, true),
  v('a block of an unknown type', [{ id: 'x', type: 'video' }, text('t', '<p>a</p>')], false, true),
  v('a block that is no object', [null, text('t', '<p>a</p>')], false, true),
  v('blocks that are no list', { 0: text('t', '<p>a</p>') }, false, false),
  v('50 blocks', many(50), true, true),
  v('51 blocks', many(51), false, true),
];
