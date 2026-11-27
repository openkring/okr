import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, input, output, TemplateRef } from '@angular/core';

import { TableConfig, TableStyle } from '@okr/shared-models';
import { effectiveTableMode, fluidTemplateOf, TableCellRef, tableContentOf, tableResponsiveOf } from '@okr/cms-section-util';

/** what a cell template gets: the stored HTML, where the cell is, and its column title (stacked layout) */
export interface TableCellContext { $implicit: string; ref: TableCellRef; label: string }

type CellStyle = Record<string, string>;

/**
 * The stored style as CSS, with the defaults the table has always drawn: only a missing value takes the default, an empty one ('')
 * draws none (as before; many stored tables rely on it). A column's alignment wins over the style's.
 */
function cellStyle(style: Partial<TableStyle> | undefined, defaults: Required<TableStyle>, align: string | undefined): CellStyle {
  const value = (key: keyof TableStyle): string => style?.[key] ?? defaults[key];
  return {
    'background-color': value('backgroundColor'),
    'text-align': align || value('textAlign'),
    'font-size': value('fontSize'),
    'font-weight': value('fontWeight'),
    'padding': value('padding'),
    'color': value('textColor'),
    'border': value('border'),
  };
}

const HEADER_DEFAULTS: Required<TableStyle> = {
  backgroundColor: 'var(--ion-color-step-150)', textAlign: 'center', fontSize: '1rem', fontWeight: 'bold', padding: '5px',
  textColor: 'var(--ion-text-color)', border: '0.5px solid var(--ion-color-medium)',
};
const BODY_DEFAULTS: Required<TableStyle> = {
  backgroundColor: 'transparent', textAlign: 'left', fontSize: '0.8rem', fontWeight: 'normal', padding: '5px',
  textColor: 'var(--ion-text-color)', border: '0.5px solid var(--ion-color-medium)',
};

/**
 * Draws a table section's table: the readers' view, and the canvas of the table editor (with a cell template). The columns are
 * flexible (fixed widths shrink to a minimum), long words wrap. Below the breakpoint of its container (not of the screen: a section
 * may stand in a narrow column) it stacks the rows into blocks or scrolls sideways with the first column pinned (`responsive`).
 */
