import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, effect, ElementRef, inject, input, model, output, signal, untracked, viewChild, ViewContainerRef } from '@angular/core';
import { IonButton, IonCard, IonCardContent, IonIcon, IonLabel, IonNote, IonSegment, IonSegmentButton } from '@ionic/angular';

import { ArticleHeaderEdit, historyKey, type ArticleHeaderChange } from '@okr/cms-article-feature';
import { SECTION_PANEL_FIELDS, SectionPanel, TablePanel, TableView } from '@okr/cms-section-ui';
import {
  ARTICLE_EDITOR_I18N_KEYS, createHistory, deleteTableColumn, deleteTableRow, getFieldErrors, insertTableColumn, insertTableRow, isClipboardTable,
  moveTableRow, parseClipboardTable, pasteTableCells, record, redo, restErrors, SECTION_I18N_KEYS, setTableCell, TABLE_EDITOR_I18N_KEYS,
  tableContentOf, tableSectionValidations, undo, withTableContent, type ArticlePreviewDevice, type EditorHistory, type SectionErrors, type TableCellRef,
  type TableContent, type TableEditorI18n,
} from '@okr/cms-section-util';
import { I18nService } from '@okr/shared-i18n';
import { CategoryListModel, SectionModel, TABLE_CONFIG_SHAPE, TableConfig, TableSection, UserModel } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { ErrorNote } from '@okr/shared-ui';
import { RichTextInline, type RichTextFeature } from '@okr/shared-ui-editor';
import { fill } from '@okr/shared-util-core';

type Selection = 'section' | 'table';
type Device = Exclude<ArticlePreviewDevice, 'auto'>;
const DEVICES: readonly Device[] = ['mobile', 'tablet', 'desktop'];
const DEVICE_WIDTHS: Record<Device, string> = { mobile: '390px', tablet: '768px', desktop: '100%' };
/** a cell is a short text: no headings' history, colours, alignment (the column has it), indent or images */
const HIDDEN_FEATURES: readonly RichTextFeature[] = ['history', 'colors', 'align', 'indent', 'image'];
/** the error names the table panel or the canvas shows */
const TABLE_FIELDS = ['data.', 'grid.', 'columns', 'responsive.', 'header.', 'body.'];

/** the stored table with every part there: older documents may lack grid, header or body */
function tableConfigOf(config: Partial<TableConfig> | undefined): TableConfig {
  return {
    ...TABLE_CONFIG_SHAPE, ...(config ?? {}),
    data: { header: config?.data?.header ?? [], body: config?.data?.body ?? [] },
    grid: { ...TABLE_CONFIG_SHAPE.grid, ...(config?.grid ?? {}) },
    header: { ...(config?.header ?? TABLE_CONFIG_SHAPE.header) },
    body: { ...(config?.body ?? TABLE_CONFIG_SHAPE.body) },
  };
}

/**
 * The graphical editor of a table section, as the button editor is one of a button: a toolbar (devices, undo, redo, the text tools
 * of the cell, «Aus Excel einfügen»), the table as readers see it (`okr-table-view`, so the phone preview shows it stacked or
 * scrolling), and a panel. Title, subtitle and intro are typed in place, each cell too (`okr-rich-text-inline`, one at a time). A
 * selected cell shows the row and column tools. Cells copied from Excel, Numbers or Google Sheets are pasted from the chosen cell
 * on, adding rows and columns as needed. The panel shows the table's settings (`okr-table-panel`) or the section's own
 * (`okr-section-config part="appearance"`), tags and notes.
 *
 * It edits `formData` of `SectionEditModal`, which saves (change confirmation) as for every other section. The undo history is its own.
 */
