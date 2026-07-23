import { InstrumentType } from '@okr/shared-models';
import { GridDefinition } from './grid.model';

/**
 * The canonical grid definitions the primitive ships with, one per `InstrumentType`. Each is a pure
 * layout of cells; `labelKey`s are i18n keys resolved by the consumer feature (D6). When a consumer
 * feature is built it may import these directly or supply its own definition (e.g. a Lean Canvas
 * over the same BMC engine).
 *
 * Cell colours are left unset here — a tenant's theme / consumer decides quadrant tints.
 */

/** SWOT — 2×2, internal↔external rows, helpful↔harmful columns. */
export const SWOT_GRID: GridDefinition = {
  cols: 2,
  rows: 2,
  cells: [
    { id: 'strengths',     labelKey: '@instruments/feature.cell.strengths',     colStart: 1, colSpan: 1, rowStart: 1, rowSpan: 1 },
    { id: 'weaknesses',    labelKey: '@instruments/feature.cell.weaknesses',    colStart: 2, colSpan: 1, rowStart: 1, rowSpan: 1 },
    { id: 'opportunities', labelKey: '@instruments/feature.cell.opportunities', colStart: 1, colSpan: 1, rowStart: 2, rowSpan: 1 },
    { id: 'threats',       labelKey: '@instruments/feature.cell.threats',       colStart: 2, colSpan: 1, rowStart: 2, rowSpan: 1 },
  ],
};

/** Eisenhower — 2×2, urgency (columns: urgent↔not) × importance (rows: important↔not). */
export const EISENHOWER_GRID: GridDefinition = {
  cols: 2,
  rows: 2,
  cells: [
    { id: 'do',       labelKey: '@instruments/feature.cell.do',       colStart: 1, colSpan: 1, rowStart: 1, rowSpan: 1 },
    { id: 'schedule', labelKey: '@instruments/feature.cell.schedule', colStart: 2, colSpan: 1, rowStart: 1, rowSpan: 1 },
    { id: 'delegate', labelKey: '@instruments/feature.cell.delegate', colStart: 1, colSpan: 1, rowStart: 2, rowSpan: 1 },
    { id: 'delete',   labelKey: '@instruments/feature.cell.delete',   colStart: 2, colSpan: 1, rowStart: 2, rowSpan: 1 },
  ],
};

/** PESTEL — six factors laid out 3×2. */
export const PESTEL_GRID: GridDefinition = {
  cols: 3,
  rows: 2,
  cells: [
    { id: 'political',      labelKey: '@instruments/feature.cell.political',      colStart: 1, colSpan: 1, rowStart: 1, rowSpan: 1 },
    { id: 'economic',       labelKey: '@instruments/feature.cell.economic',       colStart: 2, colSpan: 1, rowStart: 1, rowSpan: 1 },
    { id: 'social',         labelKey: '@instruments/feature.cell.social',         colStart: 3, colSpan: 1, rowStart: 1, rowSpan: 1 },
    { id: 'technological',  labelKey: '@instruments/feature.cell.technological',  colStart: 1, colSpan: 1, rowStart: 2, rowSpan: 1 },
    { id: 'environmental',  labelKey: '@instruments/feature.cell.environmental',  colStart: 2, colSpan: 1, rowStart: 2, rowSpan: 1 },
    { id: 'legal',          labelKey: '@instruments/feature.cell.legal',          colStart: 3, colSpan: 1, rowStart: 2, rowSpan: 1 },
  ],
};

/**
 * Business Model Canvas — the canonical asymmetric Osterwalder layout, the spanning stress test.
 * Laid out over a 10-column × 3-row grid: seven single blocks in the top two rows (some spanning
 * two rows), and Cost Structure / Revenue Streams spanning the full-width bottom row.
 */
export const BMC_GRID: GridDefinition = {
  cols: 10,
  rows: 3,
  cells: [
    { id: 'keyPartners',          labelKey: '@instruments/feature.cell.keyPartners',          colStart: 1, colSpan: 2, rowStart: 1, rowSpan: 2 },
    { id: 'keyActivities',        labelKey: '@instruments/feature.cell.keyActivities',        colStart: 3, colSpan: 2, rowStart: 1, rowSpan: 1 },
    { id: 'keyResources',         labelKey: '@instruments/feature.cell.keyResources',         colStart: 3, colSpan: 2, rowStart: 2, rowSpan: 1 },
    { id: 'valuePropositions',    labelKey: '@instruments/feature.cell.valuePropositions',    colStart: 5, colSpan: 2, rowStart: 1, rowSpan: 2 },
    { id: 'customerRelationships',labelKey: '@instruments/feature.cell.customerRelationships',colStart: 7, colSpan: 2, rowStart: 1, rowSpan: 1 },
    { id: 'channels',             labelKey: '@instruments/feature.cell.channels',             colStart: 7, colSpan: 2, rowStart: 2, rowSpan: 1 },
    { id: 'customerSegments',     labelKey: '@instruments/feature.cell.customerSegments',     colStart: 9, colSpan: 2, rowStart: 1, rowSpan: 2 },
    { id: 'costStructure',        labelKey: '@instruments/feature.cell.costStructure',        colStart: 1, colSpan: 5, rowStart: 3, rowSpan: 1 },
    { id: 'revenueStreams',       labelKey: '@instruments/feature.cell.revenueStreams',       colStart: 6, colSpan: 5, rowStart: 3, rowSpan: 1 },
  ],
};

/** Lookup by instrument type — the renderer picks the grid from `instrument.type` (spec §2.24 D3). */
export const GRID_DEFINITIONS: Record<InstrumentType, GridDefinition> = {
  swot: SWOT_GRID,
  pestel: PESTEL_GRID,
  bmc: BMC_GRID,
  eisenhower: EISENHOWER_GRID,
};

export function gridDefinitionFor(type: InstrumentType): GridDefinition {
  return GRID_DEFINITIONS[type];
}
