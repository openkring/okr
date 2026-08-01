import { describe, expect, it } from 'vitest';
import {
  defaultSystemPrompt,
  resolveMaxOutputTokens,
  resolveModel,
  scopeFromPath,
  scopeMetadataFilter,
} from './rag-config.util';

describe('scopeFromPath', () => {
  it('returns the folder between rag/ and the file name', () => {
    expect(scopeFromPath('tenant/scs/rag/statuten/2026.pdf')).toBe('statuten');
  });

  it('joins nested folders', () => {
    expect(scopeFromPath('tenant/scs/rag/statuten/alt/1998.pdf')).toBe('statuten/alt');
  });

  it('returns empty for a file uploaded flat into rag/', () => {
    expect(scopeFromPath('tenant/scs/rag/report.pdf')).toBe('');
  });

  it('returns empty for a path outside the rag prefix', () => {
    expect(scopeFromPath('tenant/scs/docs/report.pdf')).toBe('');
    expect(scopeFromPath('report.pdf')).toBe('');
  });
});

describe('resolveModel', () => {
  it('keeps a supported model', () => {
    expect(resolveModel('gemini-3.6-flash')).toBe('gemini-3.6-flash');
  });

  it('falls back for the deprecated preview model the live section still names', () => {
    expect(resolveModel('gemini-3-flash-preview')).toBe('gemini-3.6-flash');
  });

  it('falls back for absent, empty or non-string values', () => {
    expect(resolveModel(undefined)).toBe('gemini-3.6-flash');
    expect(resolveModel('')).toBe('gemini-3.6-flash');
    expect(resolveModel(42)).toBe('gemini-3.6-flash');
  });
});

describe('resolveMaxOutputTokens', () => {
  it('passes an in-range value through', () => {
    expect(resolveMaxOutputTokens(2000)).toBe(2000);
  });

  it('clamps to the supported range', () => {
    expect(resolveMaxOutputTokens(10)).toBe(256);
    expect(resolveMaxOutputTokens(999999)).toBe(8192);
  });

  it('rounds a fractional value', () => {
    expect(resolveMaxOutputTokens(1000.6)).toBe(1001);
  });

  it('leaves the model default in place for absent/0/garbage', () => {
    expect(resolveMaxOutputTokens(undefined)).toBeUndefined();
    expect(resolveMaxOutputTokens(0)).toBeUndefined();
    expect(resolveMaxOutputTokens(-5)).toBeUndefined();
    expect(resolveMaxOutputTokens('2000')).toBeUndefined();
    expect(resolveMaxOutputTokens(Number.NaN)).toBeUndefined();
  });
});

describe('scopeMetadataFilter', () => {
  it('builds an AIP-160 equality filter', () => {
    expect(scopeMetadataFilter('statuten')).toBe('scope = "statuten"');
  });

  it('trims surrounding slashes and whitespace', () => {
    expect(scopeMetadataFilter('  /statuten/  ')).toBe('scope = "statuten"');
  });

  it('returns undefined when no scope is configured', () => {
    expect(scopeMetadataFilter(undefined)).toBeUndefined();
    expect(scopeMetadataFilter('')).toBeUndefined();
    expect(scopeMetadataFilter('   ')).toBeUndefined();
  });

  it('drops a value containing a quote rather than emitting a broken filter', () => {
    expect(scopeMetadataFilter('sta"tuten')).toBeUndefined();
  });
});

describe('defaultSystemPrompt', () => {
  it('names the tenant and does not assert what kind of club it is', () => {
    const prompt = defaultSystemPrompt('Seeclub Stäfa');
    expect(prompt).toContain('Seeclub Stäfa');
    expect(prompt).not.toMatch(/Segelclub|Segelverein|Rudern/);
  });

  it('confines the model to the indexed documents', () => {
    expect(defaultSystemPrompt('Verein X')).toContain('ausschliesslich auf die bereitgestellten Dokumente');
  });
});
