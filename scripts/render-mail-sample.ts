/**
 * SAMPLE MAIL of the Versand blocks (spec 1.176 §14): every block in the seeded standard layout, with neutral values, for a
 * look in mail programs. No database, no network (the pictures are addresses only), and nothing is sent.
 *
 *   --out=<dir>        writes sample.html and sample.txt (mail) and letter.html (the blocks as a letter prints them)
 *   --color=#rrggbb    the brand colour (default #014da2)
 *   --picture=<path>   the storage path of the picture in the blocks (default: a logo)
 *
 * Usage (bundled with its dependencies: sanitize-html is installed below apps/functions only):
 *   pnpm exec esbuild scripts/render-mail-sample.ts --bundle --platform=node --tsconfig=tsconfig.base.json \
 *     --format=cjs --outfile=dist/scripts/render-mail-sample.cjs
 *   node dist/scripts/render-mail-sample.cjs --out=<dir>
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import Handlebars from 'handlebars';
import type { MailEventLine } from '@okr/shared-util-core';
import { htmlToText } from '../apps/functions/src/email/html-to-text';
import { renderMailBlocks, type MailTarget } from '../apps/functions/src/email/mail-page/render-mail-blocks.logic';
import { sanitizeEmailBody } from '../apps/functions/src/pdf/sanitize';

const arg = (name: string): string | undefined => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

// public pictures that the repo names elsewhere, too
const WIDE = arg('picture') ?? 'tenant/okr/logo/email-header.png';
const LOGO = 'tenant/okr/logo/email-header.png';

const LAYOUT: Record<string, string> = {
  LOGO_URL: `https://bkaiser.imgix.net/${LOGO}?w=418`, LOGO_ALT: 'Beispielverein', LOGO_WIDTH: '209', HEADER_LINK: 'https://www.example.org',
  FOOTER_NAME: 'Beispielverein', BAND_COLOR: '#ffffff',
};
const EVENTS: Record<string, MailEventLine[]> = {
  sample: [
    { date: '04.12.2026', time: '19:00', title: 'Fondue-Abend', place: 'Clubhaus' },
    { date: '12.12.2026', time: '', title: 'Putztag', place: '' },
    { date: '09.01.2027', time: '10:30', title: 'Mitgliederversammlung mit einem etwas längeren Titel', place: 'Grosser Saal' },
  ],
};

let count = 0;
const id = (): string => `b${++count}`;
const picture = (url: string, altText: string, extra: Record<string, unknown> = {}) => ({ label: '', type: 0, url, actionUrl: '', altText, overlay: '', ...extra });
const text = (html: string, align?: string) => ({ id: id(), type: 'text', html, ...(align ? { align } : {}) });
const image = (url: string, altText: string, extra: Record<string, unknown> = {}, imageStyle: Record<string, unknown> = {}) => ({ id: id(), type: 'image', image: picture(url, altText, extra), imageStyle });
const button = (label: string, style: string, align: string, url = 'https://www.example.org/anmeldung') => ({ id: id(), type: 'button', cta: { label, url, style }, align });
const columns = (...content: [number, unknown[]][]) => ({ id: id(), type: 'columns', columns: content.map(([size, blocks]) => ({ size, blocks })) });
const callout = (tone: string, html: string) => ({ id: id(), type: 'callout', tone, html });
const heading = (title: string) => text(`<h3>${title}</h3>`);

const LOREM = 'Das ist ein Beispieltext, damit die Zeilen umbrechen und die Höhe der Spalten verschieden ist.';

const BLOCKS = [
  text('<h2>Liebe Mitglieder</h2><p>Ein Text mit <strong>fett</strong>, <em>kursiv</em>, einem <a href="https://www.example.org/seite">Link</a> und einem <a href="/club">Link in die App</a>.</p><ul><li>erster Punkt</li><li>zweiter Punkt</li></ul><p>Der letzte Absatz vor dem Bild.</p>'),
  image(WIDE, 'Ein Bild über die ganze Breite', { overlay: 'Die Legende des Bildes', credit: 'Foto: Beispiel', actionUrl: 'https://www.example.org' }, { captionPosition: 'bottom' }),
  heading('Bild mit halber Breite'),
  image(WIDE, 'Ein Bild mit halber Breite', {}, { width: '50%' }),
  text('<p>Ein Text in der Mitte.</p>', 'center'),
  text('<p>Ein Text rechts.</p>', 'right'),
  heading('Buttons'),
  button('Links gefüllt', 'primary', 'left'),
  button('Links Umriss', 'secondary', 'left'),
  button('Mitte gefüllt', 'primary', 'center'),
  button('Mitte Umriss', 'secondary', 'center'),
  button('Rechts gefüllt', 'primary', 'right'),
  button('Rechts Umriss', 'secondary', 'right'),
  heading('Spalten 6/6'),
  columns([6, [image(WIDE, 'links'), text(`<p>${LOREM}</p>`), button('Mehr', 'primary', 'left')]], [6, [image(WIDE, 'rechts'), text('<p>Kurzer Text.</p>'), button('Mehr', 'secondary', 'left')]]),
  heading('Spalten 4/8'),
  columns([4, [image(WIDE, 'klein')]], [8, [text(`<p><strong>Bild neben Text</strong></p><p>${LOREM}</p>`)]]),
  heading('Spalten 4/4/4'),
  columns([4, [image(WIDE, 'eins'), text('<p>Eins</p>', 'center')]], [4, [image(WIDE, 'zwei'), text('<p>Mitgliederversammlungsprotokoll</p>')]], [4, [image(WIDE, 'drei'), text('<p>Drei</p>', 'center')]]),
  heading('Spalten 3/6/3'),
  columns([3, [text('<p>Schmal</p>')]], [6, [text(`<p>${LOREM}</p>`)]], [3, [text('<p>Schmal</p>', 'right')]]),
  heading('Galerie mit drei Bildern'),
  { id: id(), type: 'gallery', images: [picture(WIDE, 'Galerie 1'), picture(WIDE, 'Galerie 2', { actionUrl: '/club' }), picture(WIDE, 'Galerie 3')] },
  callout('primary', '<p><strong>Hinweis in der Vereinsfarbe</strong></p><p>Mit zwei Absätzen und dunklem Text.</p>'),
  callout('neutral', '<p>Hinweis in Grau mit einem <a href="https://www.example.org">Link</a>.</p>'),
  heading('Linie und Abstände'),
  { id: id(), type: 'divider' },
  text('<p>Danach klein, mittel, gross:</p>'),
  { id: id(), type: 'space', size: 'small' }, text('<p>nach klein</p>'),
  { id: id(), type: 'space', size: 'medium' }, text('<p>nach mittel</p>'),
  { id: id(), type: 'space', size: 'large' }, text('<p>nach gross</p>'),
  { id: id(), type: 'divider' },
  { id: id(), type: 'events', calendarKey: 'sample', title: 'Anlässe', maxEvents: 5 },
  text('<p>Freundliche Grüsse<br>Der Vorstand</p>'),
];

function layout(name: string): string {
  return readFileSync(join('scripts/email-templates', name), 'utf8').replace(/%%([A-Z_]+)%%/g, (_match, key: string) => LAYOUT[key] ?? '');
}

async function main(): Promise<void> {
  const out = arg('out');
  if (!out) throw new Error('Usage: node render-mail-sample.cjs --out=<dir> [--color=#rrggbb] [--picture=<path>]');
  const color = arg('color') ?? '#014da2';
  const render = async (target: MailTarget): Promise<string> =>
    // the second pass is the one of composeBody
    sanitizeEmailBody((await renderMailBlocks(BLOCKS, { hb: Handlebars, sanitize: sanitizeEmailBody, events: EVENTS, appOrigin: 'https://app.example.org', color, target })).html);
  const vars = { app_name: 'Beispielverein', app_url: 'https://app.example.org', year: '2026', contact_email: 'info@example.org' };
  const content = await render('mail');

  const dir = resolve(out);
  mkdirSync(dir, { recursive: true });
  const write = (name: string, value: string): void => { writeFileSync(join(dir, name), value); console.log(`wrote ${join(dir, name)}`); };
  write('sample.html', Handlebars.compile(layout('layout-standard.html'))({ ...vars, content }));
  write('sample.txt', Handlebars.compile(layout('layout-standard.txt'), { noEscape: true })({ ...vars, content: htmlToText(content) }));
  write('letter.html', `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"></head><body style="width:170mm;margin:0 auto;">${await render('print')}</body></html>`);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exitCode = 1;
});
