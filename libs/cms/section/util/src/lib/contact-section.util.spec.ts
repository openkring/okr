import { describe, expect, it } from 'vitest';

import { CONTACT_CONFIG_SHAPE, CONTACT_ELEMENTS, CONTACT_SECTION_SHAPE, ContactConfig, ContactRow, ContactSection, DirectoryEntry } from '@okr/shared-models';

import {
  addContactColumn, addContactRow, CONTACT_LAYOUT_PRESETS, cycleContactColumnWidth, getContactAddressLines,
  getContactLayoutRows, getContactMailtoLink, getContactMapEmbedUrl, getPlacedElements, getTelLink, getUnplacedElements,
  isContactElementVisible, normalizeContactConfig, placeContactElement, removeContactColumn, removeContactElement, removeContactRow
} from './contact-section.util';
import { contactSectionValidations } from './contact-section.validations';

const rows = (): ContactRow[] => [
  { columns: [{ width: 1, elements: ['title', 'orgName'] }, { width: 1, elements: ['map'] }] },
];

describe('contact layout presets', () => {
  it('place every element at most once', () => {
    for (const preset of Object.values(CONTACT_LAYOUT_PRESETS)) {
      const all = preset.flatMap(r => r.columns.flatMap(c => c.elements));
      expect(new Set(all).size).toBe(all.length);
    }
  });

  it('hand out independent copies', () => {
    const a = getContactLayoutRows('split');
    a[0].columns[0].elements.push('map');
    expect(getContactLayoutRows('split')[0].columns[0].elements).not.toContain('map');
  });

  it('stacked holds every element except the person address', () => {
    expect(getUnplacedElements(getContactLayoutRows('stacked'))).toEqual(['personAddress']);
  });
});

describe('placeContactElement', () => {
  it('moves an element between columns', () => {
    const next = placeContactElement(rows(), 'orgName', 0, 1, 0);
    expect(next[0].columns[0].elements).toEqual(['title']);
    expect(next[0].columns[1].elements).toEqual(['orgName', 'map']);
  });

  it('inserts a palette element', () => {
    const next = placeContactElement(rows(), 'orgEmail', 0, 0, 1);
    expect(next[0].columns[0].elements).toEqual(['title', 'orgEmail', 'orgName']);
  });

  it('reorders within a column', () => {
    const next = placeContactElement(rows(), 'title', 0, 0, 2);
    expect(next[0].columns[0].elements).toEqual(['orgName', 'title']);
  });

  it('ignores an unknown target', () => {
    const before = rows();
    expect(placeContactElement(before, 'title', 3, 0, 0)).toBe(before);
  });
});

describe('row and column edits', () => {
  it('removing an element returns it to the palette', () => {
    expect(getUnplacedElements(removeContactElement(rows(), 'map'))).toContain('map');
  });

  it('removing a column keeps its elements', () => {
    const next = removeContactColumn(rows(), 0, 1);
    expect(next[0].columns).toHaveLength(1);
    expect(next[0].columns[0].elements).toEqual(['title', 'orgName', 'map']);
  });

  it('keeps at least one row and one column', () => {
    const one: ContactRow[] = [{ columns: [{ width: 1, elements: [] }] }];
    expect(removeContactRow(one, 0)).toBe(one);
    expect(removeContactColumn(one, 0, 0)).toBe(one);
  });

  it('caps columns at three and cycles widths', () => {
    let next = addContactColumn(rows(), 0);
    expect(next[0].columns).toHaveLength(3);
    expect(addContactColumn(next, 0)).toBe(next);
    next = cycleContactColumnWidth(next, 0, 0);
    next = cycleContactColumnWidth(next, 0, 0);
    expect(next[0].columns[0].width).toBe(3);
    expect(cycleContactColumnWidth(next, 0, 0)[0].columns[0].width).toBe(1);
  });

  it('adds an empty row', () => {
    expect(addContactRow(rows())).toHaveLength(2);
  });
});

describe('normalizeContactConfig', () => {
  it('drops unknown and duplicate elements and clamps widths', () => {
    const config = normalizeContactConfig({
      rows: [{ columns: [{ width: 9, elements: ['title', 'bogus' as never, 'title'] }] }],
    });
    expect(config.rows[0].columns[0]).toEqual({ width: 3, elements: ['title'] });
  });

  it('falls back to the classic layout and the default fields', () => {
    const config = normalizeContactConfig({ rows: [] });
    expect(config.rows).toEqual(getContactLayoutRows('classic'));
    expect(config.formFields).toEqual(CONTACT_CONFIG_SHAPE.formFields);
  });

  it('every element is known', () => {
    expect(getPlacedElements(getContactLayoutRows('stacked')).size).toBe(CONTACT_ELEMENTS.length - 1);
  });
});

