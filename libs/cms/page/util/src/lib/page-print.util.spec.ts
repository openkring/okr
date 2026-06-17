import { describe, it, expect } from 'vitest';
import {
  stripProtocol,
  isPrintableSectionType,
  serializeComputedStyle,
  canvasToImg,
  assemblePagePrintPayload,
  PRINT_STYLE_PROPS,
} from './page-print.util';

describe('stripProtocol', () => {
  it('removes https://', () => {
    expect(stripProtocol('https://seeclub.org/private/x')).toBe('seeclub.org/private/x');
  });
  it('removes http://', () => {
    expect(stripProtocol('http://seeclub.org/a')).toBe('seeclub.org/a');
  });
  it('leaves a protocol-less url unchanged', () => {
    expect(stripProtocol('seeclub.org/a')).toBe('seeclub.org/a');
  });
  it('keeps path and query', () => {
    expect(stripProtocol('https://x.org/a/b?q=1')).toBe('x.org/a/b?q=1');
  });
});

describe('isPrintableSectionType', () => {
  it('returns false for interactive types', () => {
    expect(isPrintableSectionType('chat')).toBe(false);
    expect(isPrintableSectionType('rag')).toBe(false);
    expect(isPrintableSectionType('form')).toBe(false);
    expect(isPrintableSectionType('tracker')).toBe(false);
  });
  it('returns true for printable types', () => {
    expect(isPrintableSectionType('article')).toBe(true);
    expect(isPrintableSectionType('table')).toBe(true);
    expect(isPrintableSectionType('chart')).toBe(true);
  });
});

describe('serializeComputedStyle', () => {
  it('emits the allowlisted properties as inline css', () => {
    const fakeStyle = {
      getPropertyValue: (p: string) => (p === 'color' ? 'rgb(1, 2, 3)' : ''),
    } as unknown as CSSStyleDeclaration;
    const css = serializeComputedStyle(fakeStyle);
    expect(css).toContain('color:rgb(1, 2, 3)');
    // empty values are skipped
    expect(css).not.toContain('font-size:;');
  });
  it('only ever emits known properties', () => {
    const fakeStyle = {
      getPropertyValue: () => 'x',
    } as unknown as CSSStyleDeclaration;
    const css = serializeComputedStyle(fakeStyle);
    for (const decl of css.split(';').filter(Boolean)) {
      const prop = decl.split(':')[0];
      expect(PRINT_STYLE_PROPS).toContain(prop);
    }
  });
});

describe('canvasToImg', () => {
  it('produces an img with the canvas data url as src', () => {
    const canvas = {
      toDataURL: () => 'data:image/png;base64,AAAA',
      width: 300,
      height: 150,
    } as unknown as HTMLCanvasElement;
    const img = canvasToImg(canvas, document);
    expect(img.tagName).toBe('IMG');
    expect(img.getAttribute('src')).toBe('data:image/png;base64,AAAA');
  });
});

describe('assemblePagePrintPayload', () => {
  it('merges context and sections into the payload shape', () => {
    const payload = assemblePagePrintPayload(
      {
        pageTitle: 'My Page',
        pageSubtitle: 'sub',
        orgName: 'Seeclub',
        logoUrl: 'https://img/logo.svg',
        sourceUrl: 'https://seeclub.org/private/p1',
        printedDate: '17.06.2026',
      },
      [{ title: 'Intro', html: '<p>hi</p>' }],
    );
    expect(payload.pageTitle).toBe('My Page');
    expect(payload.sourceUrl).toBe('https://seeclub.org/private/p1');
    expect(payload.sourceUrlLabel).toBe('seeclub.org/private/p1');
    expect(payload.sections).toHaveLength(1);
    expect(payload.sections[0].html).toBe('<p>hi</p>');
  });
});
