import { describe, expect, it } from 'vitest';
import { HeroConfig } from '@okr/shared-models';
import { FootprintView, SectionView } from './journal-view.util';
import { sectionModelOf } from './journal-section.util';
import { filledHero, footprintChips, footprintHeroChips } from './journal-story.util';

const section = (p: Partial<SectionView>): SectionView =>
  ({ key: 'h1', type: 'hero', title: '', htmlContent: '', properties: {}, order: 'A', authorKey: 'bruno', hlcs: {}, conflict: false, ...p });
const base: FootprintView = {
  key: 'f1', journalKey: 'j1', title: 'Neko Harbour', placeName: 'Antarktische Halbinsel', date: '20270114', time: '09:00',
  latitude: -64.8333, longitude: -62.5333, publishState: 'draft', hlcs: {}, lostValues: [],
  sections: [],
};

describe('journal story', () => {
  it('filledHero takes title, place and chips from the footprint and keeps the stored cover and overlay', () => {
    const stored = sectionModelOf(section({ title: 'alt', properties: { hero: { label: 'i1' }, overlay: { title: true } } }), 'bkg');
    const hero = filledHero(stored, base);
    expect(hero.title).toBe('Neko Harbour');
    expect(hero.subTitle).toBe('Antarktische Halbinsel');
    const props = hero.properties as HeroConfig;
    expect(props.chips).toEqual(['14.01.2027', '64°50′S 62°32′W']);
    expect(props.hero.label).toBe('i1');
    expect(props.overlay).toEqual({ title: true });
    expect(hero.tenants).toEqual(['bkg']);
  });

  it('filledHero leaves any other section unchanged', () => {
    const article = sectionModelOf(section({ key: 'a1', type: 'article', title: 'Eigener Titel' }), 'bkg');
    expect(filledHero(article, base)).toBe(article);
  });

  it('footprintChips formats coordinates in degrees and minutes', () => {
    expect(footprintChips({ ...base, date: '', time: '' })).toEqual(['64°50′S 62°32′W']);
    expect(footprintChips({ ...base, latitude: 47.2312, longitude: 8.7123, date: '', time: '' })).toEqual(['47°14′N 8°43′E']);
    expect(footprintChips({ ...base, latitude: undefined, longitude: undefined })).toEqual(['14.01.2027', '09:00']);
  });

  it('the hero shows date, coordinates, weather and sun times, never the time', () => {
    const weather = { code: 3, min: -2.6, max: 4.4, precip: 1.6, sunrise: '04:10', sunset: '23:40' };
    expect(footprintHeroChips({ ...base, weather })).toEqual(['14.01.2027', '64°50′S 62°32′W', '-3–4 °C, 2 mm', '☀ 04:10–23:40']);
  });
});
