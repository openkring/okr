import { describe, expect, it } from 'vitest';

import { sortByLabel } from './card-select.util';

describe('sortByLabel', () => {
  const items = [{ name: 'counter' }, { name: 'album' }, { name: 'contact' }, { name: 'events' }];

  it('sorts by the translated label, not by the key', () => {
    const labels = { counter: 'Zähler', album: 'Album', contact: 'Kontakt', events: 'Anlässe' };
    expect(sortByLabel(items, labels, 'de').map(e => e.label)).toEqual(['Album', 'Anlässe', 'Kontakt', 'Zähler']);
  });

  it('ignores case and accents', () => {
    const labels = { counter: 'éclair', album: 'Echo', contact: 'delta', events: 'Fox' };
    expect(sortByLabel(items, labels, 'fr').map(e => e.item.name)).toEqual(['contact', 'album', 'counter', 'events']);
  });

  it('falls back to the name while a label is missing', () => {
    const sorted = sortByLabel(items, { counter: 'Zähler' }, 'de');
    expect(sorted.map(e => e.label)).toEqual(['album', 'contact', 'events', 'Zähler']);
  });

  it('does not mutate the input', () => {
    sortByLabel(items, {}, 'de');
    expect(items[0].name).toBe('counter');
  });
});
