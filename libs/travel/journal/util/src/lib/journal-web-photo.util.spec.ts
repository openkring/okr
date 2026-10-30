import { describe, expect, it } from 'vitest';
import { exifPosition, exifTakenAt, printSize, scaledSize, webPhotoFiles } from './journal-web-photo.util';

describe('scaledSize', () => {
  it('limits the longest edge', () => {
    expect(scaledSize({ width: 4032, height: 3024 }, 2048)).toEqual({ width: 2048, height: 1536 });
    expect(scaledSize({ width: 3024, height: 4032 }, 400)).toEqual({ width: 300, height: 400 });
  });
  it('never enlarges', () => {
    expect(scaledSize({ width: 800, height: 600 }, 2048)).toEqual({ width: 800, height: 600 });
  });
});

describe('printSize', () => {
  it('is the smallest size that fills a bleed page', () => {
    expect(printSize({ width: 6000, height: 4000 })).toEqual({ width: 3827, height: 2551 });
  });
  it('never enlarges', () => {
    expect(printSize({ width: 2000, height: 1500 })).toEqual({ width: 2000, height: 1500 });
  });
});

describe('exifTakenAt', () => {
  it('parses the raw EXIF date', () => {
    expect(exifTakenAt('2026:10:30 14:22:05')).toBe('2026-10-30T14:22:05');
  });
  it('rejects anything else', () => {
    expect(exifTakenAt(undefined)).toBeUndefined();
    expect(exifTakenAt('')).toBeUndefined();
    expect(exifTakenAt('garbage')).toBeUndefined();
  });
});

describe('exifPosition', () => {
  it('rejects 0/0 and out of range', () => {
    expect(exifPosition(0, 0)).toBeUndefined();
    expect(exifPosition(91, 10)).toBeUndefined();
  });
  it('returns a valid pair', () => {
    expect(exifPosition(-64.8, -62.9)).toEqual({ latitude: -64.8, longitude: -62.9 });
  });
});

describe('webPhotoFiles', () => {
  it('names the three files', () => {
    expect(webPhotoFiles('k')).toEqual({ file400: 'k-400.jpg', file2048: 'k-2048.jpg', filePrint: 'k-print.jpg' });
  });
});
