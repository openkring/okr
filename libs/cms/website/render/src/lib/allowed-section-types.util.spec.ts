import { describe, expect, it } from 'vitest';
import type { WebsiteModel, WebsiteNode } from '@okr/shared-models';

import { allowedSectionTypesForPage } from './allowed-section-types.util';

const node = (pageKey: string, over: Partial<WebsiteNode> = {}): WebsiteNode => ({ id: pageKey, type: 'page', label: pageKey, pageKey, slug: pageKey, ...over });
const site = (nav: WebsiteNode[], sectionTypes?: string[], footer: WebsiteNode[] = []): WebsiteModel =>
  ({ okey: 's', nav, footer, sectionTypes } as unknown as WebsiteModel);

describe('allowedSectionTypesForPage (spec 1.165 §7.5)', () => {
  it('has no limit for a page that is in no website tree', () => {
    expect(allowedSectionTypesForPage('intern', [site([node('verein')], ['article'])])).toBeUndefined();
  });

  it('limits a page in a tree to that site\'s section types', () => {
    expect(allowedSectionTypesForPage('verein', [site([node('verein')], ['article', 'hero'])])).toEqual(['article', 'hero']);
  });

  it('finds a page nested under a menu and in the footer', () => {
    const menu: WebsiteNode = { id: 'm', type: 'menu', label: 'Gruppen', children: [node('reparatur_content')] };
    expect(allowedSectionTypesForPage('reparatur_content', [site([menu], ['article'])])).toEqual(['article']);
    expect(allowedSectionTypesForPage('impressum', [site([], ['article'], [node('impressum')])])).toEqual(['article']);
  });

  it('intersects the types of two sites showing the same page', () => {
    const a = site([node('p')], ['article', 'hero', 'map']);
    const b = site([node('p')], ['article', 'map']);
    expect(allowedSectionTypesForPage('p', [a, b])).toEqual(['article', 'map']);
  });

  it('ignores an archived node', () => {
    expect(allowedSectionTypesForPage('p', [site([node('p', { isArchived: true })], ['article'])])).toBeUndefined();
  });

  it('ignores a page below an archived menu', () => {
    const menu: WebsiteNode = { id: 'm', type: 'menu', label: 'Alt', isArchived: true, children: [node('p')] };
    expect(allowedSectionTypesForPage('p', [site([menu], ['article'])])).toBeUndefined();
  });

  it('puts no limit from a site that has not stored its types yet', () => {
    expect(allowedSectionTypesForPage('p', [site([node('p')])])).toBeUndefined();
    expect(allowedSectionTypesForPage('p', [site([node('p')]), site([node('p')], ['article'])])).toEqual(['article']);
  });

  it('ignores an archived site', () => {
    const archived = { ...site([node('p')], ['article']), isArchived: true } as WebsiteModel;
    expect(allowedSectionTypesForPage('p', [archived])).toBeUndefined();
  });
});
