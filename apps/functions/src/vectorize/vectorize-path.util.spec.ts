import { describe, expect, it } from 'vitest';

import { DocumentRendering, renderingPath, upsertRendering } from './vectorize-path.util';

const svg: DocumentRendering = {
  format: 'svg', fullPath: 'tenant/scs/documents/renderings/doc1.svg',
  mimeType: 'image/svg+xml', size: 1234, generator: 'vtracer',
};
const pdf: DocumentRendering = {
  format: 'pdf', fullPath: 'tenant/scs/documents/renderings/doc1.pdf',
  mimeType: 'application/pdf', size: 999, generator: 'libreoffice',
};

describe('renderingPath', () => {
  it('places the rendering in a renderings/ sibling directory, keyed by docKey', () => {
    expect(renderingPath('tenant/scs/documents/logo.png', 'doc1', 'svg'))
      .toBe('tenant/scs/documents/renderings/doc1.svg');
  });

  it('handles a path with no directory', () => {
    expect(renderingPath('logo.png', 'doc1', 'svg')).toBe('renderings/doc1.svg');
  });

  it('handles a base name with multiple dots', () => {
    expect(renderingPath('a/b/my.logo.v2.png', 'doc1', 'svg')).toBe('a/b/renderings/doc1.svg');
  });
});

describe('upsertRendering', () => {
  it('appends a new format', () => {
    expect(upsertRendering([pdf], svg)).toEqual([pdf, svg]);
  });

  it('replaces an existing same-format entry and preserves unrelated formats', () => {
    const newer = { ...svg, size: 4321 };
    expect(upsertRendering([pdf, svg], newer)).toEqual([pdf, newer]);
  });

  it('handles a legacy document where renderings is undefined', () => {
    expect(upsertRendering(undefined, svg)).toEqual([svg]);
  });
});
