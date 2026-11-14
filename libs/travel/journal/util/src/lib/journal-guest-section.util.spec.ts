import { describe, expect, it } from 'vitest';
import { AlbumConfig, HeroConfig } from '@okr/shared-models';
import { guestSectionItems, GuestSectionInput, guestSectionModelOf } from './journal-guest-section.util';

const img = (label: string) => ({ label, url: '', altText: 'x' });
const input = (p: Partial<GuestSectionInput>): GuestSectionInput =>
  ({ key: 's1', type: 'article', title: '', html: '', properties: {}, photos: [], videos: [], ...p });
const withAuthor = (s: GuestSectionInput) => ({ ...s, authorName: 'Anna' });

describe('journal guest sections', () => {
  it('maps the signed photos onto the album images by journal key and drops images without one', () => {
    const { section } = guestSectionModelOf(input({
      type: 'album', properties: { images: [img('i2'), img('i1'), img('i9')] },
      photos: [{ key: 'i1', url: 'https://x/1' }, { key: 'i2', url: 'https://x/2' }],
    }), 'bkg');
    expect((section.properties as AlbumConfig).images.map((i) => [i.label, i.url])).toEqual([['i2', 'https://x/2'], ['i1', 'https://x/1']]);
  });

  it('gives the hero its cover url from the signed photo', () => {
    const { section } = guestSectionModelOf(input({ type: 'hero', properties: { hero: img('c1') }, photos: [{ key: 'c1', url: 'https://x/c' }] }), 'bkg');
    expect((section.properties as HeroConfig).hero.url).toBe('https://x/c');
  });

  it('keeps the article html as the section content', () => {
    const { section } = guestSectionModelOf(input({ html: '<p>Hallo</p>' }), 'bkg');
    expect(section.content?.htmlContent).toBe('<p>Hallo</p>');
  });

  it('lists the clips in the section order with their signed urls', () => {
    const { clips } = guestSectionModelOf(input({
      type: 'video', properties: { clips: [img('v2'), img('v1')] },
      videos: [{ key: 'v1', poster: 'p1', url: 'u1' }, { key: 'v2', poster: 'p2', url: '' }],
    }), 'bkg');
    expect(clips).toEqual([{ key: 'v2', poster: 'p2', src: undefined }, { key: 'v1', poster: 'p1', src: 'u1' }]);
  });

  it('lets only the first hero lead and leaves unknown types out', () => {
    const items = guestSectionItems([
      withAuthor(input({ key: 'a', type: 'article' })),
      withAuthor(input({ key: 'h1', type: 'hero' })),
      withAuthor(input({ key: 'h2', type: 'hero' })),
      withAuthor({ ...input({ key: 'm' }), type: 'map' as never }),
    ], 'bkg');
    expect(items.map((i) => [i.section.okey, i.lead])).toEqual([['h1', true], ['a', false], ['h2', false]]);
  });
});
