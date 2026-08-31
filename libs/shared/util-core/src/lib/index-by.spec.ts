import { describe, expect, it } from 'vitest';
import { indexBy } from './index-by';

type Row = { okey?: string; name: string };

describe('indexBy', () => {
  it('indexes items by the selected key', () => {
    const rows: Row[] = [{ okey: 'a', name: 'Anna' }, { okey: 'b', name: 'Bruno' }];
    const map = indexBy(rows, r => r.okey);
    expect(map.get('a')?.name).toBe('Anna');
    expect(map.get('b')?.name).toBe('Bruno');
    expect(map.size).toBe(2);
  });

  it('returns an empty map for undefined input', () => {
    expect(indexBy<Row>(undefined, r => r.okey).size).toBe(0);
  });

  it('skips items whose key is undefined or empty', () => {
    const rows: Row[] = [{ okey: 'a', name: 'Anna' }, { name: 'Ohne' }, { okey: '', name: 'Leer' }];
    const map = indexBy(rows, r => r.okey);
    expect(map.size).toBe(1);
    expect(map.get('a')?.name).toBe('Anna');
  });

  it('keeps the LAST item when a key repeats, matching Array.find semantics being replaced', () => {
    // Array.find returns the FIRST match; a Map built by assignment keeps the LAST.
    // Duplicate okeys cannot occur (they are Firestore document ids), so this only
    // pins the behaviour rather than asserting a requirement.
    const rows: Row[] = [{ okey: 'a', name: 'Erste' }, { okey: 'a', name: 'Zweite' }];
    expect(indexBy(rows, r => r.okey).get('a')?.name).toBe('Zweite');
  });
});
