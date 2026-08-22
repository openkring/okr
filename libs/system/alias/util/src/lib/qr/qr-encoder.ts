/*
 * QR Code generator library — TypeScript port.
 *
 * Portiert aus der Referenzimplementierung "QR Code generator library" von Project Nayuki
 * (https://www.nayuki.io/page/qr-code-generator-library), die unter der MIT-Lizenz steht.
 * Der Lizenztext der Referenzimplementierung ist unten unverändert wiedergegeben; er gilt
 * für diese abgeleitete Fassung fort.
 *
 * ---------------------------------------------------------------------------------------
 * QR Code generator library (TypeScript)
 *
 * Copyright (c) Project Nayuki. (MIT License)
 * https://www.nayuki.io/page/qr-code-generator-library
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 * - The above copyright notice and this permission notice shall be included in
 *   all copies or substantial portions of the Software.
 * - The Software is provided "as is", without warranty of any kind, express or
 *   implied, including but not limited to the warranties of merchantability,
 *   fitness for a particular purpose and noninfringement. In no event shall the
 *   authors or copyright holders be liable for any claim, damages or other
 *   liability, whether in an action of contract, tort or otherwise, arising from,
 *   out of or in connection with the Software or the use or other dealings in the
 *   Software.
 * ---------------------------------------------------------------------------------------
 *
 * Nach aussen exportiert dieses Modul ausschliesslich `QrEcc` und `encodeQr`. Die interne
 * Klassenstruktur (QrCode, QrSegment, Mode, Ecc) ist bewusst modul-privat.
 */

/* ----------------------------------------------------------------------------------------
 * Bit-Helfer
 * -------------------------------------------------------------------------------------- */

type Bit = 0 | 1;

/** Die `len` niederwertigsten Bits von `val` (MSB zuerst) an `bb` anhängen. */
function appendBits(val: number, len: number, bb: Bit[]): void {
  if (len < 0 || len > 31 || val >>> len !== 0) throw new RangeError('Value out of range');
  for (let i = len - 1; i >= 0; i--) bb.push(((val >>> i) & 1) as Bit);
}

/** Bit `i` (0 = niederwertigstes) von `x`. */
function getBit(x: number, i: number): boolean {
  return ((x >>> i) & 1) !== 0;
}

/** UTF-8-Bytes eines Strings — ohne TextEncoder, damit das Modul überall läuft. */
function toUtf8ByteArray(str: string): number[] {
  const encoded = encodeURI(str);
  const result: number[] = [];
  for (let i = 0; i < encoded.length; i++) {
    if (encoded.charAt(i) !== '%') {
      result.push(encoded.charCodeAt(i));
    } else {
      result.push(parseInt(encoded.substring(i + 1, i + 3), 16));
      i += 2;
    }
  }
  return result;
}

/* ----------------------------------------------------------------------------------------
 * Modus (Segment-Kodierung)
 * -------------------------------------------------------------------------------------- */

class Mode {
  public static readonly NUMERIC = new Mode(0x1, [10, 12, 14]);
  public static readonly ALPHANUMERIC = new Mode(0x2, [9, 11, 13]);
  public static readonly BYTE = new Mode(0x4, [8, 16, 16]);
  public static readonly KANJI = new Mode(0x8, [8, 10, 12]);
  public static readonly ECI = new Mode(0x7, [0, 0, 0]);

  private constructor(
    public readonly modeBits: number,
    private readonly numBitsCharCount: readonly [number, number, number],
  ) {}

  /** Breite des Zeichenzählerfelds für die gegebene Version. */
  public numCharCountBits(ver: number): number {
    return this.numBitsCharCount[Math.floor((ver + 7) / 17)];
  }
}

/* ----------------------------------------------------------------------------------------
 * Fehlerkorrekturstufe
 * -------------------------------------------------------------------------------------- */

class Ecc {
  public static readonly LOW = new Ecc(0, 1);
  public static readonly MEDIUM = new Ecc(1, 0);
  public static readonly QUARTILE = new Ecc(2, 3);
  public static readonly HIGH = new Ecc(3, 2);

  private constructor(
    public readonly ordinal: number,
    public readonly formatBits: number,
  ) {}
}

