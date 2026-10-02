import { checkSummarySource, parseSummaryResponse } from './summarize.util';

describe('parseSummaryResponse', () => {
  it('parses a valid reply', () => {
    expect(parseSummaryResponse('{"abstract":"A","suggestedTags":["x","y"]}')).toEqual({ abstract: 'A', suggestedTags: ['x', 'y'] });
  });
  it('clamps abstract to 4000 chars and tags to 5', () => {
    const r = parseSummaryResponse(JSON.stringify({ abstract: 'a'.repeat(5000), suggestedTags: ['1', '2', '3', '4', '5', '6'] }));
    expect(r.abstract).toHaveLength(4000);
    expect(r.suggestedTags).toHaveLength(5);
  });
  it('drops non-string and blank tags, tolerates missing fields', () => {
    expect(parseSummaryResponse('{"suggestedTags":["a",1,"  "]}')).toEqual({ abstract: '', suggestedTags: ['a'] });
  });
  it('throws internal on invalid JSON, undefined or non-object', () => {
    for (const bad of ['nope', undefined, '[]', 'null']) {
      expect(() => parseSummaryResponse(bad)).toThrow(expect.objectContaining({ code: 'internal' }));
    }
  });
});

describe('checkSummarySource', () => {
  const ok = { contractKey: 'c1', tenants: ['t1'], fullPath: 'tenant/t1/contracts/c1/d1/v.pdf', mimeType: 'application/pdf', size: 100 };
  const code = (f: () => unknown) => { try { f(); return 'ok'; } catch (e) { return (e as { code?: string }).code; } };
  it('returns path and mime type of a record of this contract and tenant', () => {
    expect(checkSummarySource(ok, 'c1', 't1')).toEqual({ fullPath: ok.fullPath, mimeType: 'application/pdf' });
  });
  it('refuses a record of another contract', () => {
    expect(code(() => checkSummarySource({ ...ok, contractKey: 'c2' }, 'c1', 't1'))).toBe('failed-precondition');
  });
  it('refuses a record of another tenant', () => {
    expect(code(() => checkSummarySource({ ...ok, tenants: ['t2'] }, 'c1', 't1'))).toBe('failed-precondition');
  });
  it('refuses a missing record, a missing path and an oversized file', () => {
    expect(code(() => checkSummarySource(undefined, 'c1', 't1'))).toBe('failed-precondition');
    expect(code(() => checkSummarySource({ ...ok, fullPath: '' }, 'c1', 't1'))).toBe('failed-precondition');
    expect(code(() => checkSummarySource({ ...ok, fullPath: undefined }, 'c1', 't1'))).toBe('failed-precondition');
    expect(code(() => checkSummarySource({ ...ok, size: 16 * 1024 * 1024 }, 'c1', 't1'))).toBe('failed-precondition');
  });
  it('defaults the mime type to pdf', () => {
    expect(checkSummarySource({ ...ok, mimeType: '' }, 'c1', 't1').mimeType).toBe('application/pdf');
  });
});
