#!/usr/bin/env node
/**
 * Brings the page content of www.la21staefa.ch into the la21staefa app and website (spec 1.165, plan Task 12).
 *
 *   node scripts/la21staefa/import-pages.mjs --pages <pages.json> [--write]
 *
 * <pages.json> is the extraction of the crawl: [{ url, title, parent, sections: [{ kind, title, subTitle, html,
 * images: [{ url, alt }], note }] }] (verbatim German text, cleaned HTML). Not part of the repository.
 *
 *  - Group pages go into the group's content page `<groupKey>_content`; a subpage of a group (KreisWERK,
 *    Musigtäg, KofferSMäRT, Nettswerk-Träff …) follows as further sections under a heading section with its title.
 *    Qatira has a group of its own.
 *  - Verein pages become website pages (`TARGETS`), linked from the website's «Verein» menu; the Projektgruppen
 *    overview becomes `la21staefa_projektgruppen` with the group cards (the home page's group tiles section).
 *  - Every section becomes an article: title, subtitle, html, pictures (uploaded to Storage; one picture on the
 *    right, several as a slider/grid). Forms, embeds and «buttons» blocks keep their visible text; what cannot be
 *    rebuilt (form fields, maps, videos, widgets) is listed in the run's report instead of being published.
 *  - Create-only. A page's section list is written only while it still holds what an earlier seed put there
 *    (the empty group intro); a page someone has edited since is reported and left alone.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const rootRequire = createRequire(join(ROOT, 'package.json'));
const T = 'la21staefa';
const BUCKET = 'bkaiser-org.appspot.com';

/** old path (first segments) → target page key; group pages and their subpages → the group's content page */
export const TARGETS = {
  'zukunftsbuero-staefa': 'la21staefa_zukunftsburosta_content',
  gutwohnenstaefa: 'la21staefa_gutwohneninstaf_content',
  smaert: 'la21staefa_smart_content',
  'btvz-start': 'la21staefa_btvzbauteilezur_content',
  'lokal-und-fair': 'la21staefa_lokalfair_content',
  staefnet: 'la21staefa_stafnet_content',
  'bau-energie-3': 'la21staefa_bauundenergie_content',
  'reparatur-cafe-staefa': 'la21staefa_reparaturcafest_content',
  'oase-kirchbuehl': 'la21staefa_oasekirchbuhl_content',
  'kiss-staefa-zeitvorsorge': 'la21staefa_kissstafa_content',
  'begegnung-und-integration': 'la21staefa_begegnungintegr_content',
  'nettswerk-treff': 'la21staefa_begegnungintegr_content',
  qatira: 'la21staefa_qatira_content',
  verein: 'la21staefa_verein',
  'verein/mitmachen': 'la21staefa_mitmachen',
  'verein/anmeldeformular': 'la21staefa_anmeldung',
  'verein/anmeldeformular-2': 'la21staefa_kontakt',
  'verein/mittsommerfeier-2026': 'la21staefa_mittsommerfeier',
  kommunikation: 'la21staefa_werbung',
  projektgruppenuebersicht: 'la21staefa_projektgruppen',
};

/** the website pages this run creates (group content pages exist already) */
export const NEW_PAGES = {
  la21staefa_verein: { name: 'Über den Verein', slug: 'verein' },
  la21staefa_kontakt: { name: 'Kontaktformular', slug: 'kontakt' },
  la21staefa_anmeldung: { name: 'Anmeldeformular', slug: 'anmeldeformular' },
  la21staefa_mitmachen: { name: 'Mitmachen', slug: 'mitmachen' },
  la21staefa_mittsommerfeier: { name: 'LA21 Mittsommerfeier 2026 & 25 Jahre Jubiläum', slug: 'mittsommerfeier-2026' },
  la21staefa_werbung: { name: 'Werbemöglichkeiten für Projektgruppen', slug: 'werbemoeglichkeiten' },
  la21staefa_projektgruppen: { name: 'Projektgruppen', slug: 'projektgruppen' },
};

/** pages that held only a form on the old site: what they say until the form is rebuilt */
export const FORM_PAGES = {
  la21staefa_anmeldung: '<p>Werde Mitglied der LA21 Stäfa und unterstütze damit alle Projektgruppen. Schreib uns mit deinem Namen und deiner Adresse an <a href="mailto:info@la21staefa.ch?subject=Mitgliedschaft">info@la21staefa.ch</a> – wir melden uns bei dir.</p>',
  la21staefa_kontakt: '<p>Du erreichst uns per E-Mail an <a href="mailto:info@la21staefa.ch">info@la21staefa.ch</a>.</p><p>Verein Lokale Agenda 21 Stäfa<br>Bauertacherweg 4<br>8712 Stäfa</p>',
};