/* ----------------------------------------------------------------------------------------
 * Segment
 * -------------------------------------------------------------------------------------- */

const NUMERIC_REGEX = /^[0-9]*$/;
const ALPHANUMERIC_REGEX = /^[A-Z0-9 $%*+.\/:-]*$/;
const ALPHANUMERIC_CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

class QrSegment {
  public constructor(
    public readonly mode: Mode,
    public readonly numChars: number,
    private readonly bitData: readonly Bit[],
  ) {
    if (numChars < 0) throw new RangeError('Invalid argument');
  }

  public getData(): readonly Bit[] {
    return this.bitData;
  }

  /** Beliebige Bytes im Byte-Modus. */
  public static makeBytes(data: readonly number[]): QrSegment {
    const bb: Bit[] = [];
    for (const b of data) appendBits(b, 8, bb);
    return new QrSegment(Mode.BYTE, data.length, bb);
  }

  /** Reine Ziffernfolge im numerischen Modus (3 Ziffern → 10 Bit). */
  public static makeNumeric(digits: string): QrSegment {
    if (!NUMERIC_REGEX.test(digits)) throw new RangeError('String contains non-numeric characters');
    const bb: Bit[] = [];
    for (let i = 0; i < digits.length; ) {
      const n = Math.min(digits.length - i, 3);
      appendBits(parseInt(digits.substring(i, i + n), 10), n * 3 + 1, bb);
      i += n;
    }
    return new QrSegment(Mode.NUMERIC, digits.length, bb);
  }

  /** Alphanumerischer Modus (2 Zeichen → 11 Bit) über den 45-Zeichen-Vorrat der Norm. */
  public static makeAlphanumeric(text: string): QrSegment {
    if (!ALPHANUMERIC_REGEX.test(text)) {
      throw new RangeError('String contains unencodable characters in alphanumeric mode');
    }
    const bb: Bit[] = [];
    let i = 0;
    for (; i + 2 <= text.length; i += 2) {
      let temp = ALPHANUMERIC_CHARSET.indexOf(text.charAt(i)) * 45;
      temp += ALPHANUMERIC_CHARSET.indexOf(text.charAt(i + 1));
      appendBits(temp, 11, bb);
    }
    if (i < text.length) appendBits(ALPHANUMERIC_CHARSET.indexOf(text.charAt(i)), 6, bb);
    return new QrSegment(Mode.ALPHANUMERIC, text.length, bb);
  }

  /** Den kürzesten sinnvollen Segmentplan für einen Text wählen. */
  public static makeSegments(text: string): QrSegment[] {
    if (text === '') return [];
    if (NUMERIC_REGEX.test(text)) return [QrSegment.makeNumeric(text)];
    if (ALPHANUMERIC_REGEX.test(text)) return [QrSegment.makeAlphanumeric(text)];
    return [QrSegment.makeBytes(toUtf8ByteArray(text))];
  }

  /** Gesamtbitzahl der Segmente bei gegebener Version, Infinity bei Zählerüberlauf. */
  public static getTotalBits(segs: readonly QrSegment[], version: number): number {
    let result = 0;
    for (const seg of segs) {
      const ccbits = seg.mode.numCharCountBits(version);
      if (seg.numChars >= 1 << ccbits) return Infinity;
      result += 4 + ccbits + seg.getData().length;
    }
    return result;
  }
}

/* ----------------------------------------------------------------------------------------
 * Fehlerkorrektur-Kenngrössen (ISO/IEC 18004, Tabelle 9). Index 0 ist Platzhalter.
 * -------------------------------------------------------------------------------------- */

// prettier-ignore
const ECC_CODEWORDS_PER_BLOCK: readonly (readonly number[])[] = [
  // 0   1   2   3   4   5   6   7   8   9  10  11  12  13  14  15  16  17  18  19  20  21  22  23  24  25  26  27  28  29  30  31  32  33  34  35  36  37  38  39  40
  [ -1,  7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30], // L
  [ -1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28], // M
  [ -1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30], // Q
  [ -1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30], // H
];

