/**
 * The few XML shapes of a read-only CardDAV server (spec 1.159 §5.2), without an XML library:
 * a tolerant reader for the request bodies Apple sends (§13) and a string writer for 207
 * multistatus answers.
 *
 * Apple declares namespaces inline per element (`<B:addressbook-home-set xmlns:B="…"/>`) and
 * reuses prefixes with different meanings across bodies (iOS: `D:` = CardDAV, macOS: `D:` =
 * me.com), so a prefix is resolved on the element itself first, then from the whole body.
 */

export const DAV_NS = 'DAV:';
export const CARDDAV_NS = 'urn:ietf:params:xml:ns:carddav';
export const CS_NS = 'http://calendarserver.org/ns/';

export interface DavProp {
  ns: string;
  name: string;
}

export const propKey = (ns: string, name: string): string => `${ns}|${name}`;

/** Escape for XML TEXT content (every value written here is text, never an attribute). */
export function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function bodyNamespaces(body: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const m of body.matchAll(/xmlns:([\w.-]+)\s*=\s*"([^"]*)"/g)) map[m[1]] ??= m[2];
  const def = body.match(/xmlns\s*=\s*"([^"]*)"/);
  map[''] = def ? def[1] : DAV_NS;
  return map;
}

/**
 * The properties a `PROPFIND` (or a `REPORT`'s `<prop>`) asks for; `null` when the body asks for
 * all of them (`allprop`, or no body at all).
 */
export function readRequestedProps(body: string): DavProp[] | null {
  const block = body.match(/<(?:[\w.-]+:)?prop(?:\s[^>]*)?>([\s\S]*?)<\/(?:[\w.-]+:)?prop>/);
  if (!block) return null;
  const ns = bodyNamespaces(body);
  const out: DavProp[] = [];
  for (const m of block[1].matchAll(/<(?!\/)(?:([\w.-]+):)?([\w.-]+)((?:\s[^>]*?)?)\/?>/g)) {
    const prefix = m[1] ?? '';
    const attrs = m[3] ?? '';
    const inline = prefix
      ? attrs.match(new RegExp(`xmlns:${prefix.replace(/[.-]/g, '\\$&')}\\s*=\\s*"([^"]*)"`))
      : attrs.match(/xmlns\s*=\s*"([^"]*)"/);
    out.push({ ns: inline ? inline[1] : (ns[prefix] ?? DAV_NS), name: m[2] });
  }
  return out;
}

/** The hrefs of an `addressbook-multiget`, URL-decoded. */
export function readMultigetHrefs(body: string): string[] {
  return [...body.matchAll(/<(?:[\w.-]+:)?href(?:\s[^>]*)?>([^<]*)<\/(?:[\w.-]+:)?href>/g)].map((m) => {
    const raw = m[1].trim();
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  });
}

const el = (p: DavProp, inner: string): string =>
  inner === '' ? `<${p.name} xmlns="${p.ns}"/>` : `<${p.name} xmlns="${p.ns}">${inner}</${p.name}>`;

export const hrefXml = (href: string): string => `<href xmlns="DAV:">${escapeXml(href)}</href>`;

/**
 * One `<response>` for a resource: the wanted props found in `values` (key `ns|name`, value =
 * inner XML, already escaped) under 200, the rest under 404 — RFC 4918 §9.1.
 */
export function propResponse(href: string, values: Map<string, string>, wanted: DavProp[]): string {
  const ok: string[] = [];
  const missing: string[] = [];
  for (const p of wanted) {
    const v = values.get(propKey(p.ns, p.name));
    if (v === undefined) missing.push(el(p, ''));
    else ok.push(el(p, v));
  }
  let r = `<response xmlns="DAV:">${hrefXml(href)}`;
  if (ok.length) r += `<propstat><prop>${ok.join('')}</prop><status>HTTP/1.1 200 OK</status></propstat>`;
  if (missing.length) r += `<propstat><prop>${missing.join('')}</prop><status>HTTP/1.1 404 Not Found</status></propstat>`;
  return `${r}</response>`;
}

export function notFoundResponse(href: string): string {
  return `<response xmlns="DAV:">${hrefXml(href)}<status>HTTP/1.1 404 Not Found</status></response>`;
}

export function multistatus(responses: string[]): string {
  return `<?xml version="1.0" encoding="utf-8"?>\n<multistatus xmlns="DAV:">${responses.join('')}</multistatus>`;
}
