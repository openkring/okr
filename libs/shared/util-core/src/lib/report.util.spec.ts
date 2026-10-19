import { describe, expect, it } from 'vitest';
import { logToFindings } from './report.util';

describe('logToFindings', () => {
  it('keeps an empty log empty', () => {
    expect(logToFindings([])).toEqual([]);
  });

  it('maps id/name/message to id/title/detail', () => {
    const result = logToFindings([{ id: 'a/b', name: '12.10. 18:00 Training', message: '2× in Club' }]);
    expect(result).toEqual([{ id: 'a/b', title: '12.10. 18:00 Training', detail: '2× in Club', url: undefined }]);
  });

  it('resolves the url with urlOf', () => {
    const result = logToFindings([{ id: 'a/b', name: 'x', message: 'm' }], id => '/x/' + id);
    expect(result[0].url).toBe('/x/a/b');
  });

  it('drops MESSAGE_ONLY and nameless entries', () => {
    const result = logToFindings([
      { id: 'MESSAGE_ONLY', name: 'n', message: 'm' },
      { id: 'c', name: '', message: 'm' },
      { id: 'd', name: 'ok', message: 'm' },
    ]);
    expect(result.map(f => f.id)).toEqual(['d']);
  });
});