@Component({
  selector: 'okr-table-editor',
  standalone: true,
  imports: [
    ArticleHeaderEdit, ErrorNote, RichTextInline, SectionPanel, NgTemplateOutlet, SvgIconPipe, TablePanel, TableView,
    IonButton, IonCard, IonCardContent, IonIcon, IonLabel, IonNote, IonSegment, IonSegmentButton,
  ],
  host: { '(document:keydown)': 'onKeydown($event)' },
  styles: [`
    :host { display: flex; flex-direction: column; height: 100%; }
    .bar { flex: none; display: flex; align-items: center; gap: 8px; height: 48px; padding: 0 8px; border-bottom: 1px solid var(--ion-color-light-shade); }
    .bar ion-segment { flex: none; width: 300px; min-height: 36px; }
    .bar ion-segment-button { min-height: 34px; min-width: 0; --padding-start: 4px; --padding-end: 4px; }
    .bar ion-button { flex: none; margin: 0; }
    .text-tools { flex: 1; min-width: 0; overflow-x: auto; }
    .text-tools ::ng-deep .rte-toolbar { border-bottom: 0; }
    .work { flex: 1; min-height: 0; display: flex; }
    .canvas { flex: 1; min-width: 0; overflow: auto; padding: 16px; background: var(--ion-color-light); }
    .page { margin: 0 auto; transition: max-width 0.2s ease; }
    .page ion-card { margin: 0; }
    .table-area { border-radius: 4px; outline: 1px dashed transparent; outline-offset: 2px; }
    .table-area:hover { outline-color: color-mix(in srgb, var(--ion-color-primary) 40%, transparent); }
    .table-area.selected { outline: 2px solid var(--ion-color-primary); }
    .cell-text { min-height: 1.4em; }
    .cell-text .placeholder { opacity: 0.45; }
    .cell-text ::ng-deep p { margin: 0; }
    .tools { display: flex; flex-wrap: wrap; align-items: center; gap: 2px; margin: 0 10px 4px; font-size: 0.8rem; color: var(--ion-color-medium); }
    .tools .where { margin-inline-end: 6px; }
    .tools .sep { width: 1px; height: 20px; margin: 0 4px; background: var(--ion-color-light-shade); }
    .tools ion-button { margin: 0; --padding-start: 6px; --padding-end: 6px; }
    .add-row { margin: 4px 10px 0; }
    .hint { display: block; margin: 12px 4px 0; font-size: 0.85rem; }
    .panel { flex: none; width: 360px; overflow: auto; overscroll-behavior: contain; padding-bottom: 24px; border-inline-start: 1px solid var(--ion-color-light-shade); background: var(--ion-background-color, #fff); }
    .panel-head { display: flex; align-items: center; gap: 4px; padding: 12px 16px 0; }
    .panel-head h2 { flex: 1; margin: 0; font-size: 1.1rem; font-weight: 600; }
    .rest { padding: 0 16px; }
    @media (width < 1024px) {
      .work { flex-direction: column; }
      .canvas { flex: 1 1 0; }
      .panel { flex: 0 1 auto; width: auto; max-height: 45%; border-inline-start: 0; border-top: 1px solid var(--ion-color-light-shade); }
      .bar ion-segment { display: none; }
    }
  `],
  template: `
    @let t = i18n;
    <div class="bar">
      <ion-segment [value]="device()" [attr.aria-label]="t.article_editor_device_label()" (ionChange)="chooseDevice($event.detail.value)">
        @for (name of devices; track name) { <ion-segment-button [value]="name"><ion-label>{{ deviceLabels()[name] }}</ion-label></ion-segment-button> }
      </ion-segment>
      <ion-button fill="clear" size="small" [disabled]="history().past.length === 0" [title]="t.article_editor_undo()" [attr.aria-label]="t.article_editor_undo()" (click)="step('undo')">
        <ion-icon slot="icon-only" src="{{ 'undo' | svgIcon }}" aria-hidden="true" />
      </ion-button>
      <ion-button fill="clear" size="small" [disabled]="history().future.length === 0" [title]="t.article_editor_redo()" [attr.aria-label]="t.article_editor_redo()" (click)="step('redo')">
        <ion-icon slot="icon-only" src="{{ 'redo' | svgIcon }}" aria-hidden="true" />
      </ion-button>
      <div class="text-tools" role="group" [attr.aria-label]="t.article_editor_textTools()"><ng-container #textTools /></div>
      <ion-button fill="clear" size="small" [title]="t.table_editor_paste_button()" [attr.aria-label]="t.table_editor_paste_button()" (click)="pasteFromClipboard()">
        <ion-icon slot="icon-only" src="{{ 'copy' | svgIcon }}" aria-hidden="true" />
      </ion-button>
    </div>
    <div class="work">
      <div class="canvas" #canvas>
        <div class="page" [style.max-width]="deviceWidth()">
          <ion-card>
            <okr-article-header-edit [title]="section().title ?? ''" [subTitle]="section().subTitle ?? ''" [intro]="section().intro ?? ''" [introPosition]="section().introPosition ?? 'below'"
              [titlePlaceholder]="t.article_editor_canvas_titlePlaceholder()" [subTitlePlaceholder]="t.article_editor_canvas_subTitlePlaceholder()"
              [introPlaceholder]="t.article_editor_canvas_introPlaceholder()" (headerChange)="onHeaderChange($event)" />
            <ion-card-content>
              <div class="table-area" [class.selected]="selected() === 'table'">
                @if (cell(); as at) {
                  <div class="tools" role="toolbar" [attr.aria-label]="t.table_editor_panel_table()">
                    <span class="where">{{ cellName(at) }}</span>
                    @if (at.row >= 0) {
                      <ion-button fill="clear" size="small" [title]="t.table_editor_row_moveUp()" [attr.aria-label]="t.table_editor_row_moveUp()" [disabled]="at.row === 0" (click)="moveRow(at.row, -1)">
                        <ion-icon slot="icon-only" src="{{ 'arrow-up' | svgIcon }}" aria-hidden="true" />
                      </ion-button>
                      <ion-button fill="clear" size="small" [title]="t.table_editor_row_moveDown()" [attr.aria-label]="t.table_editor_row_moveDown()" [disabled]="at.row === content().rows.length - 1" (click)="moveRow(at.row, 1)">
                        <ion-icon slot="icon-only" src="{{ 'arrow-down' | svgIcon }}" aria-hidden="true" />
                      </ion-button>
                      <ion-button fill="clear" size="small" (click)="insertRow(at.row)">{{ t.table_editor_row_addAbove() }}</ion-button>
                    }
                    <ion-button fill="clear" size="small" (click)="insertRow(at.row + 1)">{{ t.table_editor_row_addBelow() }}</ion-button>
                    @if (at.row >= 0) {
                      <ion-button fill="clear" size="small" color="danger" [title]="t.table_editor_row_delete()" [attr.aria-label]="t.table_editor_row_delete()" (click)="deleteRow(at.row)">
                        <ion-icon slot="icon-only" src="{{ 'trash' | svgIcon }}" aria-hidden="true" />
                      </ion-button>
                    }
                    <span class="sep" aria-hidden="true"></span>
                    <ion-button fill="clear" size="small" (click)="insertColumn(at.col)">{{ t.table_editor_column_addLeft() }}</ion-button>
                    <ion-button fill="clear" size="small" (click)="insertColumn(at.col + 1)">{{ t.table_editor_column_addRight() }}</ion-button>
                    @if (content().columns.length > 1) {
                      <ion-button fill="clear" size="small" color="danger" [title]="t.table_editor_column_delete()" [attr.aria-label]="t.table_editor_column_delete()" (click)="deleteColumn(at.col)">
                        <ion-icon slot="icon-only" src="{{ 'trash' | svgIcon }}" aria-hidden="true" />
                      </ion-button>
                    }
                  </div>
                }
                @if (isEmpty()) { <ion-note class="hint">{{ t.table_editor_canvas_empty() }}</ion-note> }
                <okr-table-view [config]="config()" [title]="section().title" [cellTemplate]="cellTpl" [selected]="cell()" (cellClick)="editCell($event)" />
                <ion-button class="add-row" fill="clear" size="small" (click)="insertRow(content().rows.length)">
                  <ion-icon slot="start" src="{{ 'add' | svgIcon }}" aria-hidden="true" />{{ t.table_editor_row_add() }}
                </ion-button>
              </div>
              <okr-error-note [errors]="errorsFor('data.header')" />
              <okr-error-note [errors]="errorsFor('data.body')" />
            </ion-card-content>
          </ion-card>
          <ion-note class="hint">{{ pasteNote() || t.table_editor_canvas_hint() }}</ion-note>
        </div>
      </div>

      <ng-template #cellTpl let-html let-ref="ref">
        <div class="cell-text">
          @if (isEditing(ref)) {
            @if (!textReady()) { <div [innerHTML]="html"></div> }
            <okr-rich-text-inline [value]="html" [placeholder]="ref.row < 0 ? t.table_editor_canvas_headerPlaceholder() : t.table_editor_canvas_cellPlaceholder()"
              [hiddenFeatures]="hiddenFeatures" [toolbarHost]="toolbarHost()" (valueChange)="setCell(ref, $event)" (ready)="textReady.set(true)" (failed)="stopEditing()" />
          } @else if (hasText(html)) {
            <div [innerHTML]="html"></div>
          } @else {
            <span class="placeholder">{{ ref.row < 0 ? t.table_editor_canvas_headerPlaceholder() : t.table_editor_canvas_cellPlaceholder() }}</span>
          }
        </div>
      </ng-template>

      <div class="panel" role="region" [attr.aria-label]="t.table_editor_panel_label()">
        @if (selected() === 'table') {
          <div class="panel-head">
            <ion-button fill="clear" size="small" [title]="t.table_editor_panel_back()" [attr.aria-label]="t.table_editor_panel_back()" (click)="select('section')">
              <ion-icon slot="icon-only" src="{{ 'arrow-back' | svgIcon }}" aria-hidden="true" />
            </ion-button>
            <h2>{{ t.table_editor_panel_table() }}</h2>
          </div>
          <ng-container [ngTemplateOutlet]="restErrors" />
          <okr-table-panel [config]="config()" (configChange)="setConfig($event)" [errors]="errors()" [readOnly]="false" [i18n]="t" />
        } @else {
          <okr-section-panel [title]="t.table_editor_panel_section()" [section]="section()" (sectionChange)="setSection($event)" [(showDetails)]="sectionDetails"
            [currentUser]="currentUser()" [roles]="roles()" [states]="states()" [allTags]="allTags()" [i18n]="t" [errors]="errors()">
            <ng-container ngProjectAs="[okrPanelErrors]"><ng-container [ngTemplateOutlet]="restErrors" /></ng-container>
            <ion-button ngProjectAs="[okrPanelHead]" fill="clear" size="small" (click)="select('table')">{{ t.table_editor_canvas_select() }}</ion-button>
          </okr-section-panel>
        }
        <ng-template #restErrors>
          <!-- errors that no field of this panel shows, so that a missing save banner is never unexplained -->
          @if (rest().length > 0) {
            <div class="rest">
              <ion-note>{{ t.table_editor_panel_errors() }}</ion-note>
              @for (error of rest(); track error.field) { <okr-error-note [errors]="error.messages" /> }
            </div>
          }
        </ng-template>
      </div>
    </div>
  `,
})
export class TableEditor {
  private readonly i18nService = inject(I18nService);

