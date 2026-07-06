import { XMLParser } from 'fast-xml-parser';

export interface PersonDirectoryResult {
  firstName: string;
  lastName: string;
  streetName: string;
  streetNumber: string;
  zipCode: string;
  city: string;
  countryCode: string;
  phone: string;
  email: string;
  web: string;
  occupation: string;
}

// removeNSPrefix strips the `tel:` prefix; attributes are exposed as `@_type`.
// parseTagValue is disabled: fast-xml-parser's default numeric coercion would
// convert values like "+41526544230" to the number 41526544230, permanently
// dropping the leading "+" before textOf() ever runs. Every field here is a
// string by contract, so number coercion only causes data loss (phone) or
// churn (zip) and is never wanted.
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  trimValues: true,
  parseTagValue: false,
});

function textOf(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'object') {
    const t = (v as Record<string, unknown>)['#text'];
    return t == null ? '' : String(t);
  }
  return String(v);
}

function firstOf(v: unknown): string {
  return Array.isArray(v) ? textOf(v[0]) : textOf(v);
}

function extraByType(extra: unknown, type: string): string {
  const arr = Array.isArray(extra) ? extra : extra == null ? [] : [extra];
  const hit = arr.find((e) => e && (e as Record<string, unknown>)['@_type'] === type);
  return hit ? textOf(hit) : '';
}

export function parseTelFeed(xml: string): PersonDirectoryResult[] {
  const parsed = parser.parse(xml) as Record<string, any>;
  const entries = parsed?.feed?.entry;
  const list: any[] = Array.isArray(entries) ? entries : entries ? [entries] : [];
  return list.map((e) => ({
    firstName: textOf(e.firstname),
    lastName: textOf(e.name),
    streetName: textOf(e.street),
    streetNumber: textOf(e.streetno),
    zipCode: textOf(e.zip),
    city: textOf(e.city),
    countryCode: 'CH',
    phone: firstOf(e.phone),
    email: extraByType(e.extra, 'email'),
    web: extraByType(e.extra, 'website'),
    occupation: textOf(e.occupation),
  }));
}