// prettier-ignore
const NUM_ERROR_CORRECTION_BLOCKS: readonly (readonly number[])[] = [
  // 0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31 32 33 34 35 36 37 38 39 40
  [ -1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9,10,12,12,12,13,14,15,16,17,18,19,19,20,21,22,24,25], // L
  [ -1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9,10,10,11,13,14,16,17,17,18,20,21,23,25,26,28,29,31,33,35,37,38,40,43,45,47,49], // M
  [ -1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8,10,12,16,12,17,16,18,21,20,23,23,25,27,29,34,34,35,38,40,43,45,48,51,53,56,59,62,65,68], // Q
  [ -1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8,11,11,16,16,18,16,19,21,25,25,25,34,30,32,35,37,40,42,45,48,51,54,57,60,63,66,70,74,77,81], // H
];

const MIN_VERSION = 1;
const MAX_VERSION = 40;

const PENALTY_N1 = 3;
const PENALTY_N2 = 3;
const PENALTY_N3 = 40;
const PENALTY_N4 = 10;

/* ----------------------------------------------------------------------------------------
 * QR-Symbol
 * -------------------------------------------------------------------------------------- */

class QrCode {
  public readonly size: number;
  public readonly mask: number;

  /** modules[y][x] — true = dunkel. */
  private readonly modules: boolean[][] = [];
  /** Funktionsmodule (Finder, Timing, Format, Version, Alignment) — nicht maskierbar. */
  private readonly isFunction: boolean[][] = [];

  public constructor(
    public readonly version: number,
    public readonly errorCorrectionLevel: Ecc,
    dataCodewords: readonly number[],
    msk: number,
  ) {
    if (version < MIN_VERSION || version > MAX_VERSION) throw new RangeError('Version value out of range');
    if (msk < -1 || msk > 7) throw new RangeError('Mask value out of range');
    this.size = version * 4 + 17;

    for (let i = 0; i < this.size; i++) {
      this.modules.push(new Array<boolean>(this.size).fill(false));
      this.isFunction.push(new Array<boolean>(this.size).fill(false));
    }

    this.drawFunctionPatterns();
    const allCodewords = this.addEccAndInterleave(dataCodewords);
    this.drawCodewords(allCodewords);

    if (msk === -1) {
      let minPenalty = Infinity;
      for (let i = 0; i < 8; i++) {
        this.applyMask(i);
        this.drawFormatBits(i);
        const penalty = this.getPenaltyScore();
        if (penalty < minPenalty) {
          msk = i;
          minPenalty = penalty;
        }
        this.applyMask(i); // XOR ist selbstinvers — Maske wieder entfernen
      }
    }
    this.mask = msk;
    this.applyMask(msk);
    this.drawFormatBits(msk);
  }

  public getModule(x: number, y: number): boolean {
    return 0 <= x && x < this.size && 0 <= y && y < this.size && this.modules[y][x];
  }

  /* -- Kodierung ------------------------------------------------------------------------ */

  public static encodeText(text: string, ecl: Ecc): QrCode {
    return QrCode.encodeSegments(QrSegment.makeSegments(text), ecl);
  }

  public static encodeSegments(
    segs: readonly QrSegment[],
    ecl: Ecc,
    minVersion = MIN_VERSION,
    maxVersion = MAX_VERSION,
    mask = -1,
    boostEcl = true,
  ): QrCode {
    if (
      !(MIN_VERSION <= minVersion && minVersion <= maxVersion && maxVersion <= MAX_VERSION) ||
      mask < -1 ||
      mask > 7
    ) {
      throw new RangeError('Invalid value');
    }

    // Kleinste Version suchen, in die die Daten passen.
    let version = minVersion;
    let dataUsedBits = 0;
    for (;;) {
      const capacityBits = QrCode.getNumDataCodewords(version, ecl) * 8;
      const usedBits = QrSegment.getTotalBits(segs, version);
      if (usedBits <= capacityBits) {
        dataUsedBits = usedBits;
        break;
      }
      if (version >= maxVersion) {
        throw new RangeError(
          `Data too long: it exceeds the capacity of the largest QR symbol (version ${maxVersion})`,
        );
      }
      version++;
    }

    // Fehlerkorrektur gratis anheben, solange die Version dieselbe bleibt.
    for (const newEcl of [Ecc.MEDIUM, Ecc.QUARTILE, Ecc.HIGH]) {
      if (boostEcl && dataUsedBits <= QrCode.getNumDataCodewords(version, newEcl) * 8) ecl = newEcl;
    }

    const bb: Bit[] = [];
    for (const seg of segs) {
      appendBits(seg.mode.modeBits, 4, bb);
      appendBits(seg.numChars, seg.mode.numCharCountBits(version), bb);
      for (const b of seg.getData()) bb.push(b);
    }

    const dataCapacityBits = QrCode.getNumDataCodewords(version, ecl) * 8;
    appendBits(0, Math.min(4, dataCapacityBits - bb.length), bb); // Terminator
    appendBits(0, (8 - (bb.length % 8)) % 8, bb); // auf Byte-Grenze auffüllen
    for (let padByte = 0xec; bb.length < dataCapacityBits; padByte ^= 0xec ^ 0x11) {
      appendBits(padByte, 8, bb);
    }

    const dataCodewords: number[] = new Array<number>(bb.length >>> 3).fill(0);
    bb.forEach((b, i) => (dataCodewords[i >>> 3] |= b << (7 - (i & 7))));

    return new QrCode(version, ecl, dataCodewords, mask);
  }

