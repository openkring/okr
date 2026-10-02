import type Decimal from 'decimal.js';

import { Dec } from './calculator-decimal';

export type UnitCategoryId = 'length' | 'area' | 'volume' | 'mass' | 'temperature' | 'time' | 'speed' | 'data';

/** `value_in_base = value × factor ÷ divisor`. Temperature has no factor (affine, see below). */
export interface UnitDef {
  readonly id: string;
  readonly symbol: string;
  readonly factor?: string;
  readonly divisor?: string;
}

export interface UnitCategory {
  readonly id: UnitCategoryId;
  readonly units: readonly UnitDef[];
  readonly defaultFrom: string;
  readonly defaultTo: string;
}

const u = (id: string, symbol: string, factor?: string, divisor?: string): UnitDef =>
  ({ id, symbol, ...(factor ? { factor } : {}), ...(divisor ? { divisor } : {}) });

export const UNIT_CATEGORIES: readonly UnitCategory[] = [
  {
    id: 'length', defaultFrom: 'km', defaultTo: 'mi', units: [
      u('m', 'm', '1'), u('mm', 'mm', '0.001'), u('cm', 'cm', '0.01'), u('km', 'km', '1000'),
      u('in', 'in', '0.0254'), u('ft', 'ft', '0.3048'), u('yd', 'yd', '0.9144'),
      u('mi', 'mi', '1609.344'), u('nmi', 'NM', '1852'),
    ],
  },
  {
    id: 'area', defaultFrom: 'm2', defaultTo: 'ft2', units: [
      u('m2', 'm²', '1'), u('mm2', 'mm²', '0.000001'), u('cm2', 'cm²', '0.0001'), u('a', 'a', '100'),
      u('ha', 'ha', '10000'), u('km2', 'km²', '1000000'), u('in2', 'in²', '0.00064516'),
      u('ft2', 'ft²', '0.09290304'), u('yd2', 'yd²', '0.83612736'), u('ac', 'ac', '4046.8564224'),
      u('mi2', 'mi²', '2589988.110336'),
    ],
  },
  {
    id: 'volume', defaultFrom: 'l', defaultTo: 'gal', units: [
      u('m3', 'm³', '1'), u('ml', 'ml', '0.000001'), u('cl', 'cl', '0.00001'), u('dl', 'dl', '0.0001'),
      u('l', 'l', '0.001'), u('tsp', 'tsp', '0.00000492892159375'), u('tbsp', 'tbsp', '0.00001478676478125'),
      u('floz', 'fl oz', '0.0000295735295625'), u('cup', 'cup', '0.0002365882365'),
      u('pt', 'pt', '0.000473176473'), u('qt', 'qt', '0.000946352946'), u('gal', 'gal', '0.003785411784'),
      u('galuk', 'gal (UK)', '0.00454609'),
    ],
  },
  {
    id: 'mass', defaultFrom: 'kg', defaultTo: 'lb', units: [
      u('kg', 'kg', '1'), u('mg', 'mg', '0.000001'), u('g', 'g', '0.001'), u('t', 't', '1000'),
      u('oz', 'oz', '0.028349523125'), u('lb', 'lb', '0.45359237'), u('st', 'st', '6.35029318'),
    ],
  },
  {
    id: 'temperature', defaultFrom: 'C', defaultTo: 'F', units: [
      u('K', 'K'), u('C', '°C'), u('F', '°F'),
    ],
  },
  {
    id: 'time', defaultFrom: 'h', defaultTo: 'min', units: [
      u('s', 's', '1'), u('ms', 'ms', '0.001'), u('min', 'min', '60'), u('h', 'h', '3600'),
      u('d', 'd', '86400'), u('wk', 'wk', '604800'), u('yr', 'yr', '31536000'),
    ],
  },
  {
    id: 'speed', defaultFrom: 'kmh', defaultTo: 'mph', units: [
      u('mps', 'm/s', '1'), u('kmh', 'km/h', '1000', '3600'), u('mph', 'mph', '1609.344', '3600'),
      u('kn', 'kn', '1852', '3600'), u('fps', 'ft/s', '0.3048'),
    ],
  },
  {
    id: 'data', defaultFrom: 'MB', defaultTo: 'MiB', units: [
      u('B', 'B', '1'), u('bit', 'bit', '0.125'), u('kB', 'kB', '1000'), u('MB', 'MB', '1000000'),
      u('GB', 'GB', '1000000000'), u('TB', 'TB', '1000000000000'), u('KiB', 'KiB', '1024'),
      u('MiB', 'MiB', '1048576'), u('GiB', 'GiB', '1073741824'), u('TiB', 'TiB', '1099511627776'),
    ],
  },
];

export function findCategory(id: UnitCategoryId): UnitCategory {
  return UNIT_CATEGORIES.find(c => c.id === id) ?? UNIT_CATEGORIES[0];
}

export function findUnit(categoryId: UnitCategoryId, unitId: string): UnitDef {
  const unit = findCategory(categoryId).units.find(x => x.id === unitId);
  if (!unit) throw new Error(`Unknown unit ${categoryId}.${unitId}`);
  return unit;
}

function toKelvin(unitId: string, v: Decimal): Decimal {
  if (unitId === 'C') return v.add('273.15');
  if (unitId === 'F') return v.sub(32).mul(5).div(9).add('273.15');
  return v;
}

function fromKelvin(unitId: string, k: Decimal): Decimal {
  if (unitId === 'C') return k.sub('273.15');
  if (unitId === 'F') return k.sub('273.15').mul(9).div(5).add(32);
  return k;
}

export function convertUnit(categoryId: UnitCategoryId, fromId: string, toId: string, value: Decimal): Decimal {
  const from = findUnit(categoryId, fromId);
  const to = findUnit(categoryId, toId);
  if (categoryId === 'temperature') return fromKelvin(to.id, toKelvin(from.id, value));
  return new Dec(value)
    .mul(from.factor ?? '1').div(from.divisor ?? '1')
    .mul(to.divisor ?? '1').div(to.factor ?? '1');
}
