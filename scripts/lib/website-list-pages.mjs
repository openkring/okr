/**
 * Pure planner of scripts/seed-website-list-pages.mjs: turns the «/news» and «/termine» links of a website
 * tree into page entries with a CMS page behind them, so the heading of these two fixed pages (website.json,
 * `editable`) is edited in the app and the sitemap shows a page.
 */

const section = (tenant, key, { title, subTitle, kicker, en }) => ({
  name: key, type: 'hero', state: 'published', roleNeeded: 'public', colSize: '12', color: 0,
  title, subTitle, intro: kicker, introPosition: 'above',
  notes: 'Titelbereich der Website-Seite (seed-website-list-pages.mjs).',
  content: { htmlContent: '', colSize: 6, position: 0 },
  properties: {
    ctas: [],
    ...(en ? { titleI18n: { en: en.title }, subTitleI18n: { en: en.subTitle }, introI18n: { en: en.kicker } } : {}),
  },
  tags: '', isArchived: false, tenants: [tenant], index: `n:${key} t:hero tt:${title.toLowerCase()}`,
});

const page = (tenant, key, fields) => ({
  name: key, title: '', subTitle: '', abstract: '', logoUrl: '', logoAltText: '', bannerUrl: '', bannerAltText: '',
  meta: [], type: 'content', state: 'published', isPrivate: false, blogType: 'minimal', sections: [], tags: '',
  notes: 'Seite der Website-Liste, die Liste selbst kommt aus der Vorlage (seed-website-list-pages.mjs).',
  isArchived: false, tenants: [tenant], index: `n:${key} k:${key} tt:${(fields.title ?? '').toLowerCase()}`, ...fields,
});

/** Today's headings of the templates, per site. scs: a hero per page (with English); la21staefa: the page's own fields.
 * The texts must fit the app's forms, else the page cannot be saved there: page title 50, page abstract 500 (page.validations.ts;
 * the page's subTitle takes 50 only), section title and subTitle 100 (base-section.validations.ts). */
export const LIST_PAGES = {
  scs: [
    {
      slug: 'news', pageKey: 'scsw_news', title: 'News',
      hero: {
        title: 'News & Erfolge', kicker: 'Aktuell',
        subTitle: 'Aktuelles aus dem Vereinsleben, Erfolge an Regatten und Hintergründe zu unseren Projekten.',
        en: { title: 'News & results', kicker: 'Latest', subTitle: 'Updates from our club, regatta results, and stories behind our projects.' },
      },
    },
    {
      slug: 'termine', pageKey: 'scsw_termine', title: 'Termine',
      hero: {
        title: 'Termine', kicker: 'Agenda',
        subTitle: 'Anlässe, Regatten und Vereinstermine im Überblick.',
        en: { title: 'Events', kicker: 'Agenda', subTitle: 'Events, regattas, and club activities at a glance.' },
      },
    },
  ],
  la21staefa: [
    { slug: 'news', pageKey: 'la21staefa_news', title: 'News & Erfolge', abstract: 'Neuigkeiten aus dem Verein und unseren Projektgruppen.' },
    { slug: 'termine', pageKey: 'la21staefa_termine', title: 'Termine', abstract: 'Veranstaltungen des Vereins und der Projektgruppen im Überblick.' },
  ],
};

/** The first active link node of `nodes` whose url is exactly `url`, depth first. */
function findLink(nodes, url) {
  for (const n of nodes ?? []) {
    if (n.isArchived) continue;
    if (n.type === 'link' && (n.url ?? '').trim() === url) return n;
    const hit = findLink(n.children, url);
    if (hit) return hit;
  }
  return undefined;
}

const replaceNode = (nodes, id, next) => (nodes ?? []).map((n) => {
  if (n.id === id) return next;
  return n.children?.length ? { ...n, children: replaceNode(n.children, id, next) } : n;
});

const hasSlug = (nodes, slug) => (nodes ?? []).some((n) => !n.isArchived && ((n.type === 'page' && n.slug === slug) || hasSlug(n.children, slug)));

/**
 * The plan for `site` (a websites doc): the new nav, the page and section docs to create and one line per
 * change. A slug that already has a page entry is left alone; without a link to convert the page is skipped.
 * The entry keeps its id, its place and its label (the menu shows «Alle» below «News»).
 */
export function planListPages(siteId, site) {
  const tenant = site.tenants[0];
  let nav = site.nav ?? [];
  const pages = {};
  const sections = {};
  const lines = [];
  for (const spec of LIST_PAGES[siteId] ?? []) {
    if (hasSlug([...nav, ...(site.footer ?? [])], spec.slug)) { lines.push(`/${spec.slug}: already a page entry, skipped`); continue; }
    const link = findLink(nav, `/${spec.slug}`);
    if (!link) { lines.push(`/${spec.slug}: no link in the navigation, skipped`); continue; }
    nav = replaceNode(nav, link.id, {
      id: link.id, type: 'page', label: link.label, ...(link.labelI18n ? { labelI18n: link.labelI18n } : {}),
      pageKey: spec.pageKey, slug: spec.slug,
    });
    const heroKey = `${spec.pageKey}_hero`;
    if (spec.hero) sections[heroKey] = section(tenant, heroKey, spec.hero);
    pages[spec.pageKey] = page(tenant, spec.pageKey, {
      title: spec.title, abstract: spec.abstract ?? '', sections: spec.hero ? [heroKey] : [],
    });
    lines.push(`/${spec.slug}: link «${link.label}» (${link.id}) becomes a page entry of ${spec.pageKey}`);
  }
  return { nav, pages, sections, lines };
}