  /* -- Funktionsmuster ------------------------------------------------------------------ */

  private drawFunctionPatterns(): void {
    // Taktmuster (Timing patterns)
    for (let i = 0; i < this.size; i++) {
      this.setFunctionModule(6, i, i % 2 === 0);
      this.setFunctionModule(i, 6, i % 2 === 0);
    }

    // Drei Suchmuster (Finder patterns) samt Trennstreifen
    this.drawFinderPattern(3, 3);
    this.drawFinderPattern(this.size - 4, 3);
    this.drawFinderPattern(3, this.size - 4);

    // Ausrichtungsmuster (Alignment patterns) — ausser an den drei Finder-Ecken
    const alignPatPos = this.getAlignmentPatternPositions();
    const numAlign = alignPatPos.length;
    for (let i = 0; i < numAlign; i++) {
      for (let j = 0; j < numAlign; j++) {
        if (
          !(
            (i === 0 && j === 0) ||
            (i === 0 && j === numAlign - 1) ||
            (i === numAlign - 1 && j === 0)
          )
        ) {
          this.drawAlignmentPattern(alignPatPos[i], alignPatPos[j]);
        }
      }
    }

    // Format- und Versionsinformation reservieren (Werte folgen später)
    this.drawFormatBits(0);
    this.drawVersion();
  }

  private drawFormatBits(mask: number): void {
    const data = (this.errorCorrectionLevel.formatBits << 3) | mask; // 5 Bit
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537); // BCH(15,5)
    const bits = ((data << 10) | rem) ^ 0x5412; // Maskenmuster der Norm

    // Erste Kopie, um das Suchmuster oben links
    for (let i = 0; i <= 5; i++) this.setFunctionModule(8, i, getBit(bits, i));
    this.setFunctionModule(8, 7, getBit(bits, 6));
    this.setFunctionModule(8, 8, getBit(bits, 7));
    this.setFunctionModule(7, 8, getBit(bits, 8));
    for (let i = 9; i < 15; i++) this.setFunctionModule(14 - i, 8, getBit(bits, i));

