import { describe, expect, it } from 'vitest';

import { encodeQr } from './qr-encoder';

describe('encodeQr', () => {
  it('produces a square module matrix of the reported size', () => {
    const qr = encodeQr('https://app.seeclub.org/s/qr/Ab3xK9');
    expect(qr.modules).toHaveLength(qr.size);
    for (const row of qr.modules) expect(row).toHaveLength(qr.size);
  });

  it('sizes the symbol as 4 * version + 17', () => {
    const qr = encodeQr('HELLO');
    expect((qr.size - 17) % 4).toBe(0);
    expect(qr.size).toBeGreaterThanOrEqual(21);   // version 1
    expect(qr.size).toBeLessThanOrEqual(177);     // version 40
  });

  it('draws the three finder patterns — dark 7x7 rings at the corners', () => {
    const { modules, size } = encodeQr('https://app.seeclub.org/s/qr/Ab3xK9');
    for (const [oy, ox] of [[0, 0], [0, size - 7], [size - 7, 0]] as const) {
      expect(modules[oy][ox]).toBe(true);          // outer ring
      expect(modules[oy + 1][ox + 1]).toBe(false); // white separator ring
      expect(modules[oy + 3][ox + 3]).toBe(true);  // 3x3 core
    }
  });

  it('keeps the fixed dark module at (4*version+9, 8)', () => {
    const qr = encodeQr('HELLO');
    const version = (qr.size - 17) / 4;
    expect(qr.modules[4 * version + 9][8]).toBe(true);
  });

  it('grows the symbol for a higher error correction level', () => {
    const text = 'https://app.seeclub.org/s/qr/Ab3xK9';
    expect(encodeQr(text, 'H').size).toBeGreaterThanOrEqual(encodeQr(text, 'M').size);
  });

  it('is deterministic — the same text and level give the same matrix', () => {
    const a = encodeQr('https://app.seeclub.org/s/qr/Ab3xK9', 'M');
    const b = encodeQr('https://app.seeclub.org/s/qr/Ab3xK9', 'M');
    expect(a.modules).toEqual(b.modules);
  });

  it('encodes an empty string rather than throwing', () => {
    expect(encodeQr('').size).toBe(21);
  });

  it('throws when the text exceeds the largest symbol', () => {
    expect(() => encodeQr('x'.repeat(8000), 'H')).toThrowError(/too long|capacity/i);
  });
});

/*
 * Regressionsschutz für die beiden Fehlerkorrektur-Tabellen im Encoder
 * (ECC_CODEWORDS_PER_BLOCK und NUM_ERROR_CORRECTION_BLOCKS).
 *
 * Warum das nötig ist: die Tests oben prüfen ausschliesslich Geometrie. Eine einzige vertippte
 * Ziffer in einer der Tabellen erzeugt ein in sich stimmiges, aber normwidriges Symbol — es hat
 * die richtige Grösse, die richtigen Suchmuster und lässt sich sogar mit derselben falschen
 * Tabelle wieder dekodieren, wird aber von keinem echten Scanner gelesen. Genau ein solcher
 * Fehler (Version 8 / Stufe H: 5 statt 6 Blöcke) steckte in der ersten Fassung und wäre durch
 * alle Tests oben durchmarschiert.
 */

/**
 * ISO/IEC 18004, Table 7 — Zeichenkapazität im Byte-Modus (8-Bit), Versionen 1…40.
 * Zeilenreihenfolge: L, M, Q, H.
 */
const ISO_BYTE_CAPACITY: Readonly<Record<QrEccLevel, readonly number[]>> = {
  L: [17, 32, 53, 78, 106, 134, 154, 192, 230, 271, 321, 367, 425, 458, 520, 586, 644, 718, 792, 858,
      929, 1003, 1091, 1171, 1273, 1367, 1465, 1528, 1628, 1732, 1840, 1952, 2068, 2188, 2303, 2431,
      2563, 2699, 2809, 2953],
  M: [14, 26, 42, 62, 84, 106, 122, 152, 180, 213, 251, 287, 331, 362, 412, 450, 504, 560, 624, 666,
      711, 779, 857, 911, 997, 1059, 1125, 1190, 1264, 1370, 1452, 1538, 1628, 1722, 1809, 1911,
      1989, 2099, 2213, 2331],
  Q: [11, 20, 32, 46, 60, 74, 86, 108, 130, 151, 177, 203, 241, 258, 292, 322, 364, 394, 442, 482,
      509, 565, 611, 661, 715, 751, 805, 868, 908, 982, 1030, 1112, 1168, 1228, 1283, 1351, 1423,
      1499, 1579, 1663],
  H: [7, 14, 24, 34, 44, 58, 64, 84, 98, 119, 137, 155, 177, 194, 220, 250, 280, 310, 338, 382,
      403, 439, 461, 511, 535, 593, 625, 658, 698, 742, 790, 842, 898, 958, 983, 1051, 1093, 1139,
      1219, 1273],
};

