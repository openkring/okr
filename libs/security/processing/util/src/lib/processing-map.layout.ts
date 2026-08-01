import type { ProcessorEntry } from '@okr/shared-models';

/**
 * Geometry for the processing map — the app in the centre, every active processor on a
 * ring around it, each edge labelled with the data classes that travel along it.
 *
 * Pure and framework-free on purpose: the geometry is the part that can be wrong, so it
 * is the part that is tested. The component (`ProcessingMap`, in the `ui` lib) only turns
 * this into `<svg>` elements. No charting dependency — repo rule.
 */

/** Node box size in user units. The component uses the same constants. */
export const NODE_WIDTH = 132;
export const NODE_HEIGHT = 44;

/** How the register colours a processor: domestic, EEA, or third country. */
export type CountryGroup = 'ch' | 'eu' | 'third';

/**
 * EEA + the adequacy-decision area, coarse but sufficient for a fill colour. Anything not
 * listed is a third country, which is the honest default: a country we forgot to classify
 * should draw the eye, not blend into the safe group.
 */
const EEA = new Set([
  'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'HU',
  'IE', 'IS', 'IT', 'LI', 'LT', 'LU', 'LV', 'MT', 'NL', 'NO', 'PL', 'PT', 'RO', 'SE',
  'SI', 'SK',
]);

export function countryGroupOf(country: string): CountryGroup {
  if (country === 'CH') return 'ch';
  return EEA.has(country) ? 'eu' : 'third';
}

export interface MapNode {
  readonly key: string;
  readonly name: string;
  readonly country: string;
  readonly group: CountryGroup;
  /** Top-left of the node box, clamped into the viewport. */
  readonly x: number;
  readonly y: number;
  /** Centre of the node box — where its edge terminates. */
  readonly cx: number;
  readonly cy: number;
  readonly angleDeg: number;
}

export interface MapEdge {
  readonly key: string;
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  /** The data classes travelling to this processor, comma-separated. */
  readonly label: string;
  readonly group: CountryGroup;
}

export interface MapLayout {
  readonly centre: { x: number; y: number };
  readonly nodes: MapNode[];
  readonly edges: MapEdge[];
  readonly width: number;
  readonly height: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/**
 * Radial placement: `angle = i * 360 / n`, radius 40% of the smaller dimension, every box
 * clamped so it stays fully inside the viewport.
 *
 * The clamp is what makes a crowded or narrow viewport degrade into overlap rather than
 * into processors drawn off-screen — an entry missing from the diagram would read as "we
 * do not send data there", which is exactly the false statement this screen exists to
 * prevent.
 */
export function layoutProcessingMap(
  entries: readonly ProcessorEntry[],
  width: number,
  height: number,
): MapLayout {
  const centre = { x: width / 2, y: height / 2 };
  if (entries.length === 0) return { centre, nodes: [], edges: [], width, height };

  const radius = Math.min(width, height) * 0.4;
  const maxX = Math.max(0, width - NODE_WIDTH);
  const maxY = Math.max(0, height - NODE_HEIGHT);

  const nodes = entries.map((entry, index): MapNode => {
    const angleDeg = (index * 360) / entries.length;
    const radians = (angleDeg * Math.PI) / 180;
    // -90° so the first node sits at the top; the reported angleDeg stays 0-based.
    const x = clamp(centre.x + radius * Math.sin(radians) - NODE_WIDTH / 2, 0, maxX);
    const y = clamp(centre.y - radius * Math.cos(radians) - NODE_HEIGHT / 2, 0, maxY);
    return {
      key: entry.key,
      name: entry.name,
      country: entry.country,
      group: countryGroupOf(entry.country),
      x, y,
      cx: x + NODE_WIDTH / 2,
      cy: y + NODE_HEIGHT / 2,
      angleDeg,
    };
  });

  const edges = nodes.map((node, index): MapEdge => ({
    key: node.key,
    x1: centre.x,
    y1: centre.y,
    x2: node.cx,
    y2: node.cy,
    label: entries[index].dataClasses.join(', '),
    group: node.group,
  }));

  return { centre, nodes, edges, width, height };
}
