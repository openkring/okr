import { describe, expect, it } from 'vitest';
import { AlbumConfig, HeroConfig, ViewPosition } from '@okr/shared-models';
import { guestSectionItems, GuestSectionInput, guestSectionModelOf, guestTrackData, GuestTrackInput, guestBaseLayers, guestBaseLayerId } from './journal-guest-section.util';

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
    expect((section.properties as AlbumConfig).images?.map((i) => [i.label, i.url])).toEqual([['i2', 'https://x/2'], ['i1', 'https://x/1']]);
  });

  it('gives the hero its cover url from the signed photo', () => {
    const { section } = guestSectionModelOf(input({ type: 'hero', properties: { hero: img('c1') }, photos: [{ key: 'c1', url: 'https://x/c' }] }), 'bkg');
    expect((section.properties as HeroConfig).hero.url).toBe('https://x/c');
  });

  it('keeps the article imageLayout and shows the images on top', () => {
    const { section } = guestSectionModelOf(input({
      properties: { images: [img('i1')], imageLayout: 'mosaic' }, photos: [{ key: 'i1', url: 'https://x/1' }],
    }), 'bkg');
    expect((section.properties as { imageLayout?: string }).imageLayout).toBe('mosaic');
    expect(section.content?.position).toBe(ViewPosition.Top);
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
      withAuthor(input({ key: 'a', type: 'article', html: '<p>Hallo</p>' })),
      withAuthor(input({ key: 'h1', type: 'hero', properties: { hero: img('c1') }, photos: [{ key: 'c1', url: 'https://x/c' }] })),
      withAuthor(input({ key: 'h2', type: 'hero', properties: { hero: img('c1') }, photos: [{ key: 'c1', url: 'https://x/c' }] })),
      withAuthor({ ...input({ key: 'm' }), type: 'gallery' as never }),
    ], 'bkg');
    expect(items.map((i) => [i.section.okey, i.lead])).toEqual([['h1', true], ['a', false], ['h2', false]]);
  });

  it('a first hero without a loadable cover does not lead and is not shown', () => {
    const items = guestSectionItems([
      withAuthor(input({ key: 'h1', type: 'hero', properties: { hero: img('c1') } })), // cover not signed
      withAuthor(input({ key: 'a', type: 'article', html: '<p>Hallo</p>' })),
    ], 'bkg');
    expect(items.map((i) => [i.section.okey, i.lead])).toEqual([['a', false]]);
    expect(guestSectionItems([withAuthor(input({ key: 'h1', type: 'hero' }))], 'bkg')).toEqual([]);
  });

  it('leaves out empty sections: an article without text or photos, an album without photos, a video without clips', () => {
    const items = guestSectionItems([
      withAuthor(input({ key: 'a0', type: 'article', html: '<p> </p>' })),
      withAuthor(input({ key: 'a1', type: 'article', title: 'Neko' })),
      withAuthor(input({ key: 'b0', type: 'album', properties: { images: [img('i9')] } })), // photo not signed
      withAuthor(input({ key: 'b1', type: 'album', properties: { images: [img('i1')] }, photos: [{ key: 'i1', url: 'https://x/1' }] })),
      withAuthor(input({ key: 'v0', type: 'video', properties: { clips: [img('v9')] } })), // clip not signed
      withAuthor(input({ key: 'v1', type: 'video', properties: { clips: [img('v1')] }, videos: [{ key: 'v1', poster: 'p1', url: 'u1' }] })),
    ], 'bkg');
    expect(items.map((i) => i.section.okey)).toEqual(['a1', 'b1', 'v1']);
  });

  describe('map and track sections (phase 5)', () => {
    const track = (p: Partial<GuestTrackInput> = {}): GuestTrackInput => ({
      name: 'Uetliberg', startedAt: '2026-08-04T08:00:00.000Z', distanceM: 12300,
      sections: [{ mode: 'walk', distanceM: 12300, encoded: '_p~iF~ps|U' }],
      photos: [{ imageKey: 'i1', lat: 47.3, lng: 8.5, takenAt: '2026-08-04T09:00:00.000Z', url: 'https://x/1', thumb: 'https://x/1t' }], ...p,
    } as GuestTrackInput);

    it('shows a map section always, with its properties unchanged', () => {
      const items = guestSectionItems([withAuthor(input({ key: 'm', type: 'map', properties: { zoom: 11, layer: 'world', showRoute: true } }))], 'bkg');
      expect(items.map((i) => i.section.okey)).toEqual(['m']);
      expect(items[0].section.properties).toMatchObject({ zoom: 11, layer: 'world', showRoute: true });
      expect(items[0].track).toBeUndefined();
    });

    it('shows a track section only with its track data and carries it on the item', () => {
      const withTrack = guestSectionItems([withAuthor(input({ key: 't', type: 'track', track: track() }))], 'bkg');
      expect(withTrack.map((i) => i.section.okey)).toEqual(['t']);
      expect(withTrack[0].track?.name).toBe('Uetliberg');
      expect(guestSectionItems([withAuthor(input({ key: 't', type: 'track' }))], 'bkg')).toEqual([]); // older server / track gone
      expect(guestSectionItems([withAuthor(input({ key: 't', type: 'track', track: track({ sections: [] }) }))], 'bkg')).toEqual([]);
    });

    it('takes no photo urls from the properties of a track section', () => {
      const [item] = guestSectionItems([withAuthor(input({ key: 't', type: 'track', track: track(), properties: { trackKey: 'trk__j__t', photos: ['https://evil/x'] } }))], 'bkg');
      expect(item.track?.photos.map((p) => p.url)).toEqual(['https://x/1']);
    });

    it('builds the track data: encoded sections, summary, photos by their signed urls', () => {
      const data = guestTrackData(track(), 'Strecke', (n) => `Foto ${n}`);
      expect(data.track.sections).toHaveLength(1);
      expect(data.summary).toBe('Uetliberg · 04.08.2026 · 12.3 km');
      expect(data.photos).toEqual([{ imageKey: 'i1', lat: 47.3, lng: 8.5, thumb: 'https://x/1t', url: 'https://x/1', alt: 'Foto 1' }]);
    });

    it('leaves out a photo without a url and falls back to the full url for a missing thumb', () => {
      const data = guestTrackData(track({ photos: [
        { imageKey: 'a', lat: 1, lng: 2, takenAt: '', url: '', thumb: '' },
        { imageKey: 'b', lat: 1, lng: 2, takenAt: '', url: 'https://x/b', thumb: '' },
      ] }), 'Strecke', (n) => `${n}`);
      expect(data.photos.map((p) => [p.imageKey, p.thumb, p.alt])).toEqual([['b', 'https://x/b', '1']]);
    });
  });

  describe('guest base layer', () => {
    const zurich: [number, number, number, number] = [8.5, 47.3, 8.6, 47.4];
    const tokyo: [number, number, number, number] = [139.6, 35.6, 139.8, 35.8];

    it('starts on swisstopo-live in Switzerland and on the world map elsewhere', () => {
      expect(guestBaseLayerId(guestBaseLayers(zurich), undefined)).toBe('swisstopo-live');
      expect(guestBaseLayerId(guestBaseLayers(tokyo), undefined)).toBe('world');
      expect(guestBaseLayerId(guestBaseLayers(undefined), undefined)).toBe('swisstopo-live');
    });

    it('keeps the section layer when offered, else falls back (a Google id is never offered)', () => {
      expect(guestBaseLayerId(guestBaseLayers(zurich), 'world')).toBe('world');
      expect(guestBaseLayerId(guestBaseLayers(zurich), 'google-satellite')).toBe('swisstopo-live');
      expect(guestBaseLayerId(guestBaseLayers(tokyo), 'swisstopo-live')).toBe('world');
    });
  });
});