  // inputs
  public readonly formData = model.required<TableSection>();
  public readonly currentUser = input<UserModel | undefined>();
  public readonly roles = input.required<CategoryListModel>();
  public readonly states = input.required<CategoryListModel>();
  public readonly allTags = input('');

  // outputs
  public readonly valid = output<boolean>();

  protected readonly i18n = this.i18nService.translateAll({ ...SECTION_I18N_KEYS, ...ARTICLE_EDITOR_I18N_KEYS, ...TABLE_EDITOR_I18N_KEYS }) as TableEditorI18n;
  protected readonly devices = DEVICES;
  protected readonly hiddenFeatures = HIDDEN_FEATURES;
  protected readonly toolbarHost = viewChild('textTools', { read: ViewContainerRef });
  private readonly canvas = viewChild<ElementRef<HTMLElement>>('canvas');

  // the section
  protected readonly section = computed(() => this.formData());
  protected readonly config = computed(() => tableConfigOf(this.section().properties));
  protected readonly content = computed(() => tableContentOf(this.config()));
  protected readonly isEmpty = computed(() => !this.content().hasHeader && this.content().rows.length === 0);

  // selection, cell editing, devices
  protected readonly selected = signal<Selection>('section');
  /** the cell being typed into */
  protected readonly cell = signal<TableCellRef | undefined>(undefined);
  protected readonly textReady = signal(false);
  protected readonly pasteNote = signal('');
  protected readonly device = signal<Device>('desktop');
  protected readonly deviceWidth = computed(() => DEVICE_WIDTHS[this.device()]);
  protected readonly deviceLabels = computed<Record<Device, string>>(() => ({
    mobile: this.i18n.article_editor_device_mobile(), tablet: this.i18n.article_editor_device_tablet(), desktop: this.i18n.article_editor_device_desktop(),
  }));

