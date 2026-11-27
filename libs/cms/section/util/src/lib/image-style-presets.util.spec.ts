import { describe, expect, it } from 'vitest';

import { CUSTOM, IMAGE_STYLE_PRESETS, isFixedHeight, presetChoice } from './image-style-presets.util';

describe('isFixedHeight', () => {
  it('is true for a real size only', () => {
    expect(isFixedHeight('300px')).toBe(true);
    expect(isFixedHeight('250')).toBe(true);
    expect(isFixedHeight(' auto ')).toBe(false);
    expect(isFixedHeight('')).toBe(false);
    expect(isFixedHeight(undefined)).toBe(false);
  });
});

describe('presetChoice', () => {
  it('finds every preset', () => {
    for (const field of ['width', 'border', 'borderRadius'] as const) {
      for (const value of IMAGE_STYLE_PRESETS[field]) expect(presetChoice(field, value)).toBe(value);
    }
  });

  it('is custom for any other value', () => {
    expect(presetChoice('width', '75%')).toBe(CUSTOM);
    expect(presetChoice('border', '3px dashed red')).toBe(CUSTOM);
    expect(presetChoice('borderRadius', '50%')).toBe(CUSTOM);
  });

  it('reads the stored spellings of «no frame» and «square» as those presets', () => {
    expect(presetChoice('border', '')).toBe('none');
    expect(presetChoice('border', '1px')).toBe('none');   // legacy: no line style draws nothing
    expect(presetChoice('border', ' 1px solid ')).toBe('1px solid');
    expect(presetChoice('borderRadius', '')).toBe('0');
    expect(presetChoice('borderRadius', '0px')).toBe('0');
  });

  it('reads a plain number as px, as the renderer does', () => {
    expect(presetChoice('borderRadius', '4')).toBe('4px');
    expect(presetChoice('width', '300')).toBe('300px');
    expect(presetChoice('borderRadius', '5')).toBe(CUSTOM);
  });
});
