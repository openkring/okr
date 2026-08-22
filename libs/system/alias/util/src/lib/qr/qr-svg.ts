import { encodeQr, QrEcc } from './qr-encoder';

export interface QrSvgOptions {
  ecc?: QrEcc;
  /** Kantenlänge eines Moduls in SVG-Einheiten. Die Grafik skaliert ohnehin über viewBox. */
  moduleSize?: number;
  /** Ruhezone in Modulen. Die Norm verlangt 4; weniger macht den Code für Scanner unsicher. */
  margin?: number;
  dark?: string;
  light?: string;
}

/**
 * Den QR-Code als eigenständiges SVG rendern.
 *
 * Alle dunklen Module landen in EINEM <path>, nicht in tausend <rect>: ein Code der Version 5 hat
 * über 1'200 dunkle Module, und ein Rechteck pro Modul bläht Markup wie Renderzeit unnötig auf.
 */
export function renderQrSvg(text: string, options: QrSvgOptions = {}): string {
  const { ecc = 'M', moduleSize = 1, margin = 4, dark = '#000000', light = '#ffffff' } = options;
  const { size, modules } = encodeQr(text, ecc);
  const extent = (size + margin * 2) * moduleSize;

  const parts: string[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (modules[y][x]) {
        parts.push(
          `M${(x + margin) * moduleSize} ${(y + margin) * moduleSize}h${moduleSize}v${moduleSize}h-${moduleSize}z`,
        );
      }
    }
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${extent} ${extent}" shape-rendering="crispEdges">` +
    `<rect width="${extent}" height="${extent}" fill="${light}"/>` +
    `<path d="${parts.join('')}" fill="${dark}"/>` +
    `</svg>`
  );
}