  // errors: one run of the suite for canvas and panels
  private readonly result = computed(() => tableSectionValidations(this.section()));
  protected readonly errors = computed(() => this.result().getErrors() as SectionErrors);
  /** the cells' errors stand on the canvas, whichever panel is open */
  protected readonly rest = computed(() => restErrors(this.errors(), this.selected() === 'table' ? TABLE_FIELDS : [...SECTION_PANEL_FIELDS, 'data.']));

  /** the toggle in the head of «Abschnitt»: off when the editor opens */
  protected readonly sectionDetails = signal(false);

  // undo history
  /** starts with the first value of `formData` (a model has none while the component is created) */
  protected readonly history = signal<EditorHistory<TableSection | undefined>>(createHistory<TableSection | undefined>(undefined));

  constructor() {
    effect(() => this.valid.emit(this.result().isValid()));
    // a change from outside (the modal's «Abbrechen») is a step that can be undone
    effect(() => {
      const current = this.formData();
      untracked(() => {
        const history = this.history();
        if (history.present === undefined) this.history.set(createHistory<TableSection | undefined>(current));
        else if (current !== history.present) this.history.set(record(history, current));
      });
    });
    // a paste of several cells goes into the table, before the cell's text editor takes it as text (capture phase)
    const onPaste = (event: ClipboardEvent): void => this.onPaste(event);
    effect((onCleanup) => {
      const element = this.canvas()?.nativeElement;
      if (!element) return;
      element.addEventListener('paste', onPaste, true);
      onCleanup(() => element.removeEventListener('paste', onPaste, true));
    });
  }