/** the old site's «Verein» menu, in its order */
export const VEREIN_MENU = ['la21staefa_verein', 'la21staefa_kontakt', 'la21staefa_anmeldung', 'la21staefa_mitmachen', 'la21staefa_mittsommerfeier', 'la21staefa_werbung'];

/** the target page of an old url: the longest matching path prefix of TARGETS; '' = not imported */
export function targetOf(url) {
  const path = String(url).replace(/^https?:\/\/[^/]+\//, '').replace(/\/$/, '');
  const parts = path.split('/');
  for (let n = parts.length; n > 0; n--) {
    const key = TARGETS[parts.slice(0, n).join('/')];
    if (key) return key;
  }
  return '';
}

/** a storage file name from an image url: the last path segment, safe characters only */
export function fileNameOf(url) {
  const last = decodeURIComponent(String(url).split('?')[0].split('/').pop() ?? 'bild');
  return last.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^A-Za-z0-9._-]+/g, '-').slice(-120) || 'bild';
}

/** the image layout of n pictures: one on the right, 4 as a grid, 5+ as a mosaic, else the slider */
export function imageLayoutOf(n) {
  if (n === 4) return 'grid';
  if (n >= 5) return 'mosaic';
  return undefined;
}

const IMAGE = { actionUrl: '', altText: '', credit: '', documentKey: '', label: '', overlay: '', type: 0, url: '' };
const IMAGE_STYLE = { imgIxParams: '', width: '100%', height: 'auto', sizes: '(max-width: 786px) 50vw, 100vw', border: '', borderRadius: '', fill: true, hasPriority: false, action: 0, zoomFactor: 2 };

/** an article section from one extracted block; `paths` maps image url → storage path */
export function articleOf(key, block, paths) {
  const images = (block.images ?? []).filter((i) => paths.has(i.url)).map((i) => ({ ...IMAGE, url: paths.get(i.url), altText: String(i.alt ?? '').slice(0, 200) }));
  const layout = imageLayoutOf(images.length);
  // title and subtitle are capped at 100 characters (section suite): a longer one moves into the text, never cut
  const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  let title = String(block.title ?? '').trim();
  let subTitle = String(block.subTitle ?? '').trim();
  let html = block.html || '';
  if (subTitle.length > 100) { html = `<p><strong>${esc(subTitle)}</strong></p>${html}`; subTitle = ''; }
  if (title.length > 100) { html = `<h3>${esc(title)}</h3>${html}`; title = ''; }
  const position = images.length === 0 ? 0 : images.length === 1 ? 4 : 1; // none · right · top (ViewPosition)
  return {
    name: key, type: 'article', state: 'published', roleNeeded: 'none', colSize: '12', color: 0,
    title, subTitle,
    notes: 'von www.la21staefa.ch übernommen (1.165)', tags: '', isArchived: false, tenants: [T],
    content: { htmlContent: html || '<p></p>', colSize: 4, position },
    properties: { images, imageStyle: IMAGE_STYLE, ...(layout ? { imageLayout: layout } : {}) },
    index: `n:${key} a:article k:${key}`,
  };
}

/** blocks that cannot be published as they are: their note goes to the report */
export function needsManualWork(block) {
  return ['form', 'embed'].includes(block.kind) || /gravity|formular|iframe|maps|youtube|widget/i.test(block.note ?? '');
}

