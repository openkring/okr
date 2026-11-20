import {
  CONTACT_CONFIG_SHAPE, CONTACT_ELEMENTS, ContactColumn, ContactConfig, ContactElement, ContactFormField,
  ContactLayout, ContactRow, DirectoryEntry
} from '@okr/shared-models';

/** A row holds at most this many columns; a column's width ranges 1..CONTACT_MAX_WIDTH (fr units). */
export const CONTACT_MAX_COLUMNS = 3;
export const CONTACT_MAX_WIDTH = 3;
export const CONTACT_MAX_ROWS = 6;

/** The elements that only render when their switch is on. */
export const CONTACT_OPTIONAL_ELEMENTS: Partial<Record<ContactElement, keyof ContactConfig>> = {
  map: 'showMap',
  form: 'showForm',
};

/** The resolved, display-ready data of one party (organization or contact person). */
export interface ContactParty {
  key: string;
  /** 'org.<okey>' | 'person.<okey>' — the avatar key */
  avatarKey: string;
  name: string;
  firstName: string;
  lastName: string;
  imageUrl: string;
  /** street + number, zip + city; empty lines dropped */
  addressLines: string[];
  email: string;
  phone: string;
}

/** What the configuration preview and the renderer show; built by the feature layer from the directory. */
export interface ContactDetails {
  org?: ContactParty;
  person?: ContactParty;
}

const col = (width: number, elements: ContactElement[]): ContactColumn => ({ width, elements });
const row = (...columns: ContactColumn[]): ContactRow => ({ columns });

/**
 * The starting layouts. Every one reflows to a single column on a narrow section (container query
 * in the renderer), so «responsive» is the renderer's job; these only decide the wide arrangement.
 */
export const CONTACT_LAYOUT_PRESETS: Record<Exclude<ContactLayout, 'custom'>, ContactRow[]> = {
  // three columns: where, map, who — the classic «So findest du uns» band
  classic: [
    row(
      col(1, ['title', 'orgName', 'orgAddress', 'orgEmail', 'orgPhone']),
      col(1, ['map']),
      col(1, ['subTitle', 'personName', 'personEmail', 'personPhone', 'personAvatar']),
    ),
  ],
  // heading across, details left, map and form right
  split: [
    row(col(1, ['title', 'subTitle'])),
    row(
      col(1, ['orgLogo', 'orgName', 'orgAddress', 'orgEmail', 'orgPhone', 'personAvatar', 'personName', 'personEmail', 'personPhone']),
      col(2, ['map', 'form']),
    ),
  ],
  // heading across, organization and person as two equal cards, then map and form side by side
  cards: [
    row(col(1, ['title', 'subTitle'])),
    row(
      col(1, ['orgLogo', 'orgName', 'orgAddress', 'orgEmail', 'orgPhone']),
      col(1, ['personAvatar', 'personName', 'personAddress', 'personEmail', 'personPhone']),
    ),
    row(col(1, ['map']), col(1, ['form'])),
  ],
  // the form gets the room, the person sits beside it, the map closes the section
  formFocus: [
    row(col(1, ['title', 'subTitle'])),
    row(
      col(2, ['form']),
      col(1, ['personAvatar', 'personName', 'personEmail', 'personPhone', 'orgName', 'orgAddress']),
    ),
    row(col(1, ['map'])),
  ],
  // one column, top to bottom — also how every layout looks on a phone
  stacked: [
    row(col(1, [
      'title', 'subTitle', 'orgLogo', 'orgName', 'orgAddress', 'orgEmail', 'orgPhone',
      'personAvatar', 'personName', 'personEmail', 'personPhone', 'map', 'form',
    ])),
  ],
};

/** A deep copy of a preset, safe to mutate and to store. */
export function getContactLayoutRows(layout: ContactLayout): ContactRow[] {
  const preset = layout === 'custom' ? CONTACT_CONFIG_SHAPE.rows : CONTACT_LAYOUT_PRESETS[layout];
  return cloneRows(preset);
}

export function cloneRows(rows: ContactRow[]): ContactRow[] {
  return rows.map(r => ({ columns: r.columns.map(c => ({ width: c.width, elements: [...c.elements] })) }));
}