describe('contact data helpers', () => {
  const entry = (patch: Partial<DirectoryEntry>): DirectoryEntry => ({
    addressOkey: 'a', addressChannel: 'postal', addressChannelLabel: '', addressUsage: '', addressUsageLabel: '',
    isFavorite: false, isCc: false, email: '', phone: '', streetName: '', streetNumber: '', addressValue2: '',
    zipCode: '', city: '', countryCode: '', url: '', ...patch,
  });

  it('prefers the favorite postal address', () => {
    const lines = getContactAddressLines([
      entry({ streetName: 'Seestrasse', streetNumber: '1', zipCode: '8712', city: 'Stäfa' }),
      entry({ isFavorite: true, streetName: 'Bahnhofwiese', streetNumber: '18', zipCode: '8712', city: 'Stäfa' }),
      entry({ addressChannel: 'email', email: 'x@y.ch' }),
    ]);
    expect(lines).toEqual(['Bahnhofwiese 18', '8712 Stäfa']);
  });

  it('builds map, tel and mailto links', () => {
    expect(getContactMapEmbedUrl([])).toBe('');
    expect(getContactMapEmbedUrl(['Bahnhofwiese 18', '8712 Stäfa'])).toContain('q=Bahnhofwiese%2018%2C%208712%20St%C3%A4fa');
    expect(getTelLink('+41 44 123 45 67')).toBe('tel:+41441234567');
    const mail = getContactMailtoLink('a@b.ch', 'Kontakt', { firstName: 'Eva', message: 'Hallo' }, { firstName: 'Vorname' });
    expect(mail.startsWith('mailto:a%40b.ch?subject=Kontakt&body=')).toBe(true);
    expect(decodeURIComponent(mail.split('body=')[1])).toBe('Hallo\n\nVorname: Eva');
  });

  it('hides the map without an address and the form when switched off', () => {
    const config = normalizeContactConfig({ showMap: true, showForm: false });
    expect(isContactElementVisible('map', config, {})).toBe(false);
    expect(isContactElementVisible('form', config, {})).toBe(false);
    expect(isContactElementVisible('title', config, {}, 'So findest du uns')).toBe(true);
  });
});

describe('contactSectionValidations', () => {
  const section = (config: Partial<ContactConfig>): ContactSection => ({
    ...CONTACT_SECTION_SHAPE, okey: 'k', name: 'n', title: 't', tenants: ['t1'],
    properties: { ...CONTACT_CONFIG_SHAPE, ...config },
  } as ContactSection);

  it('accepts the default shape and every preset', () => {
    expect(contactSectionValidations(section({})).hasErrors()).toBe(false);
    for (const layout of Object.keys(CONTACT_LAYOUT_PRESETS) as (keyof typeof CONTACT_LAYOUT_PRESETS)[]) {
      expect(contactSectionValidations(section({ layout, rows: getContactLayoutRows(layout) })).hasErrors()).toBe(false);
    }
  });

  it('rejects a duplicate element and an empty visible form', () => {
    const dup: ContactRow[] = [{ columns: [{ width: 1, elements: ['map', 'map'] }] }];
    expect(contactSectionValidations(section({ rows: dup })).hasErrors('contact.rows')).toBe(true);
    const fields = CONTACT_CONFIG_SHAPE.formFields.map(f => ({ ...f, isVisible: false }));
    expect(contactSectionValidations(section({ showForm: true, formFields: fields })).hasErrors('contact.formFields')).toBe(true);
  });
});

describe('contactFormValidations', () => {
  // imported lazily to keep the suites above independent of it
  it('checks required, email format and hidden fields', async () => {
    const { contactFormValidations, CONTACT_FORM_MODEL_SHAPE } = await import('./contact-form.validations');
    const fields = CONTACT_CONFIG_SHAPE.formFields;
    const empty = contactFormValidations(CONTACT_FORM_MODEL_SHAPE, fields);
    expect(empty.hasErrors('firstName')).toBe(true);
    expect(empty.hasErrors('phone')).toBe(false);
    const bad = contactFormValidations({ ...CONTACT_FORM_MODEL_SHAPE, email: 'nope' }, fields);
    expect(bad.hasErrors('email')).toBe(true);
    const ok = contactFormValidations({ firstName: 'Eva', lastName: 'Muster', email: 'eva@example.ch', phone: '', message: 'Hallo' }, fields);
    expect(ok.hasErrors()).toBe(false);
    const hidden = fields.map(f => ({ ...f, isVisible: f.name !== 'firstName' }));
    expect(contactFormValidations(CONTACT_FORM_MODEL_SHAPE, hidden).hasErrors('firstName')).toBe(false);
  });
});