  /************************************** changes *********************************************** */
  /** `tag`: typing into the same field within a pause makes one step */
  private change(next: TableSection, tag?: string): void {
    this.history.update((h) => record(h, next, { tag }));
    this.formData.set(next);
  }

  private changeContent(content: TableContent, tag?: string): void {
    this.setConfig(withTableContent(this.config(), content), tag);
  }

  protected setConfig(config: TableConfig, tag = 'table'): void {
    this.change({ ...this.section(), properties: config }, tag);
  }

  protected setSection(section: SectionModel): void {
    if (section !== this.section()) this.change(section as TableSection, 'section');
  }

  protected onHeaderChange({ field, value }: ArticleHeaderChange): void {
    this.change({ ...this.section(), [field]: value }, field);
  }

  protected setCell(ref: TableCellRef, html: string): void {
    const current = ref.row < 0 ? this.content().header[ref.col] : this.content().rows[ref.row]?.[ref.col];
    if (html !== current) this.changeContent(setTableCell(this.content(), ref, html), `cell:${ref.row}:${ref.col}`);
  }

  protected insertRow(at: number): void {
    const row = Math.max(0, at);
    this.changeContent(insertTableRow(this.content(), row));
    this.editCell({ row, col: this.cell()?.col ?? 0 });
  }

  protected deleteRow(at: number): void {
    this.stopEditing();
    this.changeContent(deleteTableRow(this.content(), at));
  }

  protected moveRow(at: number, by: -1 | 1): void {
    this.changeContent(moveTableRow(this.content(), at, by));
    this.editCell({ row: at + by, col: this.cell()?.col ?? 0 });
  }

  protected insertColumn(at: number): void {
    this.changeContent(insertTableColumn(this.content(), at));
    this.editCell({ row: this.cell()?.row ?? 0, col: at });
  }

  protected deleteColumn(at: number): void {
    this.stopEditing();
    this.changeContent(deleteTableColumn(this.content(), at));
  }

