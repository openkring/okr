/**
 * A group's content page as its website page (spec 1.165 §7). When a group is shown on the website
 * for the first time, its page gets a starter layout (§7.3) the group admins fill in — all as
 * drafts, so a half-filled section never reaches the website; they publish each one when it is ready.
 */
export type StarterSectionType = 'hero' | 'article' | 'events' | 'accordion' | 'tiles' | 'news';

export interface StarterSectionSpec {
  key: string; // section document id: <groupKey>_<part>
  type: StarterSectionType;
  name: string; // events: the calendar key (= group key); else the section name
  title: string;
  state: 'draft';
  properties: Record<string, unknown>; // merged over the type's default config
}

export interface GroupWebsiteTitles {
  when: string;
  events: string;
  details: string;
  contact: string;
  sdg: string;
  news: string;
}

/** German defaults; the store passes its translated titles. */
export const GROUP_WEBSITE_TITLES_DE: GroupWebsiteTitles = {
  when: 'Wann und wo', events: 'Nächste Termine', details: 'Details zum Projekt', contact: 'Kontakt',
  sdg: 'Nachhaltigkeitsziele', news: 'Neuigkeiten',
};

export function groupWebsiteStarterSections(group: { okey: string; name: string }, titles: GroupWebsiteTitles): StarterSectionSpec[] {
  const k = group.okey;
  const spec = (part: string, type: StarterSectionType, title: string, properties: Record<string, unknown> = {}, name = `${k}-${part}`): StarterSectionSpec =>
    ({ key: `${k}_${part}`, type, name, title, state: 'draft', properties });
  return [
    spec('hero', 'hero', group.name),
    spec('when', 'article', titles.when),
    spec('events', 'events', titles.events, { maxEvents: 5 }, k),
    spec('details', 'accordion', titles.details),
    spec('contact', 'article', titles.contact),
    spec('sdg', 'tiles', titles.sdg, { variant: 'card', columns: 4, items: [] }),
    spec('news', 'news', titles.news, { maxItems: 3, tag: k, blogPageKey: 'news_@TID@' }),
  ];
}

/** True while the group page holds nothing but the article it was created with (`g-<groupKey>`). */
export function hasOnlyDefaultSection(sectionKeys: string[] | undefined, groupKey: string): boolean {
  return (sectionKeys ?? []).every(key => key === `g-${groupKey}`);
}
