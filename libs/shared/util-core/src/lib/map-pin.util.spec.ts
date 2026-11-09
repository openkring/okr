import { describe, expect, it } from 'vitest';
import { pinHtml } from './map-pin.util';

const at = { lat: 47.2, lng: 8.7 };
const ICON = 'https://cdn.example.org/logo/icons/location.svg';

describe('pinHtml', () => {
  it('renders the plain label pin without an image', () => {
    const html = pinHtml({ ...at, title: 'Hafen' }, '', ICON);
    expect(html).toContain('okr-pin-label');
    expect(html).toContain('Hafen');
    expect(html).not.toContain('<img');
  });
  it('escapes the title', () => {
    expect(pinHtml({ ...at, title: 'a"<b' }, '', ICON)).toContain('a&quot;&lt;b');
  });
  it('uses the fallback label for a marker without a title', () => {
    expect(pinHtml({ ...at }, 'Ort', ICON)).toContain('Ort');
  });
  it('routes an https thumbnail past the service worker', () => {
    const html = pinHtml({ ...at, title: 'Cam', imageUrl: 'https://x.org/a.jpg' }, '', ICON);
    expect(html).toContain('src="https://x.org/a.jpg?ngsw-bypass=true"');
    expect(html).toContain('referrerpolicy="no-referrer"');
    expect(html).toContain(`src="${ICON}"`);
  });
  it('keeps a data URL unchanged', () => {
    const data = 'data:image/jpeg;base64,AAAA';
    expect(pinHtml({ ...at, imageUrl: data }, '', ICON)).toContain(`src="${data}"`);
  });
  it('never lets an image URL break out of the attribute', () => {
    const html = pinHtml({ ...at, imageUrl: '"><script>alert(1)</script>' }, '', ICON);
    expect(html).not.toContain('<script');
    expect(html).not.toMatch(/src="[^"]*"><script/);
  });
  it('drops a javascript: image URL', () => {
    expect(pinHtml({ ...at, imageUrl: 'javascript:alert(1)' }, '', ICON)).not.toContain('javascript:');
  });
});
