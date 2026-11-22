import { describe, expect, it } from 'vitest';
import type { WebsiteModel } from '@okr/shared-models';

import { mapFooter, type SectionDoc } from './section-mapper';
import { siteFooterSection } from './render-site';

const props = {
  columnCount: 2, showBottomLine: true, bottomLine: '© 2026 Lokale Agenda 21 Stäfa', background: '#3c163c',
  columns: [
    { items: [{ type: 'title', label: 'Werden Sie Mitglied der LA21' }, { type: 'button', label: 'Mitglied werden', url: '/mitglied-werden' }, { type: 'button', label: 'Kaputt', url: 'javascript:x' }] },
    { items: [{ type: 'title', label: 'Newsletter' }] },
  ],
  social: [{ label: 'Instagram', url: 'https://www.instagram.com/la21staefa/', icon: 'instagram' }, { label: 'Böse', url: 'http://x' }],
  bottomLinks: [{ label: 'Impressum', url: '/impressum' }],
};

describe('mapFooter (la21staefa footer)', () => {
  it('maps buttons, the dark background, the social row and the bottom links; drops unsafe targets', () => {
    const footer = mapFooter(props);
    expect(footer.columns[0].items.map((i) => i.type)).toEqual(['title', 'button']);
    expect(footer).toMatchObject({ background: '#3c163c', dark: true, bottomLine: '© 2026 Lokale Agenda 21 Stäfa' });
    expect(footer.social).toEqual([{ label: 'Instagram', url: 'https://www.instagram.com/la21staefa/', external: true, src: 'https://bkaiser.imgix.net/logo/icons/instagram.svg' }]);
    expect(footer.bottomLinks).toEqual([{ label: 'Impressum', url: '/impressum', external: false, src: '' }]);
  });

  it('ignores a background that is not a hex colour', () => {
    expect(mapFooter({ ...props, background: 'red;x' })).toMatchObject({ background: '', dark: false });
  });
});

describe('siteFooterSection', () => {
  const section = { type: 'footer', state: 'published', roleNeeded: 'public', tenants: ['la21staefa'], properties: props } as unknown as SectionDoc;
  const site = (footerSectionKey?: string) => ({ footerSectionKey } as WebsiteModel);

  it('maps the named footer section of the tenant', () => {
    expect(siteFooterSection(site('la21staefa_footer'), new Map([['la21staefa_footer', section]]), ['la21staefa'])?.dark).toBe(true);
  });

  it('keeps the template footer without a key, for another tenant\'s or a non-footer section', () => {
    expect(siteFooterSection(site(), new Map([['f', section]]), ['la21staefa'])).toBeUndefined();
    expect(siteFooterSection(site('f'), new Map([['f', section]]), ['scs'])).toBeUndefined();
    expect(siteFooterSection(site('f'), new Map([['f', { ...section, type: 'article' } as SectionDoc]]), ['la21staefa'])).toBeUndefined();
  });
});
