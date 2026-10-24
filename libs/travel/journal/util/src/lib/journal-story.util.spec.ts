import { describe, expect, it } from 'vitest';
import { FootprintView, ImageView } from './journal-view.util';
import { footprintChips, toStorySections } from './journal-story.util';

const fileUrl = (p: string) => `capacitor://localhost/_capacitor_file_/docs/${p}`;
function image(key: string): ImageView {
  return { key, authorKey: 'bruno', takenAt: '2027-01-14T09:00:00', width: 2048, height: 1536, path2048: `journals/j1/${key}-2048.jpg`, path400: `journals/j1/${key}-400.jpg`, localIdentifier: key };
}
const base: FootprintView = {
  key: 'f1', journalKey: 'j1', title: 'Neko Harbour', placeName: 'Antarktische Halbinsel', date: '20270114', time: '09:00',
  latitude: -64.8333, longitude: -62.5333, publishState: 'draft',
  blocks: [
    { key: 's1', kind: 'text', authorKey: 'bruno', order: 'G', html: '<p>Pinguine</p>' },
    { key: 's2', kind: 'photos', authorKey: 'barbara', order: 'V', imageKeys: ['i1', 'missing', 'i2'] },
  ],
};

describe('journal story', () => {
  it('toStorySections builds the hero from the first photo', () => {
    const story = toStorySections(base, new Map([['i1', image('i1')], ['i2', image('i2')]]), fileUrl, 'bkg');
    expect(story.hero?.type).toBe('hero');
    expect(story.hero?.title).toBe('Neko Harbour');
    expect(story.hero?.subTitle).toBe('Antarktische Halbinsel');
    expect(story.hero?.properties.hero.url).toBe(fileUrl('journals/j1/i1-2048.jpg'));
    expect(story.hero?.properties.chips).toEqual(['14.01.2027', '09:00', '64°50′S 62°32′W']);
    expect(story.hero?.tenants).toEqual(['bkg']);
  });

  it('toStorySections maps text to an article and photos to a collage album', () => {
    const story = toStorySections(base, new Map([['i1', image('i1')], ['i2', image('i2')]]), fileUrl, 'bkg');
    expect(story.blocks.map((b) => b.section.type)).toEqual(['article', 'album']);
    expect(story.blocks[0].section.content.htmlContent).toBe('<p>Pinguine</p>');
    expect(story.blocks[0].section.authorKey).toBe('bruno');
    expect(story.blocks[1].section.properties).toMatchObject({ albumStyle: 'collage' });
    expect(story.blocks[1].section.authorKey).toBe('barbara');
  });

  it('toStorySections drops images that are not in the store', () => {
    const story = toStorySections(base, new Map([['i1', image('i1')], ['i2', image('i2')]]), fileUrl, 'bkg');
    expect(story.blocks[1].images?.map((i) => i.url)).toEqual([fileUrl('journals/j1/i1-2048.jpg'), fileUrl('journals/j1/i2-2048.jpg')]);
  });

  it('a footprint without photos has no hero', () => {
    const story = toStorySections({ ...base, blocks: [base.blocks[0]] }, new Map(), fileUrl, 'bkg');
    expect(story.hero).toBeUndefined();
  });

  it('footprintChips formats coordinates in degrees and minutes', () => {
    expect(footprintChips({ ...base, date: '', time: '' })).toEqual(['64°50′S 62°32′W']);
    expect(footprintChips({ ...base, latitude: 47.2312, longitude: 8.7123, date: '', time: '' })).toEqual(['47°14′N 8°43′E']);
    expect(footprintChips({ ...base, latitude: undefined, longitude: undefined })).toEqual(['14.01.2027', '09:00']);
  });

  it('a photo without a URL yet is left out, never a blank tile', () => {
    const story = toStorySections(base, new Map([['i1', image('i1')], ['i2', image('i2')]]), (p) => (p.includes('i1') ? '' : fileUrl(p)), 'bkg');
    expect(story.blocks[1].images?.map((i) => i.url)).toEqual([fileUrl('journals/j1/i2-2048.jpg')]);
  });
});
