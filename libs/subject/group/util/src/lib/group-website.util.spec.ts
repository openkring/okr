import { describe, expect, it } from 'vitest';

import { groupWebsiteStarterSections, GROUP_WEBSITE_TITLES_DE, hasOnlyDefaultSection } from './group-website.util';

const group = { okey: 'reparatur', name: 'Reparatur Café Stäfa' };

describe('groupWebsiteStarterSections (spec 1.165 §7.3)', () => {
  const specs = groupWebsiteStarterSections(group, GROUP_WEBSITE_TITLES_DE);

  it('lays out seven sections in the standard order', () => {
    expect(specs.map(s => [s.key, s.type])).toEqual([
      ['reparatur_hero', 'hero'],
      ['reparatur_when', 'article'],
      ['reparatur_events', 'events'],
      ['reparatur_details', 'accordion'],
      ['reparatur_contact', 'article'],
      ['reparatur_sdg', 'tiles'],
      ['reparatur_news', 'news'],
    ]);
  });

  it('titles the hero with the group name', () => {
    expect(specs[0].title).toBe('Reparatur Café Stäfa');
  });

  it('lists the group calendar: the events section name is the group key', () => {
    expect(specs[2].name).toBe('reparatur');
    expect(specs[2].properties['maxEvents']).toBe(5);
  });

  it('filters the news by the group key', () => {
    expect(specs[6].properties['tag']).toBe('reparatur');
    expect(specs[6].properties['maxItems']).toBe(3);
  });

  it('draws the SDG tiles as cards', () => {
    expect(specs[5].properties['variant']).toBe('card');
  });

  it('creates every section as a draft, so nothing half-done reaches the website', () => {
    expect(specs.every(s => s.state === 'draft')).toBe(true);
  });
});

describe('hasOnlyDefaultSection', () => {
  it('is true for a new group page with its default article', () => {
    expect(hasOnlyDefaultSection(['g-reparatur'], 'reparatur')).toBe(true);
    expect(hasOnlyDefaultSection([], 'reparatur')).toBe(true);
  });

  it('is false once the page has content of its own', () => {
    expect(hasOnlyDefaultSection(['g-reparatur', 'abc'], 'reparatur')).toBe(false);
    expect(hasOnlyDefaultSection(['abc'], 'reparatur')).toBe(false);
  });
});
