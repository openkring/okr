/**
 * What import-news.mjs and seed-forms.mjs share. Taken from import-pages.mjs, which was retired before the migration to
 * blocks (spec 1.173 §11): the page import is done.
 */

/** pages that held only a form on the old site: what they say until the form is rebuilt */
export const FORM_PAGES = {
  la21staefa_anmeldung: '<p>Werde Mitglied der LA21 Stäfa und unterstütze damit alle Projektgruppen. Schreib uns mit deinem Namen und deiner Adresse an <a href="mailto:info@la21staefa.ch?subject=Mitgliedschaft">info@la21staefa.ch</a> – wir melden uns bei dir.</p>',
  la21staefa_kontakt: '<p>Du erreichst uns per E-Mail an <a href="mailto:info@la21staefa.ch">info@la21staefa.ch</a>.</p><p>Verein Lokale Agenda 21 Stäfa<br>Bauertacherweg 4<br>8712 Stäfa</p>',
};

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