type QrEccLevel = 'L' | 'M' | 'Q' | 'H';
const LEVELS: readonly QrEccLevel[] = ['L', 'M', 'Q', 'H'];

describe('error correction tables', () => {
  /*
   * Die Kapazität wird nicht aus einer Kopie der Tabellen abgeleitet — das würde nur die Kopie
   * prüfen — sondern über die öffentliche API gemessen: genau `cap` Byte müssen in Version v
   * passen, `cap + 1` Byte dürfen es nicht mehr. Das klemmt die Datencodewort-Zahl jeder der
   * 160 Kombinationen beidseitig ein und schlägt damit bei jedem Tabellenfehler an.
   *
   * Kleinbuchstaben erzwingen den Byte-Modus (der alphanumerische Modus deckt nur Grossbuchstaben
   * und einige Sonderzeichen ab).
   */
  it('matches the ISO/IEC 18004 byte-mode capacity for all 160 version/level combinations', () => {
    for (const level of LEVELS) {
      for (let version = 1; version <= 40; version++) {
        const capacity = ISO_BYTE_CAPACITY[level][version - 1];
        const expectedSize = 4 * version + 17;

        // Exakt die Kapazität passt noch in diese Version …
        expect([level, version, encodeQr('x'.repeat(capacity), level).size])
          .toEqual([level, version, expectedSize]);

        // … ein Byte mehr nicht.
        if (version < 40) {
          expect([level, version, encodeQr('x'.repeat(capacity + 1), level).size])
            .toEqual([level, version, 4 * (version + 1) + 17]);
        }
      }
    }
  }, 30_000);

  /*
   * Golden Vectors. Diese Hashes stammen aus dem aktuellen, verifizierten Encoder; die erzeugten
   * Matrizen wurden Modul für Modul gegen die Referenzimplementierung (Nayuki, qrcodegen) sowie
   * gegen einen unabhängig geschriebenen Decoder geprüft.
   *
   * Schlägt dieser Test fehl, hat sich der Encoder geändert — nicht der Erwartungswert. Die Hashes
   * sind NICHT nachzuziehen, ohne dass die neue Ausgabe erneut gegen eine Referenz verifiziert
   * wurde. Ein stiller Update dieser Zeilen macht den Test wertlos.
   *
   * Dass L und M dieselbe Matrix ergeben, ist kein Fehler: `encodeQr` hebt die Stufe automatisch
   * an, solange das ohne grössere Version möglich ist (siehe JSDoc von `encodeQr`). Bei dieser
   * Nutzlast wird L deshalb zu M. Der Test friert dieses Verhalten mit ein.
   */
  it('reproduces the golden module matrices for a fixed payload', () => {
    const payload = 'https://app.seeclub.org/s/qr/Ab3xK9';
    const golden: Record<QrEccLevel, { size: number; hash: string }> = {
      L: { size: 29, hash: '6bc07c83' },
      M: { size: 29, hash: '6bc07c83' },
      Q: { size: 33, hash: '9a9af0e0' },
      H: { size: 37, hash: 'd9147f91' },
    };

    /** FNV-1a (32 Bit) — abhängigkeitsfrei, nur zur kompakten Fixierung der Matrix. */
    const fnv1a = (input: string): string => {
      let h = 0x811c9dc5;
      for (let i = 0; i < input.length; i++) {
        h ^= input.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
      }
      return h.toString(16).padStart(8, '0');
    };

    for (const level of LEVELS) {
      const { size, modules } = encodeQr(payload, level);
      const serialised = modules.map((row) => row.map((d) => (d ? '1' : '0')).join('')).join('/');
      expect([level, size, fnv1a(serialised)])
        .toEqual([level, golden[level].size, golden[level].hash]);
    }
  });
});
