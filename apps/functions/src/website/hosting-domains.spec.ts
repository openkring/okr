import { appHostingSite, isAppHostingSite, toHostingDomains } from './hosting-domains';

describe('appHostingSite', () => {
  it('names the tenant app site', () => {
    expect(appHostingSite('la21staefa')).toBe('la21staefa-app-54aef');
    expect(isAppHostingSite(appHostingSite('scs'))).toBe(true);
  });

  it('rejects anything that is not an app site', () => {
    expect(isAppHostingSite('scs-website-54aef')).toBe(false);
    expect(isAppHostingSite('')).toBe(false);
  });
});

describe('toHostingDomains', () => {
  it('lists only the built-in hosts for a site without custom domains', () => {
    expect(toHostingDomains('la21staefa-app-54aef', [])).toEqual([
      { host: 'la21staefa-app-54aef.web.app', internal: true, active: true },
      { host: 'la21staefa-app-54aef.firebaseapp.com', internal: true, active: true },
    ]);
  });

  it('puts serving custom domains first, redirects after them, built-in hosts last', () => {
    const domains = toHostingDomains('scs-website-54aef', [
      { domainName: 'seeclub.org', status: 'DOMAIN_ACTIVE', domainRedirect: { domainName: 'www.seeclub.org' } },
      { domainName: 'www.seeclub.org', status: 'DOMAIN_ACTIVE' },
    ]);
    expect(domains.map((d) => d.host)).toEqual(['www.seeclub.org', 'seeclub.org', 'scs-website-54aef.web.app', 'scs-website-54aef.firebaseapp.com']);
    expect(domains[1]).toEqual({ host: 'seeclub.org', internal: false, active: true, redirectTo: 'www.seeclub.org' });
  });

  it('marks a domain that is not active yet', () => {
    expect(toHostingDomains('x-app-54aef', [{ domainName: 'App.Example.ch', status: 'DOMAIN_CERT_PENDING' }])[0])
      .toEqual({ host: 'app.example.ch', internal: false, active: false });
  });
});
