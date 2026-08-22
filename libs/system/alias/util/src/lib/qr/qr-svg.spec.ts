import { describe, expect, it } from 'vitest';

import { encodeQr } from './qr-encoder';
import { renderQrSvg } from './qr-svg';

const URL = 'https://app.seeclub.org/s/qr/Ab3xK9';

describe('renderQrSvg', () => {
  it('emits a standalone svg element', () => {
    const svg = renderQrSvg(URL);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
  });

  it('sizes the viewBox as the symbol plus twice the quiet zone', () => {
    const { size } = encodeQr(URL);
    expect(renderQrSvg(URL, { margin: 4 })).toContain(`viewBox="0 0 ${size + 8} ${size + 8}"`);
  });

  it('defaults to the 4-module quiet zone the standard requires', () => {
    const { size } = encodeQr(URL);
    expect(renderQrSvg(URL)).toContain(`viewBox="0 0 ${size + 8} ${size + 8}"`);
  });

  it('paints a light background and draws the dark modules as one path', () => {
    const svg = renderQrSvg(URL, { dark: '#101010', light: '#fefefe' });
    expect(svg).toContain('#fefefe');
    expect(svg).toContain('fill="#101010"');
    expect(svg.match(/<path/g)).toHaveLength(1);   // one path, not one rect per module
  });

  it('escapes nothing into the markup from the payload — the text never reaches the svg', () => {
    expect(renderQrSvg('https://x.test/?a=1&b=<2>')).not.toContain('<2>');
  });
});