  protected step(direction: 'undo' | 'redo'): void {
    const next = direction === 'undo' ? undo(this.history()) : redo(this.history());
    if (next === this.history() || next.present === undefined) return;
    this.stopEditing();
    this.history.set(next);
    this.formData.set(next.present);
  }

  /************************************** paste *********************************************** */
  /** the cell a paste starts from: the chosen one, else the first of the table */
  private pasteTarget(): TableCellRef {
    return this.cell() ?? { row: this.content().hasHeader ? -1 : 0, col: 0 };
  }

  private pasteText(text: string): boolean {
    const cells = parseClipboardTable(text);
    if (!isClipboardTable(cells)) return false;
    const at = this.pasteTarget();
    this.stopEditing();
    this.changeContent(pasteTableCells(this.content(), at, cells), 'paste');
    this.select('table');
    this.pasteNote.set('');
    return true;
  }

  private onPaste(event: ClipboardEvent): void {
    const text = event.clipboardData?.getData('text/plain') ?? '';
    // into the title, subtitle or intro: as text, always
    if ((event.target as HTMLElement | null)?.closest('okr-article-header-edit')) return;
    if (this.pasteText(text)) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  /** «Aus Excel einfügen»: reads the clipboard (the browser may ask, or refuse: then Cmd+V into a cell does it) */
  protected async pasteFromClipboard(): Promise<void> {
    try {
      const text = await navigator.clipboard.readText();
      if (!this.pasteText(text)) this.pasteNote.set(this.i18n.table_editor_paste_denied());
    } catch {
      this.pasteNote.set(this.i18n.table_editor_paste_denied());
    }
  }

  /************************************** selection *********************************************** */
  /** Cmd/Ctrl+Z and the like, except in a field of the panel; Tab moves from cell to cell, past the last one it adds a row. */
  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Tab' && this.cell() && (event.target as HTMLElement | null)?.closest('okr-table-view')) {
      event.preventDefault();
      this.moveCell(event.shiftKey ? -1 : 1);
      return;
    }
    const key = historyKey(event);
    if (!key || event.defaultPrevented) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('input, textarea, ion-input, ion-textarea, ion-select')) return;
    event.preventDefault();
    this.step(key);
  }

  private moveCell(by: -1 | 1): void {
    const at = this.cell();
    if (!at) return;
    const columns = this.content().columns.length;
    const first = this.content().hasHeader ? -1 : 0;
    let index = (at.row - first) * columns + at.col + by;
    if (index < 0) index = 0;
    const row = Math.floor(index / columns) + first;
    const col = index % columns;
    if (row >= this.content().rows.length) {
      this.changeContent(insertTableRow(this.content(), this.content().rows.length));
    }
    this.editCell({ row, col });
  }

  protected editCell(ref: TableCellRef): void {
    const current = this.cell();
    if (current && current.row === ref.row && current.col === ref.col) return;
    this.textReady.set(false);
    this.cell.set(ref);
    this.selected.set('table');
  }

  protected stopEditing(): void {
    this.cell.set(undefined);
    this.textReady.set(false);
  }

  protected select(selection: Selection): void {
    this.selected.set(selection);
    if (selection === 'section') this.stopEditing();
  }

  protected chooseDevice(value: unknown): void {
    const device = DEVICES.find((d) => d === value);
    if (device) this.device.set(device);
  }

  /************************************** helpers *********************************************** */
  protected isEditing(ref: TableCellRef): boolean {
    const cell = this.cell();
    return !!cell && cell.row === ref.row && cell.col === ref.col;
  }

  protected hasText(html: string): boolean {
    return html.replace(/<(?!img)[^>]*>/g, '').trim().length > 0 || /<img/i.test(html);
  }

  protected cellName(ref: TableCellRef): string {
    const column = fill(this.i18n.table_editor_columns_column(), { n: String(ref.col + 1) });
    return ref.row < 0 ? `${this.i18n.table_editor_header_label()} · ${column}` : `${ref.row + 1} · ${column}`;
  }

  /** messages of a single field, for the inline <okr-error-note> */
  protected errorsFor(field: string): string[] {
    return getFieldErrors(this.errors(), field);
  }
}
