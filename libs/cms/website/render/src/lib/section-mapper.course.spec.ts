import { mapSection, type SectionDoc } from './section-mapper';

const sanitize = (h: string) => h;
const course = (properties: Record<string, unknown>): SectionDoc =>
  ({ type: 'course', name: 'kurse', title: 'Kurse', subTitle: 'Alle Angebote', tenants: ['scs'], properties }) as unknown as SectionDoc;

type CourseModel = { type: string; name: string; title: string; subTitle: string; audience: string; emptyText: string };
const map = (s: SectionDoc, lang = 'de') => mapSection('s1', s, new Map(), sanitize, lang) as CourseModel;

describe('mapSection course', () => {
  it('maps title, subtitle, audience and the empty text', () => {
    const m = map(course({ audience: ['youth', 'adult'], emptyText: 'Keine Kurse geplant.' }));
    expect(m).toEqual({ type: 'course', name: 'kurse', title: 'Kurse', subTitle: 'Alle Angebote', audience: 'youth,adult', emptyText: 'Keine Kurse geplant.' });
  });

  it('drops an unknown audience value', () => {
    expect(map(course({ audience: ['youth', 'senior', 42], emptyText: '' })).audience).toBe('youth');
  });

  it('picks the translated empty text, else the German one', () => {
    const s = course({ audience: ['youth'], emptyText: 'Keine Kurse.', emptyTextI18n: { en: 'No courses.' } });
    expect(map(s, 'en').emptyText).toBe('No courses.');
    expect(map(s, 'fr').emptyText).toBe('Keine Kurse.');
  });

  it('tolerates a missing audience', () => {
    expect(map(course({})).audience).toBe('');
  });
});
