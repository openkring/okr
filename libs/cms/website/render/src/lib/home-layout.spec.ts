import { homeRowPlan } from './home-layout';

const hero = { type: 'hero', name: 'top' };
const text = { type: 'article', name: 'ueber-uns', images: [] };
const withImage = { type: 'article', name: 'bootshaus', images: [{ url: 'u' }] };
const stat = { type: 'tiles', name: 'zahlen', variant: 'stat' };
const card = { type: 'tiles', name: 'kurse', variant: 'card' };
const events = { type: 'events', name: 'termine' };

describe('homeRowPlan', () => {
  it('pairs a text article with the stat tiles right after it', () => {
    const plan = homeRowPlan([hero, text, stat, card, withImage, events]);
    expect(plan.map((r) => r.kind)).toEqual(['hero', 'pair', 'single', 'single', 'single']);
    expect(plan[1].sections).toEqual([text, stat]);
    expect(plan[2].sections).toEqual([card]);
  });

  it('does not pair an article with images, or with card tiles', () => {
    expect(homeRowPlan([withImage, stat]).map((r) => r.kind)).toEqual(['single', 'single']);
    expect(homeRowPlan([text, card]).map((r) => r.kind)).toEqual(['single', 'single']);
    expect(homeRowPlan([stat, text]).map((r) => r.kind)).toEqual(['single', 'single']);
  });

  it('treats every hero as a hero row, wherever it stands', () => {
    expect(homeRowPlan([text, hero, hero]).map((r) => r.kind)).toEqual(['single', 'hero', 'hero']);
  });

  it('names a row after its first section, a pair after the tiles when the article has no name', () => {
    expect(homeRowPlan([text, stat])[0].name).toBe('ueber-uns');
    expect(homeRowPlan([{ ...text, name: '' }, stat])[0].name).toBe('zahlen');
    expect(homeRowPlan([{ type: 'table' }])[0].name).toBe('');
  });

  it('copes with an empty list and non-records', () => {
    expect(homeRowPlan([])).toEqual([]);
    expect(homeRowPlan([{ type: 'article' }, stat]).map((r) => r.kind)).toEqual(['pair']);
  });
});
