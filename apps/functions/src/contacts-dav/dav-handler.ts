import { mapWithConcurrency } from '@okr/shared-util-core';
import { withPhoto } from '@okr/vcard-util';

import {
  CARDDAV_NS, CS_NS, DAV_NS, DavProp, escapeXml, hrefXml, multistatus, notFoundResponse, propKey, propResponse,
  readMultigetHrefs, readRequestedProps,
} from './dav-xml';

/**
 * The read-only CardDAV protocol of the contacts mirror (spec 1.159 §5.1–§5.2), free of
 * Firebase: routing, auth decision, and the 207 answers. `index.ts` adapts Express to it and
 * wires `DavDeps` to Firestore.
 *
 *   /                          entry point (what the device is given)
 *   /principal/                the current-user principal
 *   /books/                    addressbook-home-set
 *   /books/main/               the one address book
 *   /books/main/<uid>.vcf      one card (`<uid>` = `<modelType>-<okey>`)
 */

/** `contactsDavBooks/{tenantId}` */
export interface BookRoot {
  ctag: string;
  cardCount: number;
  /** ISO timestamp */
  builtAt: string;
  rebuildInterval?: 'weekly' | 'daily' | 'manual';
  /** uid → ETag (quoted) */
  index: Record<string, string>;
}

/** `contactsDavBooks/{tenantId}/cards/{uid}` (plus its uid) */
export interface BookCard {
  uid: string;
  /** the lookup card WITHOUT `PHOTO` */
  vcardText: string;
  etag: string;
  /** avatar `storagePath`, '' when the contact has no photo */
  avatarPath: string;
  avatarVersion: string;
}

export interface DavDeps {
  /** undefined → 401 */
  authorize(authHeader: string | undefined): Promise<{ tenantId: string } | undefined>;
  /** undefined before the first rebuild → an empty book */
  readBook(tenantId: string): Promise<BookRoot | undefined>;
  readCards(tenantId: string, uids: string[]): Promise<BookCard[]>;
  /** base64 JPEG, undefined when it cannot be fetched in time */
  fetchPhoto(avatarPath: string): Promise<string | undefined>;
  log?(message: string, data: Record<string, unknown>): void;
}

export interface DavRequest {
  method: string;
  path: string;
  /** lower-case header names */
  headers: Record<string, string | undefined>;
  body: string;
}

export interface DavResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

const BOOK = '/books/main/';
const WRITE_METHODS = new Set(['PUT', 'DELETE', 'MKCOL', 'PROPPATCH', 'MOVE', 'COPY', 'POST']);
const PHOTO_CONCURRENCY = 8;
/** Apple's bodies are a few hundred bytes; a multiget of the whole book is ~250 KB (§13). */
const MAX_BODY_BYTES = 1_048_576;
/** more than the whole book (4143 cards) — a first full sync must never hit it */
const MAX_MULTIGET_HREFS = 5000;
const XML = 'application/xml; charset=utf-8';
const VCARD = 'text/vcard; charset=utf-8';
const DAV_HEADERS = { DAV: '1, 3, addressbook' };

type Resource = { kind: 'root' | 'principal' | 'home' | 'book'; href: string } | { kind: 'card'; href: string; uid: string };

function classify(path: string): Resource | undefined {
  const p = path.replace(/\/+$/, '') || '/';
  if (p === '/') return { kind: 'root', href: '/' };
  if (p === '/principal') return { kind: 'principal', href: '/principal/' };
  if (p === '/books') return { kind: 'home', href: '/books/' };
  if (p === '/books/main') return { kind: 'book', href: BOOK };
  const card = path.match(/^\/books\/main\/([\w.-]+)\.vcf$/);
  return card ? { kind: 'card', href: path, uid: card[1] } : undefined;
}

const cardHref = (uid: string): string => `${BOOK}${uid}.vcf`;
const uidOfHref = (href: string): string | undefined => href.match(/\/books\/main\/([\w.-]+)\.vcf$/)?.[1];