    // Zweite Kopie, um die beiden anderen Suchmuster
    for (let i = 0; i < 8; i++) this.setFunctionModule(this.size - 1 - i, 8, getBit(bits, i));
    for (let i = 8; i < 15; i++) this.setFunctionModule(8, this.size - 15 + i, getBit(bits, i));
    this.setFunctionModule(8, this.size - 8, true); // stets dunkles Modul
  }

  private drawVersion(): void {
    if (this.version < 7) return;
    let rem = this.version; // 6 Bit
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25); // BCH(18,6)
    const bits = (this.version << 12) | rem;

    for (let i = 0; i < 18; i++) {
      const color = getBit(bits, i);
      const a = this.size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      this.setFunctionModule(a, b, color);
      this.setFunctionModule(b, a, color);
    }
  }

  private drawFinderPattern(x: number, y: number): void {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy)); // Chebyshev-Distanz
        const xx = x + dx;
        const yy = y + dy;
        if (0 <= xx && xx < this.size && 0 <= yy && yy < this.size) {
          this.setFunctionModule(xx, yy, dist !== 2 && dist !== 4);
        }
      }
    }
  }

  private drawAlignmentPattern(x: number, y: number): void {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        this.setFunctionModule(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
  }

  private setFunctionModule(x: number, y: number, isDark: boolean): void {
    this.modules[y][x] = isDark;
    this.isFunction[y][x] = true;
  }

  /* -- Codewörter ----------------------------------------------------------------------- */

  /** Fehlerkorrektur je Block anhängen und alle Blöcke verschachteln. */
  private addEccAndInterleave(data: readonly number[]): number[] {
    const ver = this.version;
    const ecl = this.errorCorrectionLevel;
    if (data.length !== QrCode.getNumDataCodewords(ver, ecl)) throw new RangeError('Invalid argument');

    const numBlocks = NUM_ERROR_CORRECTION_BLOCKS[ecl.ordinal][ver];
    const blockEccLen = ECC_CODEWORDS_PER_BLOCK[ecl.ordinal][ver];
    const rawCodewords = Math.floor(QrCode.getNumRawDataModules(ver) / 8);
    const numShortBlocks = numBlocks - (rawCodewords % numBlocks);
    const shortBlockLen = Math.floor(rawCodewords / numBlocks);

    const blocks: number[][] = [];
    const rsDiv = QrCode.reedSolomonComputeDivisor(blockEccLen);
    for (let i = 0, k = 0; i < numBlocks; i++) {
      const dat = data.slice(k, k + shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1));
      k += dat.length;
      const ecc = QrCode.reedSolomonComputeRemainder(dat, rsDiv);
      if (i < numShortBlocks) dat.push(0); // Platzhalter, damit alle Blöcke gleich lang sind
      blocks.push(dat.concat(ecc));
    }

    const result: number[] = [];
    for (let i = 0; i < blocks[0].length; i++) {
      blocks.forEach((block, j) => {
        // Den Platzhalter der kurzen Blöcke überspringen
        if (i !== shortBlockLen - blockEccLen || j >= numShortBlocks) result.push(block[i]);
      });
    }
    return result;
  }

  /** Die verschachtelten Codewörter im Zickzack von rechts unten nach links oben setzen. */
  private drawCodewords(data: readonly number[]): void {
    if (data.length !== Math.floor(QrCode.getNumRawDataModules(this.version) / 8)) {
      throw new RangeError('Invalid argument');
    }
    let i = 0; // Bitindex
    for (let right = this.size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5; // vertikales Taktmuster überspringen
      for (let vert = 0; vert < this.size; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? this.size - 1 - vert : vert;
          if (!this.isFunction[y][x] && i < data.length * 8) {
            this.modules[y][x] = getBit(data[i >>> 3], 7 - (i & 7));
            i++;
          }
          // Restbits (immer 0) bleiben hell.
        }
      }
    }
  }

  /* -- Maskierung ----------------------------------------------------------------------- */

  /** XOR der Maske auf alle Nicht-Funktionsmodule. Selbstinvers. */
  private applyMask(mask: number): void {
    if (mask < 0 || mask > 7) throw new RangeError('Mask value out of range');
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        let invert: boolean;
        switch (mask) {
          case 0: invert = (x + y) % 2 === 0; break;
          case 1: invert = y % 2 === 0; break;
          case 2: invert = x % 3 === 0; break;
          case 3: invert = (x + y) % 3 === 0; break;
          case 4: invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
          case 5: invert = ((x * y) % 2) + ((x * y) % 3) === 0; break;
          case 6: invert = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0; break;
          case 7: invert = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0; break;
          default: throw new RangeError('Unreachable');
        }
        if (!this.isFunction[y][x] && invert) this.modules[y][x] = !this.modules[y][x];
      }
    }
  }

  /** Strafpunkte der vier Kriterien der Norm — je kleiner, desto besser lesbar. */
  private getPenaltyScore(): number {
    let result = 0;

    // Kriterium 1+3, zeilenweise
    for (let y = 0; y < this.size; y++) {
      let runColor = false;
      let runX = 0;
      const runHistory = [0, 0, 0, 0, 0, 0, 0];
      for (let x = 0; x < this.size; x++) {
        if (this.modules[y][x] === runColor) {
          runX++;
          if (runX === 5) result += PENALTY_N1;
          else if (runX > 5) result++;
        } else {
          this.finderPenaltyAddHistory(runX, runHistory);
          if (!runColor) result += this.finderPenaltyCountPatterns(runHistory) * PENALTY_N3;
          runColor = this.modules[y][x];
          runX = 1;
        }
      }
      result += this.finderPenaltyTerminateAndCount(runColor, runX, runHistory) * PENALTY_N3;
    }

    // Kriterium 1+3, spaltenweise
    for (let x = 0; x < this.size; x++) {
      let runColor = false;
      let runY = 0;
      const runHistory = [0, 0, 0, 0, 0, 0, 0];
      for (let y = 0; y < this.size; y++) {
        if (this.modules[y][x] === runColor) {
          runY++;
          if (runY === 5) result += PENALTY_N1;
          else if (runY > 5) result++;
        } else {
          this.finderPenaltyAddHistory(runY, runHistory);
          if (!runColor) result += this.finderPenaltyCountPatterns(runHistory) * PENALTY_N3;
          runColor = this.modules[y][x];
          runY = 1;
        }
      }
      result += this.finderPenaltyTerminateAndCount(runColor, runY, runHistory) * PENALTY_N3;
    }

    // Kriterium 2: einfarbige 2x2-Blöcke
    for (let y = 0; y < this.size - 1; y++) {
      for (let x = 0; x < this.size - 1; x++) {
        const color = this.modules[y][x];
        if (
          color === this.modules[y][x + 1] &&
          color === this.modules[y + 1][x] &&
          color === this.modules[y + 1][x + 1]
        ) {
          result += PENALTY_N2;
        }
      }
    }

    // Kriterium 4: Abweichung vom Hell-/Dunkel-Gleichgewicht
    let dark = 0;
    for (const row of this.modules) {
      dark = row.reduce((sum, color) => sum + (color ? 1 : 0), dark);
    }
    const total = this.size * this.size;
    // k = Anzahl der vollen 5-%-Schritte, um die dark/total von 50 % abweicht
    const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
    result += k * PENALTY_N4;
    return result;
  }

  /** Zählt 1:1:3:1:1-Muster (mit hellem Rand) in der Lauflängen-Historie. */
  private finderPenaltyCountPatterns(runHistory: readonly number[]): number {
    const n = runHistory[1];
    const core =
      n > 0 && runHistory[2] === n && runHistory[3] === n * 3 && runHistory[4] === n && runHistory[5] === n;
    return (
      (core && runHistory[0] >= n * 4 && runHistory[6] >= n ? 1 : 0) +
      (core && runHistory[6] >= n * 4 && runHistory[0] >= n ? 1 : 0)
    );
  }

  private finderPenaltyTerminateAndCount(
    currentRunColor: boolean,
    currentRunLength: number,
    runHistory: number[],
  ): number {
    if (currentRunColor) {
      this.finderPenaltyAddHistory(currentRunLength, runHistory);
      currentRunLength = 0;
    }
    currentRunLength += this.size; // heller Rand hinter der letzten Lauflänge
    this.finderPenaltyAddHistory(currentRunLength, runHistory);
    return this.finderPenaltyCountPatterns(runHistory);
  }

  private finderPenaltyAddHistory(currentRunLength: number, runHistory: number[]): void {
    if (runHistory[0] === 0) currentRunLength += this.size; // heller Rand vor der ersten Lauflänge
    runHistory.pop();
    runHistory.unshift(currentRunLength);
  }

  /* -- Tabellen und Reed-Solomon -------------------------------------------------------- */

  private getAlignmentPatternPositions(): number[] {
    if (this.version === 1) return [];
    const numAlign = Math.floor(this.version / 7) + 2;
    const step =
      this.version === 32 ? 26 : Math.ceil((this.version * 4 + 17 - 13) / (numAlign * 2 - 2)) * 2;
    const result: number[] = [6];
    for (let pos = this.size - 7; result.length < numAlign; pos -= step) result.splice(1, 0, pos);
    return result;
  }

  /** Module, die für Daten+Fehlerkorrektur zur Verfügung stehen. */
  private static getNumRawDataModules(ver: number): number {
    if (ver < MIN_VERSION || ver > MAX_VERSION) throw new RangeError('Version number out of range');
    let result = (16 * ver + 128) * ver + 64;
    if (ver >= 2) {
      const numAlign = Math.floor(ver / 7) + 2;
      result -= (25 * numAlign - 10) * numAlign - 55;
      if (ver >= 7) result -= 36;
    }
    return result;
  }

  private static getNumDataCodewords(ver: number, ecl: Ecc): number {
    return (
      Math.floor(QrCode.getNumRawDataModules(ver) / 8) -
      ECC_CODEWORDS_PER_BLOCK[ecl.ordinal][ver] * NUM_ERROR_CORRECTION_BLOCKS[ecl.ordinal][ver]
    );
  }

  /** Generatorpolynom vom Grad `degree`: Produkt (x - r^i), r = 0x02 in GF(2^8). */
  private static reedSolomonComputeDivisor(degree: number): number[] {
    if (degree < 1 || degree > 255) throw new RangeError('Degree out of range');
    const result: number[] = new Array<number>(degree - 1).fill(0);
    result.push(1); // Monom x^0, entspricht dem Polynom 1

    let root = 1;
    for (let i = 0; i < degree; i++) {
      for (let j = 0; j < result.length; j++) {
        result[j] = QrCode.reedSolomonMultiply(result[j], root);
        if (j + 1 < result.length) result[j] ^= result[j + 1];
      }
      root = QrCode.reedSolomonMultiply(root, 0x02);
    }
    return result;
  }

  /** Rest der Division des Datenpolynoms durch das Generatorpolynom. */
  private static reedSolomonComputeRemainder(
    data: readonly number[],
    divisor: readonly number[],
  ): number[] {
    const result: number[] = divisor.map(() => 0);
    for (const b of data) {
      const factor = b ^ (result.shift() as number);
      result.push(0);
      divisor.forEach((coef, i) => (result[i] ^= QrCode.reedSolomonMultiply(coef, factor)));
    }
    return result;
  }

  /** Multiplikation in GF(2^8) modulo x^8 + x^4 + x^3 + x^2 + 1. */
  private static reedSolomonMultiply(x: number, y: number): number {
    if (x >>> 8 !== 0 || y >>> 8 !== 0) throw new RangeError('Byte out of range');
    let z = 0;
    for (let i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11d);
      z ^= ((y >>> i) & 1) * x;
    }
    return z;
  }
}

