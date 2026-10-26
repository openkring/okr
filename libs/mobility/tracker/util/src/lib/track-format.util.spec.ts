import { describe, expect, it } from 'vitest';
import { calibrationStartedAt, figureTexts, formatClockTime, formatDuration, formatKm, formatSplit, formatSteps } from './track-format.util';

describe('formatDuration', () => {
  it('formats h:mm:ss', () => {
    expect(formatDuration(0)).toBe('0:00:00');
    expect(formatDuration(65)).toBe('0:01:05');
    expect(formatDuration(3725)).toBe('1:02:05');
    expect(formatDuration(36000)).toBe('10:00:00');
  });
  it('floors fractions and clamps negatives', () => {
    expect(formatDuration(59.9)).toBe('0:00:59');
    expect(formatDuration(-5)).toBe('0:00:00');
  });
});

describe('formatKm', () => {
  it('formats kilometres with one decimal', () => {
    expect(formatKm(0)).toBe('0.0 km');
    expect(formatKm(1234)).toBe('1.2 km');
    expect(formatKm(12_960)).toBe('13.0 km');
  });
  it('uses the de-CH decimal separator', () => {
    expect(formatKm(1234, 'de-CH')).toBe('1.2 km');
  });
});

describe('formatClockTime', () => {
  it('formats the local time with leading zeros', () => expect(formatClockTime(new Date(2026, 9, 26, 7, 5).toISOString())).toBe('07:05'));
  it('is empty for an unparsable value', () => expect(formatClockTime('')).toBe(''));
});

describe('formatSplit', () => {
  it('formats m:ss per 500 m', () => expect(formatSplit(125)).toBe('2:05 /500 m'));
  it('rounds to whole seconds', () => expect(formatSplit(59.6)).toBe('1:00 /500 m'));
});

describe('formatSteps', () => {
  // the separator character depends on the ICU/CLDR version (’ in browsers, ' in some Node builds)
  it('groups thousands', () => expect(formatSteps(6240)).toMatch(/^6\D240$/));
});

describe('figureTexts', () => {
  const labels = { steps: '{steps} Schritte', splitAvg: 'Ø {split}', splitBest: 'beste {split}' };
  it('renders steps', () => expect(figureTexts({ steps: 6240 }, labels)).toEqual([`${formatSteps(6240)} Schritte`]));
  it('renders average and best split', () => {
    expect(figureTexts({ splitAvgS: 148, splitBestS: 131 }, labels)).toEqual(['Ø 2:28 /500 m', 'beste 2:11 /500 m']);
  });
  it('renders nothing without figures', () => expect(figureTexts({}, labels)).toEqual([]));
  it('leaves out a figure whose label is empty', () => expect(figureTexts({ splitAvgS: 148, splitBestS: 131 }, { ...labels, splitBest: '' })).toEqual(['Ø 2:28 /500 m']));
});

describe('calibrationStartedAt', () => {
  it('reads the start time from the file name', () => expect(calibrationStartedAt('calibration/row-1761465600000.csv')).toBe('2025-10-26T08:00:00.000Z'));
  it('is empty for another name', () => expect(calibrationStartedAt('calibration/notes.csv')).toBe(''));
});

describe('figureTexts with strokes (spec 1.122 2c)', () => {
  it('renders all figures in order: steps, strokes, rates, splits, distance per stroke', () => {
    const labels = {
      steps: '{steps} Schritte', strokes: '{strokes} Schläge', rateAvg: 'Ø {rate}/min', rateMax: 'max {rate}/min',
      splitAvg: 'Ø {split}', splitBest: 'beste {split}', perStroke: '{m} m/Schlag',
    };
    expect(figureTexts({ strokes: 812, strokeRateAvg: 22.4, strokeRateMax: 31, splitAvgS: 148, splitBestS: 131, distancePerStrokeM: 9.8 }, labels)).toEqual([
      `${formatSteps(812)} Schläge`, 'Ø 22.4/min', 'max 31/min', 'Ø 2:28 /500 m', 'beste 2:11 /500 m', '9.8 m/Schlag',
    ]);
  });
  it('leaves the stroke figures out when their labels are not given', () => {
    expect(figureTexts({ strokes: 812 }, { steps: 'x', splitAvg: 'y', splitBest: 'z' })).toEqual([]);
  });
});
