/** The choice «Eigener Wert» of a preset select: the value is typed in a text field below. */
export const CUSTOM = 'custom';

/** a height that is a real size, not 'auto' or nothing: the image covers a box of that height (a crop) */
export function isFixedHeight(height: unknown): boolean {
  return typeof height === 'string' && height.trim() !== '' && height.trim() !== 'auto';
}

/** The height a crop starts with when it is chosen. */
export const DEFAULT_CROP_HEIGHT = '300px';

/** whole: the image at its own proportions (height 'auto'); crop: a box of a fixed height that the image covers */
export type ImageDisplay = 'whole' | 'crop';

export type PresetField = 'width' | 'border' | 'borderRadius';

/** The values offered for a field, in the order of their labels; anything else is «Eigener Wert». */
export const IMAGE_STYLE_PRESETS: Record<PresetField, readonly string[]> = {
  width: ['100%', '50%', '300px'],
  border: ['none', '1px solid', '2px solid'],
  borderRadius: ['0', '4px', '8px'],
};

/** Stored values that mean the same as a preset: no frame was also written as '' or '0', square corners as '0px'. */
const SYNONYMS: Record<PresetField, Record<string, string>> = {
  width: {},
  // a legacy '1px' (no line style) draws no frame either
  border: { '': 'none', '0': 'none', '0px': 'none', '1px': 'none' },
  borderRadius: { '': '0', '0px': '0' },
};

/** The preset a stored value matches, else CUSTOM. A plain number counts as px, as the renderer reads it ('4' is '4px'). */
export function presetChoice(field: PresetField, value: string): string {
  const trimmed = value.trim();
  const withUnit = field !== 'border' && /^\d+(\.\d+)?$/.test(trimmed) && trimmed !== '0' ? `${trimmed}px` : trimmed;
  const normal = SYNONYMS[field][withUnit] ?? withUnit;
  return IMAGE_STYLE_PRESETS[field].includes(normal) ? normal : CUSTOM;
}
