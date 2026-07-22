/**
 * The declarative grid a board instrument renders. A grid instrument (SWOT / PESTEL / BMC /
 * Eisenhower) is *data*, not markup — swap the `GridDefinition` and the same renderer draws a
 * different instrument. This is the primitive's core abstraction (spec §2.24 D2).
 */

/**
 * One cell of the grid. `colStart`/`rowStart` are 1-based CSS grid lines; `colSpan`/`rowSpan` map
 * directly to `grid-column: {colStart} / span {colSpan}`. Spanning is mandatory, not optional — the
 * Business Model Canvas (2.24.4) has a full-width bottom row under seven single-cell blocks, so a
 * grid engine without spanning cannot render it.
 */
export interface GridCell {
  id: string;          // stable cell key; persisted on each topic (InstrumentTopic.cell === cell.id)
  labelKey: string;    // i18n key (@instruments.*), resolved by the consumer via the store pattern
  colStart: number;    // 1-based CSS grid column line
  colSpan: number;
  rowStart: number;    // 1-based CSS grid row line
  rowSpan: number;
  color?: string;      // cell accent tint; falsy = --ion-color-medium (as the Kanban board does)
  icon?: string;       // optional svgIcon name
}

export interface GridDefinition {
  cols: number;        // total columns the cells are laid out over
  rows: number;        // total rows
  cells: GridCell[];
}
