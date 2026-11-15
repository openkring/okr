import { describe, expect, it } from 'vitest';

import { BOOK_CTAG, BOOK_ETAGS, MULTIGET, PRINCIPAL, ROOT } from './apple-bodies.fixture';
import { BookCard, BookRoot, DavDeps, DavRequest, handleDav } from './dav-handler';

const CARD = (uid: string, avatarPath = ''): BookCard => ({
  uid, etag: `"${uid}-etag"`, avatarPath, avatarVersion: '',
  vcardText: `BEGIN:VCARD\r\nVERSION:3.0\r\nUID:${uid}\r\nFN:${uid}\r\nEND:VCARD\r\n`,
});
const BOOK: BookRoot = { ctag: 'ctag-1', cardCount: 2, builtAt: '2026-11-15T03:15:00Z', index: { 'org-spike2': '"org-spike2-etag"', 'person-spike1': '"person-spike1-etag"' } };
const CARDS = [CARD('person-spike1', 'avatars/p.jpg'), CARD('org-spike2')];

function deps(over: Partial<DavDeps> = {}): DavDeps {
  return {
    authorize: async (h) => (h === 'Basic ok' ? { tenantId: 'bka' } : undefined),
    readBook: async () => BOOK,
    readCards: async (_t, uids) => CARDS.filter((c) => uids.includes(c.uid)),
    fetchPhoto: async () => 'UEhPVE8=',
    ...over,
  };
}
const req = (method: string, path: string, body = '', headers: Record<string, string> = {}): DavRequest =>
  ({ method, path, body, headers: { authorization: 'Basic ok', ...headers } });

