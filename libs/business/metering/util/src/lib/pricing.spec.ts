import { describe, expect, it } from 'vitest';
import {
  ADD_ON_PRICES, BANDS, addOnTotal, applyHysteresis, bandOf, commissionForTenant,
  priceOfBand, roundToFiveCentimes, weightedUsers,
} from './pricing';
import type { BandId } from './pricing';

describe('the band table itself', () => {
  // The table is normative (pricing spec §4). A gap or an overlap would make bandOf() silently
  // return the wrong band for the users that fall in it, which is a billing error nobody sees.
  it('is contiguous, ascending and capped', () => {
    expect(BANDS[0].from).toBe(1);
    expect(BANDS[BANDS.length - 1].to).toBe(Infinity);
    BANDS.forEach((band, i) => {
      if (i === 0) return;
      expect(band.from).toBe(BANDS[i - 1].to + 1);      // no gap, no overlap
      expect(band.price).toBeGreaterThan(BANDS[i - 1].price);
    });
  });

  it('matches the published prices exactly', () => {
    expect(BANDS.map(b => b.price)).toEqual([9, 12, 15, 19, 25, 39, 59, 99]);
  });
});

describe('weightedUsers — privileged accounts count double (§3)', () => {
  it('adds the privileged count a second time', () => {
    // The spec's own worked example: 20 members, 6 privileged → 26 → KringXS, not KringXXS.
    expect(weightedUsers(20, 6)).toBe(26);
    expect(bandOf(weightedUsers(20, 6)).id).toBe('KringXS');
  });

  it('never goes negative on nonsense input', () => {
    expect(weightedUsers(-5, -1)).toBe(0);
  });
});

describe('bandOf — the boundaries §8 asks about', () => {
  const cases: [number, BandId][] = [
    [0, 'KringXXS'],       // no accounts is cheap, not free (§2: no free tier)
    [1, 'KringXXS'],
    [25, 'KringXXS'], [26, 'KringXS'],
    [50, 'KringXS'], [51, 'KringS'],
    [100, 'KringS'], [101, 'KringM'],
    [249, 'KringM'], [250, 'KringL'],
    [499, 'KringL'], [500, 'KringXL'],
    [999, 'KringXL'], [1000, 'KringXXL'],
    [1999, 'KringXXL'], [2000, 'KringXXXL'],
    [50_000, 'KringXXXL'],   // the cap is absolute
  ];
  it.each(cases)('n = %i → %s', (n, expected) => {
    expect(bandOf(n).id).toBe(expected);
  });
});

describe('add-ons (§7) — flat, band-independent', () => {
  it('sums the flat prices', () => {
    expect(addOnTotal(['buchhaltung', 'logbuch']).total).toBe(25);
  });

  it('counts a duplicated id once', () => {
    expect(addOnTotal(['logbuch', 'logbuch']).total).toBe(5);
  });

  it('reports an unknown id instead of failing the month', () => {
    // A partner on a newer openkring may report an add-on this deployment cannot price. Losing
    // the whole month's commission over one string would be worse than under-charging by one.
    const result = addOnTotal(['logbuch', 'zeitmaschine']);
    expect(result.total).toBe(5);
    expect(result.unknown).toEqual(['zeitmaschine']);
  });

  it('prices all nine published add-ons', () => {
    expect(Object.keys(ADD_ON_PRICES)).toHaveLength(9);
    expect(ADD_ON_PRICES['buchhaltung']).toBe(20);
    expect(ADD_ON_PRICES['crm']).toBe(10);
  });
});

