import { describe, expect, it } from 'vitest';

import { isJassSchneider, jassTally, jassVerdict, parseJassDiaryLine } from './diary-jass.util';

const LINE = 'Jass Schieber: Anna & Clara 2530 : Beat & Dora 1870 · Gewonnen: Anna & Clara · Weis (mit Stöck) 340 : 120 · Match 3 : 0 · 12 Runden · 1 h 25 min';

describe('parseJassDiaryLine', () => {
  it('reads a Schieber line', () => {
    const r = parseJassDiaryLine(LINE);
    expect(r?.variant).toBe('Schieber');
    expect(r?.sides).toEqual([
      { names: 'Anna & Clara', score: 2530, weis: 340, matches: 3, isWinner: true },
      { names: 'Beat & Dora', score: 1870, weis: 120, matches: 0, isWinner: false },
    ]);
    expect(r?.weisLabel).toBe('Weis (mit Stöck)');
    expect(r?.handsLabel).toBe('12 Runden');
    expect(r?.duration).toBe('1 h 25 min');
    expect(r?.isDraw).toBe(false);
  });

  it('reads a draw of three players without duration', () => {
    const r = parseJassDiaryLine('Jass Differenzler: Anna 40 : Beat 40 : Clara 90 · Unentschieden · Weis 0 : 0 : 0 · Match 0 : 0 : 0 · 4 Runden');
    expect(r?.sides.length).toBe(3);
    expect(r?.isDraw).toBe(true);
    expect(r?.duration).toBe('');
  });

  it('rejects other event lines', () => {
    expect(parseJassDiaryLine('Geburtstag Anna')).toBeUndefined();
    expect(parseJassDiaryLine('Jass mit Freunden')).toBeUndefined();
    expect(parseJassDiaryLine('Jass Schieber: Anna 10 : Beat 20 · Gewonnen: Beat · Weis 1 · Match 0 : 0 · 2 Runden')).toBeUndefined();
  });
});

describe('jassVerdict', () => {
  const line = (a: number, b: number, matches = 0) =>
    parseJassDiaryLine(`Jass Schieber: A ${a} : B ${b} · Gewonnen: A · Weis 0 : 0 · Match ${matches} : 0 · 9 Runden`)!;
  it('match beats everything', () => expect(jassVerdict(line(2500, 400, 1))).toBe('match'));
  it('close', () => expect(jassVerdict(line(2500, 2450))).toBe('close'));
  it('clear', () => expect(jassVerdict(line(2500, 2000))).toBe('clear'));
  it('rout', () => expect(jassVerdict(line(2500, 900))).toBe('rout'));
  it('draw', () => expect(jassVerdict(parseJassDiaryLine('Jass Schieber: A 10 : B 10 · Unentschieden · Weis 0 : 0 · Match 0 : 0 · 1 Runden')!)).toBe('draw'));
  it('schneider for less than half', () => {
    expect(isJassSchneider(line(2500, 900), 1)).toBe(true);
    expect(isJassSchneider(line(2500, 2000), 1)).toBe(false);
    expect(isJassSchneider(line(2500, 900), 0)).toBe(false);
  });
});

describe('jassTally', () => {
  it('splits into Z strokes', () => expect(jassTally(2570)).toEqual({ hundreds: 25, fifties: 1, twenties: 1, rest: 0 }));
  it('keeps the rest', () => expect(jassTally(157)).toEqual({ hundreds: 1, fifties: 1, twenties: 0, rest: 7 }));
  it('handles zero and negatives', () => expect(jassTally(-5)).toEqual({ hundreds: 0, fifties: 0, twenties: 0, rest: 0 }));
});
