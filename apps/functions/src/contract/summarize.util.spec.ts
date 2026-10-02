import { parseSummaryResponse } from './summarize.util';

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
