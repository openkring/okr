import { describe, expect, it } from 'vitest';

import { DocumentModel, DocumentRendering } from '@okr/shared-models';

import { renderingPath, resolveRendering, upsertRendering } from './rendering.util';

const svg: DocumentRendering = {
  format: 'svg', fullPath: 'tenant/scs/documents/renderings/doc1.svg',
  mimeType: 'image/svg+xml', size: 1234, generator: 'vtracer',
};
const pdf: DocumentRendering = {
  format: 'pdf', fullPath: 'tenant/scs/documents/renderings/doc1.pdf',
  mimeType: 'application/pdf', size: 999, generator: 'libreoffice',
};

function doc(renderings?: DocumentRendering[]): DocumentModel {
  const d = new DocumentModel('scs');
  d.okey = 'doc1';
  d.fullPath = 'tenant/scs/documents/logo.png';
  // cast: legacy documents genuinely arrive from Firestore without the field
  d.renderings = renderings as DocumentRendering[];
  return d;
}

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

describe('resolveRendering', () => {
  it('returns the rendering path when present', () => {
    expect(resolveRendering(doc([svg]), 'svg')).toBe(svg.fullPath);
  });

  it('falls back to fullPath for the empty format', () => {
    expect(resolveRendering(doc([svg]), '')).toBe('tenant/scs/documents/logo.png');
  });

  it('falls back to fullPath for an unknown format', () => {
    expect(resolveRendering(doc([svg]), 'pdf')).toBe('tenant/scs/documents/logo.png');
  });

  it('falls back to fullPath for a legacy document without renderings', () => {
    expect(resolveRendering(doc(undefined), 'svg')).toBe('tenant/scs/documents/logo.png');
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
