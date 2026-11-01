import { describe, expect, it } from 'vitest';
import { ocrModels, TESSERACT_MODEL_NAMES, tesseractModel } from './translator-ocr-lang';

describe('tesseractModel', () => {
  it('maps provider codes and their legacy forms', () => {
    expect(tesseractModel('de')).toBe('deu');
    expect(tesseractModel('iw')).toBe('heb');
    expect(tesseractModel('he')).toBe('heb');
    expect(tesseractModel('zh-TW')).toBe('chi_tra');
    expect(tesseractModel('zh-CN')).toBe('chi_sim');
  });
  it('falls back to the base language', () => {
    expect(tesseractModel('pt-PT')).toBe('por');
  });
  it('has no model for unsupported languages', () => {
    expect(tesseractModel('haw')).toBeNull();
  });
});

describe('ocrModels', () => {
  it('uses the chosen source language', () => {
    expect(ocrModels('fr', 'de')).toBe('fra');
  });
  it('uses UI language + English for «Sprache erkennen»', () => {
    expect(ocrModels('', 'de')).toBe('deu+eng');
    expect(ocrModels('', 'en')).toBe('eng');
  });
  it('is null when the source cannot be read', () => {
    expect(ocrModels('haw', 'de')).toBeNull();
  });
});

describe('TESSERACT_MODEL_NAMES', () => {
  it('is deduplicated', () => {
    expect(new Set(TESSERACT_MODEL_NAMES).size).toBe(TESSERACT_MODEL_NAMES.length);
    expect(TESSERACT_MODEL_NAMES).toContain('heb');
  });
});