/** Every element placed somewhere in the rows. */
export function getPlacedElements(rows: ContactRow[] | undefined): Set<ContactElement> {
  const placed = new Set<ContactElement>();
  for (const r of rows ?? []) for (const c of r.columns ?? []) for (const e of c.elements ?? []) placed.add(e);
  return placed;
}

/** The palette: elements not yet in the layout, in canonical order. */
export function getUnplacedElements(rows: ContactRow[] | undefined): ContactElement[] {
  const placed = getPlacedElements(rows);
  return CONTACT_ELEMENTS.filter(e => !placed.has(e));
}

/** Removes `element` wherever it sits; returns new rows. */
export function removeContactElement(rows: ContactRow[], element: ContactElement): ContactRow[] {
  return rows.map(r => ({ columns: r.columns.map(c => ({ width: c.width, elements: c.elements.filter(e => e !== element) })) }));
}

/**
 * Places `element` at `index` of column `colIndex` in row `rowIndex`, removing it from where it was
 * first — an element appears at most once. Out-of-range targets leave the rows unchanged.
 */
export function placeContactElement(rows: ContactRow[], element: ContactElement, rowIndex: number, colIndex: number, index: number): ContactRow[] {
  const target = rows[rowIndex]?.columns[colIndex];
  if (!target) return rows;
  // the index is meant in the target list as the user saw it, i.e. before the element left it
  const sourceIndex = target.elements.indexOf(element);
  const adjusted = sourceIndex >= 0 && sourceIndex < index ? index - 1 : index;
  const next = removeContactElement(rows, element);
  const elements = next[rowIndex].columns[colIndex].elements;
  elements.splice(Math.max(0, Math.min(adjusted, elements.length)), 0, element);
  return next;
}

export function addContactRow(rows: ContactRow[]): ContactRow[] {
  if (rows.length >= CONTACT_MAX_ROWS) return rows;
  return [...cloneRows(rows), row(col(1, []))];
}

/** Removing a row hands its elements back to the palette. A layout keeps at least one row. */
export function removeContactRow(rows: ContactRow[], rowIndex: number): ContactRow[] {
  if (rows.length <= 1 || !rows[rowIndex]) return rows;
  return cloneRows(rows).filter((_, i) => i !== rowIndex);
}

export function addContactColumn(rows: ContactRow[], rowIndex: number): ContactRow[] {
  const next = cloneRows(rows);
  const r = next[rowIndex];
  if (!r || r.columns.length >= CONTACT_MAX_COLUMNS) return rows;
  r.columns.push(col(1, []));
  return next;
}

/** Removing a column moves its elements to the column on its left (or right); a row keeps one column. */
export function removeContactColumn(rows: ContactRow[], rowIndex: number, colIndex: number): ContactRow[] {
  const next = cloneRows(rows);
  const r = next[rowIndex];
  if (!r || r.columns.length <= 1 || !r.columns[colIndex]) return rows;
  const [removed] = r.columns.splice(colIndex, 1);
  const heir = r.columns[Math.max(0, colIndex - 1)];
  heir.elements.push(...removed.elements);
  return next;
}

/** Cycles a column's width 1 → 2 → 3 → 1. */
export function cycleContactColumnWidth(rows: ContactRow[], rowIndex: number, colIndex: number): ContactRow[] {
  const next = cloneRows(rows);
  const c = next[rowIndex]?.columns[colIndex];
  if (!c) return rows;
  c.width = (clampWidth(c.width) % CONTACT_MAX_WIDTH) + 1;
  return next;
}

export function clampWidth(width: unknown): number {
  const n = Number(width);
  if (!Number.isInteger(n) || n < 1) return 1;
  return Math.min(n, CONTACT_MAX_WIDTH);
}

/**
 * A stored config made safe to render: unknown elements and duplicates dropped, widths clamped,
 * an empty layout replaced by the classic preset, missing form fields filled from the shape.
 */