describe('handleDav', () => {
  it('redirects .well-known/carddav without auth', async () => {
    const r = await handleDav({ method: 'PROPFIND', path: '/.well-known/carddav', body: '', headers: {} }, deps());
    expect(r.status).toBe(301);
    expect(r.headers['Location']).toBe('/');
  });

  it('answers OPTIONS without auth', async () => {
    const r = await handleDav({ method: 'OPTIONS', path: '/principal/', body: '', headers: {} }, deps());
    expect(r.status).toBe(200);
    expect(r.headers['DAV']).toBe('1, 3, addressbook');
  });

  it('asks for a password with 401 and the realm', async () => {
    const r = await handleDav(req('PROPFIND', '/', ROOT, { authorization: 'Basic wrong' }), deps());
    expect(r.status).toBe(401);
    expect(r.headers['WWW-Authenticate']).toBe('Basic realm="Kring Adressbuch"');
  });

  it('refuses writes with 403 and unknown methods with 405', async () => {
    for (const m of ['PUT', 'DELETE', 'MKCOL', 'PROPPATCH', 'MOVE', 'COPY', 'POST']) {
      expect((await handleDav(req(m, '/books/main/x.vcf'), deps())).status).toBe(403);
    }
    expect((await handleDav(req('LOCK', '/'), deps())).status).toBe(405);
  });

  it('points the principal at the home set', async () => {
    const r = await handleDav(req('PROPFIND', '/principal/', PRINCIPAL, { depth: '0' }), deps());
    expect(r.status).toBe(207);
    expect(r.body).toContain('<addressbook-home-set xmlns="urn:ietf:params:xml:ns:carddav"><href xmlns="DAV:">/books/</href>');
  });

  it('serves getctag on the book at depth 0', async () => {
    const r = await handleDav(req('PROPFIND', '/books/main/', BOOK_CTAG, { depth: '0' }), deps());
    expect(r.status).toBe(207);
    expect(r.body).toContain('<getctag xmlns="http://calendarserver.org/ns/">ctag-1</getctag>');
    expect(r.body).not.toContain('person-spike1.vcf');
  });

  it('lists every card with its etag at depth 1', async () => {
    const r = await handleDav(req('PROPFIND', '/books/main/', BOOK_ETAGS, { depth: '1' }), deps());
    expect(r.body).toContain('<href xmlns="DAV:">/books/main/person-spike1.vcf</href>');
    expect(r.body).toContain('<getetag xmlns="DAV:">"org-spike2-etag"</getetag>');
  });

  it('answers a multiget with address-data and a 404 for an unknown href', async () => {
    const body = MULTIGET.replace('</B:addressbook-multiget>', '<A:href xmlns:A="DAV:">/books/main/person-gone.vcf</A:href></B:addressbook-multiget>');
    const r = await handleDav(req('REPORT', '/books/main/', body), deps());
    expect(r.status).toBe(207);
    expect(r.body).toContain('UID:person-spike1');
    expect(r.body).toContain('PHOTO;ENCODING=b;TYPE=JPEG:UEhPVE8=');
    expect(r.body).toMatch(/person-gone\.vcf<\/href><status>HTTP\/1.1 404 Not Found/);
  });

  it('serves a card without photo when the fetch fails', async () => {
    const r = await handleDav(req('REPORT', '/books/main/', MULTIGET), deps({ fetchPhoto: async () => undefined }));
    expect(r.status).toBe(207);
    expect(r.body).toContain('UID:person-spike1');
    expect(r.body).not.toContain('PHOTO');
  });

  it('serves one card by GET with its ETag', async () => {
    const r = await handleDav(req('GET', '/books/main/person-spike1.vcf'), deps());
    expect(r.status).toBe(200);
    expect(r.headers['ETag']).toBe('"person-spike1-etag"');
    expect(r.body).toContain('UID:person-spike1');
  });

  it('404s an unknown card and an unknown path', async () => {
    expect((await handleDav(req('GET', '/books/main/nope.vcf'), deps())).status).toBe(404);
    expect((await handleDav(req('PROPFIND', '/elsewhere/'), deps())).status).toBe(404);
  });

  it('serves an empty book before the first rebuild', async () => {
    const r = await handleDav(req('PROPFIND', '/books/main/', BOOK_ETAGS, { depth: '1' }), deps({ readBook: async () => undefined }));
    expect(r.status).toBe(207);
    expect(r.body).not.toContain('.vcf');
  });

  it('refuses a body over 1 MB with 413', async () => {
    const r = await handleDav(req('PROPFIND', '/', 'x'.repeat(1_048_577)), deps());
    expect(r.status).toBe(413);
  });

  it('answers a repeated href once', async () => {
    const body = MULTIGET.replace('</B:addressbook-multiget>', '<A:href xmlns:A="DAV:">/books/main/person-spike1.vcf</A:href></B:addressbook-multiget>');
    let asked: string[] = [];
    const r = await handleDav(req('REPORT', '/books/main/', body), deps({ readCards: async (_t, uids) => { asked = uids; return CARDS.filter((c) => uids.includes(c.uid)); } }));
    expect(asked).toEqual(['org-spike2', 'person-spike1']);
    expect(r.body.match(/person-spike1\.vcf<\/href>/g)).toHaveLength(1);
  });

  it('refuses a multiget over 5000 hrefs with 507', async () => {
    const hrefs = Array.from({ length: 5001 }, (_, i) => `<D:href>/books/main/person-${i}.vcf</D:href>`).join('');
    const r = await handleDav(req('REPORT', '/books/main/', `<C:addressbook-multiget xmlns:C="urn:ietf:params:xml:ns:carddav" xmlns:D="DAV:"><D:prop><D:getetag/></D:prop>${hrefs}</C:addressbook-multiget>`), deps());
    expect(r.status).toBe(507);
  });

  it('marks a card served without its photo with its own etag, so the device fetches it again', async () => {
    const r = await handleDav(req('REPORT', '/books/main/', MULTIGET), deps({ fetchPhoto: async () => undefined }));
    expect(r.body).toContain('<getetag xmlns="DAV:">"person-spike1-etag-nophoto"</getetag>');
    // a card without an avatar keeps its real etag
    expect(r.body).toContain('<getetag xmlns="DAV:">"org-spike2-etag"</getetag>');
  });

  it('stops fetching photos once the request deadline has passed', async () => {
    let clock = 0;
    let fetched = 0;
    const r = await handleDav(req('REPORT', '/books/main/', MULTIGET), deps({
      now: () => clock,
      fetchPhoto: async () => { fetched++; clock += 100_000; return 'UEhPVE8='; },
      readCards: async (_t, uids) => [CARD('person-spike1', 'a.jpg'), CARD('org-spike2', 'b.jpg')].filter((c) => uids.includes(c.uid)),
    }));
    expect(r.status).toBe(207);
    expect(fetched).toBe(1);
    expect(r.body).toContain('UID:org-spike2');
    expect(r.body).toContain('UID:person-spike1');
  });
});