/** The props a resource kind can answer; inner XML, escaped. */
function propsOf(kind: Resource['kind'], book: BookRoot | undefined, etag?: string): Map<string, string> {
  const m = new Map<string, string>();
  const href = (h: string) => hrefXml(h);
  m.set(propKey(DAV_NS, 'current-user-principal'), href('/principal/'));
  m.set(propKey(DAV_NS, 'principal-URL'), href('/principal/'));
  m.set(propKey(CARDDAV_NS, 'addressbook-home-set'), href('/books/'));
  m.set(propKey(DAV_NS, 'owner'), href('/principal/'));
  m.set(propKey(DAV_NS, 'current-user-privilege-set'),
    '<privilege xmlns="DAV:"><read/></privilege><privilege xmlns="DAV:"><read-current-user-privilege-set/></privilege>');
  switch (kind) {
    case 'root':
      m.set(propKey(DAV_NS, 'resourcetype'), '<collection xmlns="DAV:"/>');
      m.set(propKey(DAV_NS, 'displayname'), 'Kring');
      break;
    case 'principal':
      m.set(propKey(DAV_NS, 'resourcetype'), '<collection xmlns="DAV:"/><principal xmlns="DAV:"/>');
      m.set(propKey(DAV_NS, 'displayname'), 'Kring');
      break;
    case 'home':
      m.set(propKey(DAV_NS, 'resourcetype'), '<collection xmlns="DAV:"/>');
      m.set(propKey(DAV_NS, 'displayname'), 'Kring');
      break;
    case 'book':
      m.set(propKey(DAV_NS, 'resourcetype'), `<collection xmlns="DAV:"/><addressbook xmlns="${CARDDAV_NS}"/>`);
      m.set(propKey(DAV_NS, 'displayname'), 'Kring');
      m.set(propKey(CS_NS, 'getctag'), escapeXml(book?.ctag ?? 'empty'));
      m.set(propKey(DAV_NS, 'supported-report-set'),
        `<supported-report xmlns="DAV:"><report><addressbook-multiget xmlns="${CARDDAV_NS}"/></report></supported-report>`);
      m.set(propKey(CARDDAV_NS, 'supported-address-data'), `<address-data-type xmlns="${CARDDAV_NS}" content-type="text/vcard" version="3.0"/>`);
      break;
    case 'card':
      m.set(propKey(DAV_NS, 'resourcetype'), '');
      m.set(propKey(DAV_NS, 'getcontenttype'), VCARD);
      if (etag) m.set(propKey(DAV_NS, 'getetag'), escapeXml(etag));
      break;
  }
  return m;
}

/** Props answered when the body asks for everything (allprop / empty). */
const ALLPROP: DavProp[] = [
  { ns: DAV_NS, name: 'resourcetype' },
  { ns: DAV_NS, name: 'displayname' },
  { ns: DAV_NS, name: 'getetag' },
  { ns: CS_NS, name: 'getctag' },
];

async function cardsWithPhotos(cards: BookCard[], deps: DavDeps): Promise<Map<string, string>> {
  const texts = await mapWithConcurrency(cards, PHOTO_CONCURRENCY, async (c) =>
    withPhoto(c.vcardText, c.avatarPath ? await deps.fetchPhoto(c.avatarPath).catch(() => undefined) : undefined));
  return new Map(cards.map((c, i) => [c.uid, texts[i]]));
}

const answer = (status: number, body = '', headers: Record<string, string> = {}): DavResponse =>
  ({ status, body, headers: { ...DAV_HEADERS, ...headers } });

