// The brand colour rules shared by the calendar mails and the Versand mail templates.

export const DEFAULT_BRAND_COLOR = '#1f6feb';
const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** A safe '#rrggbb' for a style attribute. */
export function brandColorOf(value: string | undefined): string {
  const color = (value ?? '').trim();
  if (!HEX_COLOR.test(color)) return DEFAULT_BRAND_COLOR;
  return color.length === 4 ? `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}` : color.toLowerCase();
}

/**
 * White text where it stays readable on the brand colour (contrast ≥ 3:1, enough for the bold
 * banner and button text), dark text otherwise — e.g. a light green brand gets dark text.
 */
export function textColorOn(background: string): string {
  const hex = brandColorOf(background);
  const channel = (i: number): number => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
  return 1.05 / (luminance + 0.05) >= 3 ? '#ffffff' : '#1f2328';
}

/** `color` mixed with white: `share` of the colour (0…1), the rest white. For the hover tint. */
export function tintOf(color: string, share: number): string {
  const hex = brandColorOf(color);
  const mix = (i: number): string => {
    const c = parseInt(hex.slice(i, i + 2), 16);
    return Math.round(255 - (255 - c) * share).toString(16).padStart(2, '0');
  };
  return `#${mix(1)}${mix(3)}${mix(5)}`;
}

/** A safe '#rrggbb' (lowercased) for a style attribute of a Versand mail; anything else is the dark grey `#222222`. */
export function mailColorOf(brandColor: unknown): string {
  return typeof brandColor === 'string' && /^#[0-9a-f]{6}$/i.test(brandColor) ? brandColor.toLowerCase() : '#222222';
}
