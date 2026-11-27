import { describe, expect, it } from 'vitest';

import { cleanIframeConfig, iframeHeightCss, iframeHeightOf, parseIframeSource } from './iframe-source.util';

const OSM = 'https://www.openstreetmap.org/export/embed.html?bbox=8.5,47.3,8.6,47.4&layer=mapnik';

describe('parseIframeSource', () => {
  it('accepts an https link on the allowlist', () => {
    expect(parseIframeSource(OSM)).toEqual({ url: OSM, host: 'www.openstreetmap.org', allowed: true });
  });

  it('takes the src out of an embed code and decodes &amp;', () => {
    const code = `<iframe width="425" height="350" src="${OSM.replace('&', '&amp;')}" style="border: 1px solid black"></iframe>`;
    expect(parseIframeSource(code)?.url).toBe(OSM);
    expect(parseIframeSource(`<iframe src='${OSM}'></iframe>`)?.url).toBe(OSM);
  });

  it('adds https to a link without scheme or with //', () => {
    expect(parseIframeSource('www.openstreetmap.org/export/embed.html')?.url).toBe('https://www.openstreetmap.org/export/embed.html');
    expect(parseIframeSource('//player.vimeo.com/video/1')?.url).toBe('https://player.vimeo.com/video/1');
  });

  it('recognises a host outside the allowlist, but marks it as not shown', () => {
    expect(parseIframeSource('https://www.meteoschweiz.admin.ch/widget')).toEqual({
      url: 'https://www.meteoschweiz.admin.ch/widget', host: 'www.meteoschweiz.admin.ch', allowed: false,
    });
  });

  it('rejects what is no https page', () => {
    for (const text of ['', '   ', undefined, 'hello', 'http://www.openstreetmap.org/', 'javascript:alert(1)', 'data:text/html,x', '<div>no frame</div>', '<iframe></iframe>']) {
      expect(parseIframeSource(text)).toBeUndefined();
    }
  });
});

describe('iframeHeightOf', () => {
  it('keeps a stored choice', () => {
    expect(iframeHeightOf({ height: 'L', style: 'min-height: 300px' })).toBe('L');
    expect(iframeHeightOf({ height: 'full' })).toBe('full');
  });

  it('derives the nearest choice from a legacy style', () => {
    expect(iframeHeightOf({ style: 'width: 100%; min-height:400px; border: none;' })).toBe('M');
    expect(iframeHeightOf({ style: 'width:100%;height:280px' })).toBe('S');
    expect(iframeHeightOf({ style: 'min-height: 700px' })).toBe('L');
    expect(iframeHeightOf({ style: 'min-height: 520px' })).toBe('L');
  });

  it('falls back to M', () => {
    expect(iframeHeightOf(undefined)).toBe('M');
    expect(iframeHeightOf({ style: 'border: none' })).toBe('M');
    expect(iframeHeightOf({ height: 'XL' as never })).toBe('M');
  });

  it('gives the css height', () => {
    expect(iframeHeightCss({ height: 'S' })).toBe('300px');
    expect(iframeHeightCss({ height: 'full' })).toBe('80vh');
  });
});

describe('cleanIframeConfig', () => {
  it('drops the legacy style and keeps its height', () => {
    expect(cleanIframeConfig({ url: OSM, style: 'min-height: 600px' })).toEqual({ url: OSM, height: 'L' });
  });
});