export async function handleDav(req: DavRequest, deps: DavDeps): Promise<DavResponse> {
  const method = req.method.toUpperCase();
  if (req.path.replace(/\/+$/, '') === '/.well-known/carddav') return answer(301, '', { Location: '/' });
  if (method === 'OPTIONS') return answer(200, '', { Allow: 'OPTIONS, GET, HEAD, PROPFIND, REPORT' });

  if (req.body.length > MAX_BODY_BYTES) return answer(413, 'request body too large');

  const auth = await deps.authorize(req.headers['authorization']);
  if (!auth) return answer(401, 'Unauthorized', { 'WWW-Authenticate': 'Basic realm="Kring Adressbuch"' });
  if (WRITE_METHODS.has(method)) return answer(403, 'read-only');
  if (!['GET', 'HEAD', 'PROPFIND', 'REPORT'].includes(method)) return answer(405, 'method not allowed');

  const res = classify(req.path);
  if (!res) return answer(404, 'not found');
  const book = await deps.readBook(auth.tenantId);

  if (method === 'GET' || method === 'HEAD') {
    if (res.kind !== 'card') return answer(200, method === 'HEAD' ? '' : 'Kring Adressbuch', { 'Content-Type': 'text/plain; charset=utf-8' });
    const [card] = book?.index[res.uid] ? await deps.readCards(auth.tenantId, [res.uid]) : [];
    if (!card) return answer(404, 'not found');
    const text = (await cardsWithPhotos([card], deps)).get(card.uid) ?? card.vcardText;
    return answer(200, method === 'HEAD' ? '' : text, { 'Content-Type': VCARD, ETag: card.etag });
  }

  const wanted = readRequestedProps(req.body) ?? ALLPROP;

  if (method === 'PROPFIND') {
    const depth = req.headers['depth'] ?? '1';
    if (res.kind === 'card') {
      const etag = book?.index[res.uid];
      if (!etag) return answer(404, 'not found');
      return answer(207, multistatus([propResponse(res.href, propsOf('card', book, etag), wanted)]), { 'Content-Type': XML });
    }
    const responses = [propResponse(res.href, propsOf(res.kind, book), wanted)];
    if (depth !== '0') {
      if (res.kind === 'home') responses.push(propResponse(BOOK, propsOf('book', book), wanted));
      if (res.kind === 'book') {
        for (const [uid, etag] of Object.entries(book?.index ?? {})) {
          responses.push(propResponse(cardHref(uid), propsOf('card', book, etag), wanted));
        }
      }
    }
    return answer(207, multistatus(responses), { 'Content-Type': XML });
  }

  // REPORT — addressbook-multiget only (§5.2)
  if (res.kind !== 'book' || !/addressbook-multiget/.test(req.body)) {
    return answer(403, '<?xml version="1.0" encoding="utf-8"?><error xmlns="DAV:"><supported-report/></error>', { 'Content-Type': XML });
  }
  const hrefs = [...new Set(readMultigetHrefs(req.body))];
  if (hrefs.length > MAX_MULTIGET_HREFS) return answer(507, 'too many cards in one request');
  const uids = hrefs.map(uidOfHref).filter((u): u is string => !!u && !!book?.index[u]);
  const cards = uids.length ? await deps.readCards(auth.tenantId, uids) : [];
  const wantsData = wanted.some((p) => p.ns === CARDDAV_NS && p.name === 'address-data');
  const texts = wantsData ? await cardsWithPhotos(cards, deps) : new Map<string, string>();
  const byUid = new Map(cards.map((c) => [c.uid, c]));
  deps.log?.('contactsDav: multiget', { hrefs: hrefs.length, found: cards.length });

  const responses = hrefs.map((href) => {
    const uid = uidOfHref(href);
    const card = uid ? byUid.get(uid) : undefined;
    if (!card) return notFoundResponse(href);
    const values = propsOf('card', book, card.etag);
    const text = texts.get(card.uid);
    if (text !== undefined) values.set(propKey(CARDDAV_NS, 'address-data'), escapeXml(text));
    return propResponse(href, values, wanted);
  });
  return answer(207, multistatus(responses), { 'Content-Type': XML });
}