describe('applyHysteresis (§9.1) — up now, down after two months', () => {
  it('has nothing to hold in the first month', () => {
    expect(applyHysteresis('KringM', [])).toBe('KringM');
  });

  it('moves up immediately', () => {
    expect(applyHysteresis('KringXXL', ['KringXL'])).toBe('KringXXL');
  });

  it('holds the higher band through a one-month dip — the §8 acceptance case', () => {
    expect(applyHysteresis('KringXL', ['KringXXL'])).toBe('KringXXL');
  });

  it('drops on the second consecutive month below', () => {
    // month 1 measured low but was billed XXL (held); month 2 measures low again → XL.
    expect(applyHysteresis('KringXL', ['KringXXL', 'KringXXL'])).toBe('KringXL');
  });

  it('does not drop when the dip was interrupted by a month back at the higher band', () => {
    // billed: XXL (held after a dip), then XXL genuinely earned → this dip starts over.
    expect(applyHysteresis('KringXL', ['KringXXL', 'KringXL'])).toBe('KringXXL');
  });

  it('a tenant that stays flat keeps its band', () => {
    expect(applyHysteresis('KringM', ['KringM', 'KringM'])).toBe('KringM');
  });
});

describe('commissionForTenant — the arithmetic the 10 % rests on', () => {
  // C3 §2's worked example, the reason per-tenant records are mandatory: the same 400 weighted
  // users are worth 3.8× more split across eight tenants than held in one.
  it('one tenant of 400 weighted users yields CHF 2.50', () => {
    const r = commissionForTenant({ totalUsers: 400, privilegedUsers: 0, addOns: [] });
    expect(r.band).toBe('KringL');
    expect(r.subtotal).toBe(25);
    expect(r.commission).toBe(2.5);
  });

  it('eight tenants of 50 yield CHF 9.60 together', () => {
    const each = commissionForTenant({ totalUsers: 50, privilegedUsers: 0, addOns: [] });
    expect(each.band).toBe('KringXS');
    expect(each.subtotal).toBe(12);
    expect(roundToFiveCentimes(each.commission * 8)).toBe(9.6);
  });

  it('the CHF 9 floor counts — there is no free tenant (§8.2)', () => {
    const r = commissionForTenant({ totalUsers: 1, privilegedUsers: 0, addOns: [] });
    expect(r.commission).toBe(0.9);
  });

  it('add-ons count toward the 10 %', () => {
    const r = commissionForTenant({
      totalUsers: 100, privilegedUsers: 0, addOns: ['buchhaltung', 'logbuch'],
    });
    expect(r.bandPrice).toBe(15);       // KringS
    expect(r.addOnTotal).toBe(25);
    expect(r.subtotal).toBe(40);
    expect(r.commission).toBe(4);
  });

  it('bills the held band, not the measured one, during a one-month dip', () => {
    const r = commissionForTenant({
      totalUsers: 990, privilegedUsers: 0, addOns: [], history: ['KringXXL'],
    });
    expect(r.weightedUsers).toBe(990);  // measured: KringXL
    expect(r.band).toBe('KringXXL');    // billed: held
    expect(r.bandPrice).toBe(59);
  });

  it('weights privileged users before choosing the band', () => {
    // 240 members + 30 privileged = 270 weighted → KringL, not KringM.
    const r = commissionForTenant({ totalUsers: 240, privilegedUsers: 30, addOns: [] });
    expect(r.weightedUsers).toBe(270);
    expect(r.band).toBe('KringL');
  });

  it('rounds to five centimes', () => {
    // KringM 19 + Lohnbuchhaltung 5 = 24 → 2.40; and an odd subtotal rounds, never truncates.
    expect(commissionForTenant({
      totalUsers: 150, privilegedUsers: 0, addOns: ['lohnbuchhaltung'],
    }).commission).toBe(2.4);
    expect(roundToFiveCentimes(2.43)).toBe(2.45);
    expect(roundToFiveCentimes(2.41)).toBe(2.4);
  });
});

describe('the formula is not the price (§5)', () => {
  it('the table wins where f(n) disagrees', () => {
    // f(1000) = 9 + 0.16·1000^0.75 ≈ 37.5, the table says 59. Anyone "fixing" the table to match
    // the formula would halve every commission in that band.
    const f = (n: number) => 9 + 0.16 * Math.pow(n, 0.75);
    expect(Math.round(f(1000))).not.toBe(priceOfBand('KringXXL'));
    expect(priceOfBand('KringXXL')).toBe(59);
  });
});
