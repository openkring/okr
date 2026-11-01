import { describe, expect, it } from 'vitest';
import { parseByuIcebergs, parseDegreesMinutes, parseRevisedAt, parseStoredIcebergs, seenAtOf } from './journal-iceberg.util';

// an excerpt of https://www.scp.byu.edu/current_icebergs.html (2026-10-23), including its header row
const PAGE = `<h3>Current* Antarctic large iceberg positions</h3><!-- start update -->
<p>* Last revised: 11:32:50 10/23/26</p>
<table border=1 cellpadding=1 cellspacing=1><tr><td>Iceberg*** &nbsp;</td> <td>Longitude &nbsp;</td> <td>Latitude</td> &nbsp;</td>
<td>Most recent observation &nbsp;<br>(day of year****)</td></tr><!-- end intro --><tr><td>a76c</td><td>23 56'W</td><td> 56 45'S</td><td> 293</td></tr>
<tr><td>b09b</td><td>143 10'E</td><td> 66 3'S</td><td> 293</td></tr>
<tr><td>uk318</td><td>12 0'W</td><td> 70 30'S</td><td> 280</td></tr>
<tr><td>broken</td><td>x</td><td>y</td><td>z</td></tr>
</table>`;

describe('parseDegreesMinutes', () => {
  it('converts west and south to negative decimal degrees', () => {
    expect(parseDegreesMinutes("23 56'W")).toBeCloseTo(-23.9333, 4);
    expect(parseDegreesMinutes(" 56 45'S")).toBe(-56.75);
  });
  it('keeps east and north positive', () => {
    expect(parseDegreesMinutes("143 10'E")).toBeCloseTo(143.1667, 4);
    expect(parseDegreesMinutes("1 0'N")).toBe(1);
  });
  it('rejects malformed or out-of-range values', () => {
    expect(parseDegreesMinutes('23W')).toBeNull();
    expect(parseDegreesMinutes("23 61'W")).toBeNull();
    expect(parseDegreesMinutes("95 0'S")).toBeNull();
    expect(parseDegreesMinutes("181 0'E")).toBeNull();
  });
});

describe('parseRevisedAt', () => {
  it('reads the US date of the revision line', () => {
    expect(parseRevisedAt(PAGE)).toBe('20261023');
  });
  it('is empty without the line', () => {
    expect(parseRevisedAt('<p>nothing</p>')).toBe('');
  });
});

describe('seenAtOf', () => {
  it('uses the revision year', () => {
    expect(seenAtOf(293, '20261023')).toBe('20261020');
    expect(seenAtOf(1, '20260105')).toBe('20260101');
  });
  it('falls back to the year before for a day after the revision day', () => {
    expect(seenAtOf(360, '20270105')).toBe('20261226');
  });
});

describe('parseByuIcebergs', () => {
  it('parses the rows and skips the header and broken rows', () => {
    const snap = parseByuIcebergs(PAGE);
    expect(snap.revisedAt).toBe('20261023');
    expect(snap.icebergs.map((i) => i.name)).toEqual(['A76C', 'B09B', 'UK318']);
    expect(snap.icebergs[0]).toEqual({ name: 'A76C', lat: -56.75, lng: -23.9333, seenAt: '20261020' });
    expect(snap.icebergs[2].seenAt).toBe('20261007');
  });
  it('rejects swapped columns', () => {
    const swapped = `<tr><td>a81</td><td>54 52'S</td><td>38 20'W</td><td>292</td></tr>`;
    expect(parseByuIcebergs(swapped).icebergs).toEqual([]);
  });
  it('is empty for an unrelated page', () => {
    expect(parseByuIcebergs('<html><body>moved</body></html>')).toEqual({ revisedAt: '', icebergs: [] });
  });
});

describe('parseStoredIcebergs', () => {
  it('reads a stored snapshot and drops damaged entries', () => {
    const raw = JSON.stringify({ revisedAt: '20261023', icebergs: [{ name: 'A81', lat: -54.8, lng: -38.3, seenAt: '20261019' }, { name: 1 }] });
    expect(parseStoredIcebergs(raw)).toEqual({ revisedAt: '20261023', icebergs: [{ name: 'A81', lat: -54.8, lng: -38.3, seenAt: '20261019' }] });
  });
  it('is undefined for missing or invalid JSON', () => {
    expect(parseStoredIcebergs(null)).toBeUndefined();
    expect(parseStoredIcebergs('{oops')).toBeUndefined();
    expect(parseStoredIcebergs('{}')).toBeUndefined();
  });
});