const ECC_BY_LEVEL = { L: Ecc.LOW, M: Ecc.MEDIUM, Q: Ecc.QUARTILE, H: Ecc.HIGH } as const;

/* ----------------------------------------------------------------------------------------
 * Öffentliche Fassade
 * -------------------------------------------------------------------------------------- */

/** Fehlerkorrekturstufe. Default M (15 %); für gedruckte Plakate Q (25 %) wählen. */
export type QrEcc = 'L' | 'M' | 'Q' | 'H';

/**
 * Text als QR-Modulmatrix kodieren.
 *
 * Eigener Port statt einer Abhängigkeit (Spec, Entscheid 10): `swissqrbill` liegt zwar in
 * apps/functions und bündelt intern denselben Referenz-Encoder, veröffentlicht ihn aber nicht in
 * seiner exports-Map, und seine öffentliche API kodiert ausschliesslich validierte Swiss Payment
 * Codes — keinen Freitext.
 *
 * @returns size = Kantenlänge in Modulen, modules[y][x] = true für ein dunkles Modul.
 */
export function encodeQr(text: string, ecc: QrEcc = 'M'): { size: number; modules: boolean[][] } {
  const qr = QrCode.encodeText(text, ECC_BY_LEVEL[ecc]);
  const modules: boolean[][] = [];
  for (let y = 0; y < qr.size; y++) {
    const row: boolean[] = [];
    for (let x = 0; x < qr.size; x++) row.push(qr.getModule(x, y));
    modules.push(row);
  }
  return { size: qr.size, modules };
}