async function main() {
  const i = process.argv.indexOf('--pages');
  if (i < 0) throw new Error('Usage: node scripts/la21staefa/import-pages.mjs --pages <pages.json> [--write] [--report <file.md>]');
  const write = process.argv.includes('--write');
  const r = process.argv.indexOf('--report');
  const pages = JSON.parse(readFileSync(resolve(process.argv[i + 1]), 'utf8'));

  const { getApps, initializeApp } = rootRequire('firebase-admin/app');
  const { getFirestore } = rootRequire('firebase-admin/firestore');
  const { getStorage } = rootRequire('firebase-admin/storage');
  if (!getApps().length) initializeApp({ projectId: 'bkaiser-org', storageBucket: BUCKET });
  const db = getFirestore();
  const bucket = getStorage().bucket(BUCKET);

  const report = [];
  const byTarget = new Map(); // page key → [{ page, blocks }] in crawl order, parent page first
  for (const p of pages) {
    const target = targetOf(p.url);
    if (!target) { report.push(`- nicht übernommen: ${p.url} (${p.title})`); continue; }
    const list = byTarget.get(target) ?? [];
    list.push(p);
    byTarget.set(target, list);
  }

  for (const [target, list] of byTarget) {
    // the page whose url maps to the target exactly comes first, its subpages after it
    list.sort((a, b) => a.url.length - b.url.length);
    const sectionKeys = [];
    let n = 0;
    for (const page of list) {
      const isSub = page !== list[0] || (page.parent && targetOf(page.parent) === target);
      if (isSub) {
        const key = `${target}_s${String(++n).padStart(2, '0')}`;
        sectionKeys.push([key, articleOf(key, { title: page.title.replace(/\s*[|–-]\s*Lokale Agenda 21 Stäfa.*$/, ''), html: '<p></p>' }, new Map())]);
      }
      for (const block of page.sections ?? []) {
        if (needsManualWork(block)) report.push(`- ${page.url} · ${block.kind}${block.title ? ` «${block.title}»` : ''}: ${block.note || 'manuell nachbauen'}`);
        // the Projektgruppen overview: its logo gallery is replaced by the group cards
        if (target === 'la21staefa_projektgruppen' && block.kind === 'gallery') continue;
        if (block.kind === 'form' && !(block.html ?? '').replace(/<[^>]+>/g, '').trim()) continue;
        if (block.kind === 'embed' && !(block.html ?? '').replace(/<[^>]+>/g, '').trim()) continue;
        const paths = new Map();
        for (const img of block.images ?? []) paths.set(img.url, `tenant/${T}/page/${target}/${fileNameOf(img.url)}`);
        for (const [url, path] of paths) {
          const [exists] = await bucket.file(path).exists();
          if (exists) continue;
          const res = await fetch(url, { method: write ? 'GET' : 'HEAD', headers: { 'User-Agent': 'Mozilla/5.0' } });
          if (!res.ok) { paths.delete(url); report.push(`- Bild fehlt (HTTP ${res.status}): ${url}`); continue; }
          if (write) await bucket.file(path).save(Buffer.from(await res.arrayBuffer()), { contentType: res.headers.get('content-type') ?? undefined, resumable: false });
        }
        const key = `${target}_s${String(++n).padStart(2, '0')}`;
        sectionKeys.push([key, articleOf(key, block, paths)]);
      }
    }

    // a page that was only a form: a note until the form is rebuilt in the form builder
    if (sectionKeys.length === 0 && FORM_PAGES[target]) {
      const key = `${target}_s01`;
      sectionKeys.push([key, articleOf(key, { title: NEW_PAGES[target].name, html: FORM_PAGES[target] }, new Map())]);
    }

    // the page itself: create a new website page, or fill a group content page that still holds only its seed intro
    const pageRef = db.doc(`pages/${target}`);
    const current = (await pageRef.get()).data();
    const keys = sectionKeys.map(([k]) => k);
    if (target === 'la21staefa_projektgruppen') keys.push(`${T}_home_groups`); // the group cards, shared with the home page
    if (!current) {
      const meta = NEW_PAGES[target];
      console.log(`${write ? 'creating     ' : 'would create '} pages/${target} (${keys.length} sections)`);
      if (write) {
        await pageRef.create({
          name: meta?.name ?? target, title: meta?.name ?? target, subTitle: '', type: 'content', state: 'published', isPrivate: false,
          sections: keys, tenants: [T], isArchived: false, index: `n:${meta?.name ?? target} a:content k:${target}`,
          abstract: '', notes: 'von www.la21staefa.ch übernommen (1.165)', tags: '', meta: [],
        });
      }
    } else {
      const seedIntro = `g-${target.replace(/_content$/, '')}`;
      const untouched = JSON.stringify(current.sections ?? []) === JSON.stringify([seedIntro]);
      if (!untouched) { report.push(`- Seite ${target} wurde seit dem Anlegen bearbeitet: Inhalte nicht eingefügt`); continue; }
      console.log(`${write ? 'filling      ' : 'would fill   '} pages/${target} (${keys.length} sections)`);
      if (write) await pageRef.update({ sections: keys });
    }
    for (const [key, data] of sectionKeys) {
      const ref = db.doc(`sections/${key}`);
      if ((await ref.get()).exists) continue;
      if (write) await ref.create(data);
    }
  }

  const text = `# la21staefa.ch: was nicht automatisch übernommen wurde\n\n${report.join('\n')}\n`;
  if (r >= 0) writeFileSync(resolve(process.argv[r + 1]), text);
  console.log(`\n${report.length} report lines${r >= 0 ? ` → ${process.argv[r + 1]}` : ''}`);
  if (!write) console.log('Dry run: nothing written. Add --write.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((e) => { console.error(e.stack ?? String(e)); process.exit(1); });
}
