import {
  ARTICLE_SECTION_SHAPE, articleBlocksOf, articleCover, blocksFromClassic, withClassicFields,
  type ArticleLike, type ArticleSection, type MailBlock, type SectionModel, type UserModel, type WebsiteModel,
} from '@okr/shared-models';
import { belongsToTenant, hasRole, shortenText } from '@okr/shared-util-core';

import { hasImageUrl, isObject, type Loose } from './article-block.util';
import type { NewId } from './article-editor.util';
import { escapeHtml, germanHtml, headerHtml, linkedImage, mailBlockOf, objectOf, showsSomething, str, textBlock } from './mail-block-parts';

/**
 * The article of a Versand mail, and what articles give to one («Artikel einfügen», spec 1.176 §8.3). All functions are pure, never
 * mutate their input and never throw on malformed stored data.
 */

/** The one section of a mail page: only blocks, never the old fields, which an older server would send instead. */
export function mailArticle(tenantId: string, blocks: MailBlock[]): ArticleSection {
  const shape = Object.entries(ARTICLE_SECTION_SHAPE).filter(([field]) => field !== 'content');
  return { ...Object.fromEntries(shape), tenants: [tenantId], properties: { blocks } } as unknown as ArticleSection;
}

// ------------------------------------------------------- inserting -------------------------------------------------------

/** The whole article: its title (with subtitle and intro) as a text, then its blocks (see `mailBlockOf`). `replace`: placeholders such as @APPNAME@. */
export function mailBlocksFromArticle(section: ArticleSection, replace: (html: string) => string, newId: NewId): MailBlock[] {
  if (!isObject(section)) return [];
  const article: Loose = section;
  const header = headerHtml(article);
  const blocks = articleBlocksOf(article) ?? classicBlocks(article);
  return [
    ...(header ? [textBlock(newId(), replace(header))] : []),
    ...blocks.map((block) => mailBlockOf(block as unknown as Loose, replace, newId)),
  ];
}

/** The blocks of an article with the old fields, without those that show nothing there: pictures without address, an empty text or button. */
function classicBlocks(article: Loose): Loose[] {
  const properties = objectOf(article['properties']);
  const images = Array.isArray(properties['images']) ? properties['images'].filter(hasImageUrl) : [];
  const blocks = blocksFromClassic({ ...article, properties: { ...properties, images } } as ArticleLike).blocks as unknown as Loose[];
  return blocks.filter((block) => {
    const cta = objectOf(block['cta']);
    if (block['type'] === 'button') return str(cta['label']) !== '' || str(cta['url']) !== '';
    return block['type'] !== 'text' || showsSomething(germanHtml(block));
  });
}

/** The article as a teaser that leads to `url`: cover, title and the excerpt of the news list, «Weiterlesen». */
export function teaserBlocks(section: ArticleSection, url: string, labels: { more: string }, newId: NewId): MailBlock[] {
  const article: Loose = objectOf(section);
  const cover = articleCover(article);
  const title = str(article['title']);
  const html: unknown = objectOf(withClassicFields(article)['content'])['htmlContent'];
  // as in the news list the result is html: only its tags were removed
  const excerpt = showsSomething(html) ? shortenText(html as string, 30, true) : '';
  const text = (title ? `<h2>${escapeHtml(title)}</h2>` : '') + (excerpt ? `<p>${excerpt}</p>` : '');
  const blocks: MailBlock[] = [];
  if (cover && hasImageUrl(cover)) blocks.push({ id: newId(), type: 'image', ...linkedImage(cover, url) });
  if (text) blocks.push(textBlock(newId(), text));
  blocks.push({ id: newId(), type: 'button', cta: { label: labels.more, url, style: 'primary' } });
  return blocks;
}

// ------------------------------------------------------- choosing -------------------------------------------------------

/** The articles the user may insert (§8.3): published ones of the tenant that they see in the app, newest first. Journal articles are private. */
export function articlesToInsert(sections: SectionModel[], user: UserModel | undefined, tenantId: string): ArticleSection[] {
  const stored: unknown = sections;
  const articles = (Array.isArray(stored) ? stored : []).filter((section): section is ArticleSection => isObject(section) && section['type'] === 'article'
    && !section['isArchived'] && section['state'] === 'published' && !section['journalKey']
    && belongsToTenant(section as unknown as SectionModel, tenantId) && maySee(section['roleNeeded'], user));
  const date = (section: ArticleSection): string => str(objectOf(section.properties)['datePublished']);
  return articles.sort((a, b) => date(b).localeCompare(date(a)));
}

/** The rule of the section dispatcher. An unknown role throws there; here nobody sees the article. */
function maySee(roleNeeded: unknown, user: UserModel | undefined): boolean {
  try {
    return hasRole(roleNeeded as SectionModel['roleNeeded'], user && { ...user, roles: user.roles ?? {} } as UserModel);
  } catch {
    return false;
  }
}

// ------------------------------------------------------- the page of an article -------------------------------------------------------

/** The sites with a news article page. */
const NEWS_ARTICLE_SITES: readonly string[] = ['scs', 'la21staefa'];

/** The id of an article in an address: its name, else its key. The rule of publicApi (functions, routes/news.ts), which an app cannot import. */
export function articleSlug(section: Pick<ArticleSection, 'name' | 'okey'>): string {
  return str(section.name) || str(section.okey);
}

/**
 * `isPublicRole` of `@okr/cms-website-render` (publicApi serves a news article by it). Not imported: that lib brings Handlebars, and
 * this one is in the eager bundle of every app.
 */
function isPublicRole(roleNeeded: unknown): boolean {
  return roleNeeded === 'none' || roleNeeded === 'public';
}

/**
 * The page where everybody can read the article without login; undefined when there is none. The news API serves the published, public
 * articles of the site's tenant only: the article's `tenants` must contain the site's key, which is the tenant's.
 */
export function newsArticleUrl(site: Pick<WebsiteModel, 'okey' | 'domain'> | undefined, section: ArticleSection): string | undefined {
  const origin = str(objectOf(site)['domain']).replace(/\/+$/, '');
  const siteKey = str(objectOf(site)['okey']);
  if (!isObject(section) || !NEWS_ARTICLE_SITES.includes(siteKey) || !/^https:\/\/[^\s/?#]+$/.test(origin)) return undefined;
  const article: Loose = section;
  if (article['type'] !== 'article' || article['isArchived'] || article['state'] !== 'published' || !isPublicRole(article['roleNeeded'])) return undefined;
  if (!Array.isArray(article['tenants']) || !article['tenants'].includes(siteKey)) return undefined;
  const slug = articleSlug(section);
  try {
    return slug ? `${origin}/news-artikel?slug=${encodeURIComponent(slug)}` : undefined;
  } catch {
    return undefined;    // no valid unicode
  }
}
