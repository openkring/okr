import { describe, expect, it } from 'vitest';

import { HOME, MULTIGET, PRINCIPAL, WELL_KNOWN } from './apple-bodies.fixture';
import { CARDDAV_NS, CS_NS, DAV_NS, multistatus, notFoundResponse, propResponse, readMultigetHrefs, readRequestedProps } from './dav-xml';

describe('readRequestedProps', () => {
  it('reads the well-known body', () => {
    expect(readRequestedProps(WELL_KNOWN)).toEqual([
      { ns: DAV_NS, name: 'current-user-principal' },
      { ns: DAV_NS, name: 'principal-URL' },
      { ns: DAV_NS, name: 'resourcetype' },
    ]);
  });

  it('resolves inline prefixes on the principal body', () => {
    const props = readRequestedProps(PRINCIPAL)!;
    expect(props).toHaveLength(8);
    expect(props).toContainEqual({ ns: CARDDAV_NS, name: 'addressbook-home-set' });
    expect(props).toContainEqual({ ns: CS_NS, name: 'email-address-set' });
  });

  it('keeps per-element namespaces apart on the home-set body', () => {
    const props = readRequestedProps(HOME)!;
    expect(props).toContainEqual({ ns: 'http://me.com/_namespace/', name: 'bulk-requests' });
    expect(props).toContainEqual({ ns: CS_NS, name: 'me-card' });
    expect(props).toContainEqual({ ns: DAV_NS, name: 'sync-token' });
  });

  it('returns null for an empty body or allprop', () => {
    expect(readRequestedProps('')).toBeNull();
    expect(readRequestedProps('<propfind xmlns="DAV:"><allprop/></propfind>')).toBeNull();
  });

  it('understands a default namespace', () => {
    expect(readRequestedProps('<propfind xmlns="DAV:"><prop><getetag/></prop></propfind>')).toEqual([{ ns: DAV_NS, name: 'getetag' }]);
  });
});

describe('readMultigetHrefs', () => {
  it('reads the hrefs of Apple\'s multiget', () => {
    expect(readMultigetHrefs(MULTIGET)).toEqual(['/books/main/org-spike2.vcf', '/books/main/person-spike1.vcf']);
  });

  it('url-decodes', () => {
    expect(readMultigetHrefs('<D:href>/books/main/person-a%20b.vcf</D:href>')).toEqual(['/books/main/person-a b.vcf']);
  });
});

describe('multistatus writer', () => {
  it('answers known props with 200 and unknown ones with 404', () => {
    const r = propResponse('/books/main/', new Map([[`${DAV_NS}|displayname`, 'Kring']]), [
      { ns: DAV_NS, name: 'displayname' },
      { ns: CS_NS, name: 'me-card' },
    ]);
    expect(r).toContain('<href xmlns="DAV:">/books/main/</href>');
    expect(r).toMatch(/<displayname xmlns="DAV:">Kring<\/displayname><\/prop><status>HTTP\/1.1 200 OK/);
    expect(r).toMatch(/<me-card xmlns="http:\/\/calendarserver.org\/ns\/"\/><\/prop><status>HTTP\/1.1 404 Not Found/);
  });

  it('escapes the href', () => {
    expect(notFoundResponse('/a&b<c')).toContain('/a&amp;b&lt;c');
  });

  it('wraps responses in one multistatus document', () => {
    expect(multistatus(['<x/>'])).toBe('<?xml version="1.0" encoding="utf-8"?>\n<multistatus xmlns="DAV:"><x/></multistatus>');
  });
});
