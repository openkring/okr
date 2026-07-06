import { describe, it, expect } from 'vitest';
import { parseTelFeed } from './parse';

const FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xml:lang="de" xmlns="http://www.w3.org/2005/Atom"
      xmlns:openSearch="http://a9.com/-/spec/opensearchrss/1.0/"
      xmlns:tel="http://tel.search.ch/api/spec/result/1.0/">
  <entry>
    <tel:name>Meier</tel:name>
    <tel:firstname>John</tel:firstname>
    <tel:street>Marienfeldstrasse</tel:street>
    <tel:streetno>92</tel:streetno>
    <tel:zip>8252</tel:zip>
    <tel:city>Schlatt</tel:city>
    <tel:canton>TG</tel:canton>
    <tel:phone>+41526544230</tel:phone>
    <tel:occupation>Architekt</tel:occupation>
    <tel:extra type="email">john.meier@example.ch</tel:extra>
    <tel:extra type="website">https://meier.ch</tel:extra>
  </entry>
  <entry>
    <tel:name>Muster</tel:name>
    <tel:firstname>Anna</tel:firstname>
    <tel:zip>8000</tel:zip>
    <tel:city>Zürich</tel:city>
    <tel:phone>+41441112233</tel:phone>
    <tel:occupation></tel:occupation>
  </entry>
</feed>`;

describe('parseTelFeed', () => {
  it('maps a full entry', () => {
    const [a] = parseTelFeed(FEED);
    expect(a).toEqual({
      firstName: 'John',
      lastName: 'Meier',
      streetName: 'Marienfeldstrasse',
      streetNumber: '92',
      zipCode: '8252',
      city: 'Schlatt',
      countryCode: 'CH',
      phone: '+41526544230',
      email: 'john.meier@example.ch',
      web: 'https://meier.ch',
      occupation: 'Architekt',
    });
  });

  it('handles a sparse entry (no street/email/website, empty occupation)', () => {
    const b = parseTelFeed(FEED)[1];
    expect(b).toEqual({
      firstName: 'Anna',
      lastName: 'Muster',
      streetName: '',
      streetNumber: '',
      zipCode: '8000',
      city: 'Zürich',
      countryCode: 'CH',
      phone: '+41441112233',
      email: '',
      web: '',
      occupation: '',
    });
  });

  it('returns [] for an empty feed', () => {
    expect(parseTelFeed('<feed xmlns="http://www.w3.org/2005/Atom"></feed>')).toEqual([]);
  });

  it('normalises a single entry (not wrapped in an array)', () => {
    const single = `<feed xmlns:tel="http://tel.search.ch/api/spec/result/1.0/"><entry><tel:name>Solo</tel:name><tel:firstname>Uno</tel:firstname><tel:zip>3000</tel:zip><tel:city>Bern</tel:city></entry></feed>`;
    const res = parseTelFeed(single);
    expect(res).toHaveLength(1);
    expect(res[0].lastName).toBe('Solo');
    expect(res[0].phone).toBe('');
  });
});
