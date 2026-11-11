/**
 * Seed format for a tenant website (spec 1.153, `website:import`). Documented by
 * scripts/lib/website-seed.schema.json; validateSeed() is the enforced version, plus the cross-reference
 * checks a schema cannot express (page keys, section ids, unique slugs).
 *
 *   { format: 1, site: <websites doc>, pages: { <pageKey>: <pages doc> }, sections: { <id>: <sections doc> },
 *     images?: [{ path: <storage path>, file: <path relative to content/> }] }
 */
const SITE_ID = /^[\w-]+$/;
const HOSTING_SITE = /^[a-z0-9-]+-website-[a-z0-9]+$/;
const SLUG = /^[a-z0-9-]+$/;
const NODE_TYPES = ['menu', 'page', 'link'];

const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const isText = (v) => typeof v === 'string' && v.trim() !== '';

/** Every problem found in `seed`, as readable strings; empty = valid. */
export function validateSeed(seed) {
  if (!isObject(seed)) return ['seed must be an object'];
  const errors = [];
  const { site, pages, sections, images } = seed;
  if (!isObject(site)) errors.push('site must be an object');
  if (!isObject(pages)) errors.push('pages must be an object');
  if (!isObject(sections)) errors.push('sections must be an object');
  if (!isObject(site) || !isObject(pages) || !isObject(sections)) return errors;

  if (!(typeof site.okey === 'string' && SITE_ID.test(site.okey))) errors.push('site.okey must match [A-Za-z0-9_-]+');
  if (!isText(site.name)) errors.push('site.name is required');
  if (!(typeof site.hostingSite === 'string' && HOSTING_SITE.test(site.hostingSite))) errors.push('site.hostingSite must look like <tenant>-website-<id>');
  if (!(typeof site.domain === 'string' && /^https:\/\/[^/\s]+$/.test(site.domain))) errors.push('site.domain must be an https origin without path');
  if (!(Array.isArray(site.languages) && site.languages.includes('de') && site.languages.every(isText))) errors.push('site.languages must be a list of language codes including "de"');
  if (!isText(site.homePageKey)) errors.push('site.homePageKey is required');
  else if (!(site.homePageKey in pages)) errors.push(`site.homePageKey "${site.homePageKey}" is not in pages`);
  for (const tree of ['nav', 'footer']) {
    if (!Array.isArray(site[tree])) errors.push(`site.${tree} must be a list`);
  }

  const ids = new Set();
  const slugs = new Set();
  const visit = (nodes, where) => {
    nodes.forEach((n, i) => {
      const at = `${where}[${i}]`;
      if (!isObject(n)) return errors.push(`${at} must be an object`);
      if (!isText(n.id)) errors.push(`${at}.id is required`);
      else if (ids.has(n.id)) errors.push(`${at}: duplicate node id "${n.id}"`);
      else ids.add(n.id);
      if (!isText(n.label)) errors.push(`${at}.label is required`);
      if (!NODE_TYPES.includes(n.type)) return errors.push(`${at}: unknown type "${n.type}"`);
      if (n.type === 'page') {
        if (!isText(n.pageKey)) errors.push(`${at}.pageKey is required`);
        else if (!(n.pageKey in pages)) errors.push(`${at}: pageKey "${n.pageKey}" is not in pages`);
        if (!(typeof n.slug === 'string' && SLUG.test(n.slug))) errors.push(`${at}.slug must match [a-z0-9-]+`);
        else if (slugs.has(n.slug)) errors.push(`${at}: duplicate slug "${n.slug}"`);
        else slugs.add(n.slug);
      } else if (n.type === 'link') {
        if (!isText(n.url)) errors.push(`${at}.url is required`);
      } else if (n.children !== undefined) {
        if (Array.isArray(n.children)) visit(n.children, `${at}.children`);
        else errors.push(`${at}.children must be a list`);
      }
    });
  };
  for (const tree of ['nav', 'footer']) if (Array.isArray(site[tree])) visit(site[tree], `site.${tree}`);

  const tenant = Array.isArray(site.tenants) && isText(site.tenants[0]) ? site.tenants[0] : site.okey;
  for (const [key, page] of Object.entries(pages)) {
    if (!isObject(page)) {
      errors.push(`pages.${key} must be an object`);
      continue;
    }
    if (!Array.isArray(page.sections)) {
      errors.push(`pages.${key}.sections must be a list`);
      continue;
    }
    for (const raw of page.sections) {
      if (typeof raw !== 'string' || !(raw in sections || String(raw).replace('@TID@', tenant) in sections)) {
        errors.push(`pages.${key}: section "${raw}" is not in sections`);
      }
    }
  }
  for (const [id, section] of Object.entries(sections)) {
    if (!isObject(section)) errors.push(`sections.${id} must be an object`);
    else if (!isText(section.type)) errors.push(`sections.${id}.type is required`);
  }

  if (images !== undefined) {
    if (!Array.isArray(images)) errors.push('images must be a list');
    else {
      images.forEach((img, i) => {
        if (!isObject(img) || !isText(img.path)) errors.push(`images[${i}].path is required`);
        if (!isObject(img) || !isText(img.file)) errors.push(`images[${i}].file is required`);
        else if (img.file.startsWith('/') || img.file.split('/').includes('..')) errors.push(`images[${i}].file must be relative, inside content/`);
      });
    }
  }
  return errors;
}
