import { bypassServiceWorker } from './news-image.util';

describe('bypassServiceWorker', () => {
  it('adds ngsw-bypass to an external https image', () => {
    expect(bypassServiceWorker('https://download-media.srf.ch/world/image/a.jpg'))
      .toBe('https://download-media.srf.ch/world/image/a.jpg?ngsw-bypass=true');
  });

  it('keeps existing query parameters and the fragment', () => {
    expect(bypassServiceWorker('https://i.ytimg.com/vi/x/hq.jpg?v=2#top'))
      .toBe('https://i.ytimg.com/vi/x/hq.jpg?v=2&ngsw-bypass=true#top');
  });

  it('does not add the parameter twice', () => {
    const url = 'https://example.org/a.png?ngsw-bypass=true';
    expect(bypassServiceWorker(url)).toBe(url);
  });

  it('leaves data:, blob: and relative URLs untouched', () => {
    expect(bypassServiceWorker('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
    expect(bypassServiceWorker('blob:https://app.example/123')).toBe('blob:https://app.example/123');
    expect(bypassServiceWorker('/assets/x.png')).toBe('/assets/x.png');
  });

  it('returns an empty string for empty input', () => {
    expect(bypassServiceWorker('')).toBe('');
    expect(bypassServiceWorker(undefined)).toBe('');
    expect(bypassServiceWorker(null)).toBe('');
  });
});