export function normalizeContactConfig(config: Partial<ContactConfig> | undefined): ContactConfig {
  const known = new Set<string>(CONTACT_ELEMENTS);
  const seen = new Set<ContactElement>();
  const rows: ContactRow[] = (config?.rows ?? []).slice(0, CONTACT_MAX_ROWS).map(r => ({
    columns: (r?.columns ?? []).slice(0, CONTACT_MAX_COLUMNS).map(c => ({
      width: clampWidth(c?.width),
      elements: (c?.elements ?? []).filter(e => {
        if (!known.has(e) || seen.has(e)) return false;
        seen.add(e);
        return true;
      }),
    })),
  })).filter(r => r.columns.length > 0);

  return {
    ...CONTACT_CONFIG_SHAPE,
    ...config,
    orgKey: config?.orgKey ?? '',
    personKey: config?.personKey ?? '',
    showMap: config?.showMap ?? CONTACT_CONFIG_SHAPE.showMap,
    showForm: config?.showForm ?? CONTACT_CONFIG_SHAPE.showForm,
    formFields: normalizeContactFormFields(config?.formFields),
    layout: config?.layout ?? 'classic',
    rows: rows.length > 0 ? rows : getContactLayoutRows('classic'),
  };
}

/** One entry per known field, in canonical order; stored flags win over the defaults. */
export function normalizeContactFormFields(fields: ContactFormField[] | undefined): ContactFormField[] {
  return CONTACT_CONFIG_SHAPE.formFields.map(def => {
    const stored = fields?.find(f => f?.name === def.name);
    return {
      name: def.name,
      isVisible: stored?.isVisible ?? def.isVisible,
      isRequired: stored?.isRequired ?? def.isRequired,
    };
  });
}

/** Whether an element shows at all, given the config and the resolved data. */
export function isContactElementVisible(element: ContactElement, config: ContactConfig, details: ContactDetails, title?: string, subTitle?: string): boolean {
  switch (element) {
    case 'title': return !!title;
    case 'subTitle': return !!subTitle;
    case 'orgLogo': return !!details.org?.imageUrl;
    case 'orgName': return !!details.org?.name;
    case 'orgAddress': return (details.org?.addressLines.length ?? 0) > 0;
    case 'orgEmail': return !!details.org?.email;
    case 'orgPhone': return !!details.org?.phone;
    case 'personAvatar': return !!details.person?.imageUrl;
    case 'personName': return !!details.person?.name;
    case 'personAddress': return (details.person?.addressLines.length ?? 0) > 0;
    case 'personEmail': return !!details.person?.email;
    case 'personPhone': return !!details.person?.phone;
    case 'map': return config.showMap && (details.org?.addressLines.length ?? 0) > 0;
    case 'form': return config.showForm && config.formFields.some(f => f.isVisible);
  }
}

/**
 * The address lines of a parent's directory: the favorite postal entry, else the first postal one.
 * The directory is already reduced to what the viewer may see.
 */
export function getContactAddressLines(entries: DirectoryEntry[] | undefined): string[] {
  const postal = (entries ?? []).filter(e => e.addressChannel === 'postal' && !e.isCc);
  const entry = postal.find(e => e.isFavorite) ?? postal[0];
  if (!entry) return [];
  const street = [entry.streetName, entry.streetNumber].filter(Boolean).join(' ').trim();
  const city = [entry.zipCode, entry.city].filter(Boolean).join(' ').trim();
  return [street, entry.addressValue2?.trim() ?? '', city].filter(Boolean);
}

/** The Google Maps embed of an address (www.google.com is already in the app's frame-src). */
export function getContactMapEmbedUrl(addressLines: string[]): string {
  if (addressLines.length === 0) return '';
  return `https://www.google.com/maps?q=${encodeURIComponent(addressLines.join(', '))}&output=embed`;
}

/** A tel: link without spaces or separators. */
export function getTelLink(phone: string): string {
  return 'tel:' + phone.replace(/[^\d+]/g, '');
}

/**
 * The mailto: link the contact form opens: the message goes from the visitor's own mail program
 * to the contact person (or the organization), so nothing is stored and nothing new is collected.
 */
export function getContactMailtoLink(to: string, subject: string, values: Partial<Record<string, string>>, labels: Record<string, string>): string {
  const lines = Object.entries(values)
    .filter(([key, value]) => key !== 'message' && !!value)
    .map(([key, value]) => `${labels[key] ?? key}: ${value}`);
  const body = [values['message'] ?? '', '', ...lines].join('\n').trim();
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