@Component({
  selector: 'okr-table-view',
  standalone: true,
  imports: [NgTemplateOutlet],
  styles: [`
    :host { display: block; }
    .wrap { container-type: inline-size; }
    .table { display: grid; margin: 10px; }
    .row { display: contents; }
    .cell { min-width: 0; overflow-wrap: anywhere; user-select: text; -webkit-user-select: text; }
    .cell.span { grid-column: 1 / -1; }
    .cell.clickable { cursor: text; }
    .cell.clickable:hover { box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ion-color-primary) 40%, transparent); }
    .cell.selected { box-shadow: inset 0 0 0 2px var(--ion-color-primary); }
    .label { display: none; font-size: 0.75em; font-weight: 600; color: var(--ion-color-medium); }

    /* stack: one block per row, each cell with its column title; without a header: the label above the value */
    @container (width < 480px) {
      .bp-mobile.stack .table { grid-template-columns: minmax(0, 1fr) !important; }
      .bp-mobile.stack .row.head { display: none; }
      .bp-mobile.stack.labelled .label { display: block; }
      .bp-mobile.stack .cell.first { margin-top: 8px; }
      .bp-mobile.stack.plain .cell.first { font-weight: 600 !important; }
      .bp-mobile.scroll { overflow-x: auto; }
      .bp-mobile.scroll .table { width: max-content; min-width: calc(100% - 20px); }
      .bp-mobile.scroll .cell { max-width: 60vw; }
      .bp-mobile.scroll .cell.col-0 { position: sticky; inset-inline-start: 0; z-index: 1; background: var(--ion-background-color, #fff); }
    }
    @container (width < 768px) {
      .bp-tablet.stack .table { grid-template-columns: minmax(0, 1fr) !important; }
      .bp-tablet.stack .row.head { display: none; }
      .bp-tablet.stack.labelled .label { display: block; }
      .bp-tablet.stack .cell.first { margin-top: 8px; }
      .bp-tablet.stack.plain .cell.first { font-weight: 600 !important; }
      .bp-tablet.scroll { overflow-x: auto; }
      .bp-tablet.scroll .table { width: max-content; min-width: calc(100% - 20px); }
      .bp-tablet.scroll .cell { max-width: 60vw; }
      .bp-tablet.scroll .cell.col-0 { position: sticky; inset-inline-start: 0; z-index: 1; background: var(--ion-background-color, #fff); }
    }
  `],
  template: `
    <div [class]="wrapClass()">
      <div class="table" role="table" [attr.aria-label]="title() || null" [style.grid-template-columns]="template()">
        @if (title() && showTitleAs() === 'header') {
          <div class="row" role="row"><div class="cell span" role="columnheader" [style]="headerStyles()[0]">{{ title() }}</div></div>
        }
        @if (content().hasHeader) {
          <div class="row head" role="row">
            @for (cell of content().header; track $index; let c = $index) {
              <div class="cell" role="columnheader" [style]="headerStyles()[c]" [class.clickable]="!!cellTemplate()" [class.selected]="isSelected(-1, c)" (click)="cellClick.emit({ row: -1, col: c })">
                @if (cellTemplate(); as tpl) { <ng-container *ngTemplateOutlet="tpl; context: context(cell, -1, c)" /> } @else { <span [innerHTML]="cell"></span> }
              </div>
            }
          </div>
        }
        @for (cells of content().rows; track $index; let r = $index) {
          <div class="row" role="row">
            @for (cell of cells; track $index; let c = $index) {
              <div [class]="'cell col-' + c" [class.first]="c === 0" role="cell" [style]="bodyStyles()[c]" [class.clickable]="!!cellTemplate()" [class.selected]="isSelected(r, c)" (click)="cellClick.emit({ row: r, col: c })">
                @if (labelled()) { <span class="label" aria-hidden="true">{{ content().header[c] }}</span> }
                @if (cellTemplate(); as tpl) { <ng-container *ngTemplateOutlet="tpl; context: context(cell, r, c)" /> } @else { <div [innerHTML]="cell"></div> }
              </div>
            }
          </div>
        }
      </div>
    </div>
  `,
})
export class TableView {
  // inputs
  public readonly config = input.required<TableConfig>();
  /** shown as a row above the header when showTitleAs is 'header' */
  public readonly title = input<string | undefined>('');
  /** the editor draws its cells (in-place editing); readers get the stored HTML */
  public readonly cellTemplate = input<TemplateRef<TableCellContext> | undefined>(undefined);
  public readonly selected = input<TableCellRef | undefined>(undefined);

  // outputs
  public readonly cellClick = output<TableCellRef>();

  protected readonly content = computed(() => tableContentOf(this.config()));
  protected readonly showTitleAs = computed(() => this.config().grid?.showTitleAs ?? 'title');
  protected readonly template = computed(() => fluidTemplateOf(this.content().columns));
  /** with a header, a stacked cell shows its column title */
  protected readonly labelled = computed(() => this.content().hasHeader && this.content().header.some((h) => h.trim() !== ''));
  protected readonly wrapClass = computed(() => {
    const responsive = tableResponsiveOf(this.config());
    const mode = effectiveTableMode(responsive.mode, this.content().columns.length);
    return `wrap bp-${responsive.breakpoint} ${mode}${this.labelled() ? ' labelled' : ' plain'}`;
  });
  protected readonly headerStyles = computed(() => this.content().columns.map((c) => cellStyle(this.config().header, HEADER_DEFAULTS, c.align)));
  protected readonly bodyStyles = computed(() => this.content().columns.map((c) => cellStyle(this.config().body, BODY_DEFAULTS, c.align)));

  protected isSelected(row: number, col: number): boolean {
    const selected = this.selected();
    return !!selected && selected.row === row && selected.col === col;
  }

  protected context(cell: string, row: number, col: number): TableCellContext {
    return { $implicit: cell, ref: { row, col }, label: this.content().header[col] ?? '' };
  }
}
