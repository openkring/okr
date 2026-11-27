import { Component, computed, input, output, signal } from '@angular/core';
import { IonButton, IonCard, IonCardContent, IonIcon, IonLabel, IonNote, IonSegment, IonSegmentButton, IonToggle } from '@ionic/angular';

import { NAME_LENGTH } from '@okr/shared-constants';
import { TABLE_BREAKPOINTS, TABLE_RESPONSIVE_MODES, TableAlign, TableBreakpoint, TableConfig, TableGrid, TableResponsiveMode, TableStyle } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { ErrorNote, TextInput, TextInputI18n } from '@okr/shared-ui';
import { fill } from '@okr/shared-util-core';
import {
  applyTableLook, applyTableSize, getFieldErrors, SectionErrors, setTableColumn, tableColumnsOf, setTableHeader, TABLE_ALIGNS, TABLE_LOOKS, TABLE_SIZES, TABLE_WIDTH_PRESETS,
  TableEditorI18n, TableLook, tableContentOf, tableLookOf, tableResponsiveOf, TableSize, tableSizeOf, withTableContent,
} from '@okr/cms-section-util';

import { TableStyleConfiguration } from './table-style-configuration';

type ShowTitleAs = TableGrid['showTitleAs'];
const TITLE_POSITIONS: readonly ShowTitleAs[] = ['title', 'legend', 'header', 'none'];
const ALIGN_ICONS: Record<TableAlign, string> = { left: 'align-left', center: 'align-center', right: 'align-right' };

/**
 * The settings of a table in the table editor, shown while the table is selected: look, header row, where the title stands, the
 * columns (width, alignment), text size and what a narrow screen does. Each choice writes the fields a table has always stored
 * (`header`/`body` styles, `grid.template`), so older apps draw it unchanged. «Anpassen» opens the former style fields of header and
 * cells, field by field, for what no choice covers. Every change sets `config` once.
 */
@Component({
  selector: 'okr-table-panel',
  standalone: true,
  imports: [SvgIconPipe, ErrorNote, TableStyleConfiguration, TextInput, IonButton, IonCard, IonCardContent, IonIcon, IonLabel, IonNote, IonSegment, IonSegmentButton, IonToggle],
  styles: [`
    .field-label { display: block; margin: 12px 0 6px; font-size: 0.85rem; color: var(--ion-color-medium); }
    .field-label:first-child { margin-top: 0; }
    .note { display: block; margin-top: 6px; font-size: 0.85rem; }
    .presets { display: flex; flex-wrap: wrap; gap: 6px; }
    .preset { display: flex; flex-direction: column; align-items: center; gap: 6px; width: 92px; padding: 8px 4px; font: inherit; font-size: 0.75rem;
      color: var(--ion-text-color); background: transparent; border: 1px solid var(--ion-color-light-shade); border-radius: 8px; cursor: pointer; }
    .preset.current { border: 2px solid var(--ion-color-primary); padding: 7px 3px; }
    .sample { display: grid; grid-template-columns: 1fr 1fr; width: 56px; font-size: 0.55rem; }
    .sample span { height: 9px; }
    .sample.lines span { border: 0.5px solid var(--ion-color-medium); }
    .sample.lines span.h { background: var(--ion-color-light-shade); }
    .sample.plain span { border-bottom: 0.5px solid var(--ion-color-light-shade); }
    .sample.plain span.h { border-bottom: 1px solid var(--ion-color-medium); }
    .sample.colored span { border: 0.5px solid var(--ion-color-light-shade); }
    .sample.colored span.h { background: var(--ion-color-primary); }
    .switch { display: flex; align-items: center; justify-content: space-between; margin-top: 12px; }
    .column { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
    .column .name { flex: none; width: 64px; font-size: 0.85rem; }
    .column ion-segment { flex: 1; min-width: 0; }
    .aligns { display: flex; flex: none; }
    .aligns ion-button { margin: 0; --padding-start: 4px; --padding-end: 4px; }
    .aligns ion-button.current { --color: var(--ion-color-primary); }
    ion-segment { margin-bottom: 4px; }
    ion-segment-button { min-width: 0; --padding-start: 2px; --padding-end: 2px; text-transform: none; letter-spacing: 0; font-size: 0.85rem; }
    .custom { display: flex; align-items: center; justify-content: space-between; }
  `],
  template: `
    @let t = i18n();
    <ion-card>
      <ion-card-content>
        <span class="field-label">{{ t.table_editor_look_title() }}</span>
        <div class="presets" role="radiogroup" [attr.aria-label]="t.table_editor_look_title()">
          @for (l of looks; track l) {
            <button type="button" class="preset" role="radio" [class.current]="l === look()" [attr.aria-checked]="l === look()" [disabled]="readOnly()" (click)="setLook(l)">
              <span [class]="'sample ' + l" aria-hidden="true"><span class="h"></span><span class="h"></span><span></span><span></span><span></span><span></span></span>
              <span>{{ lookLabels()[l] }}</span>
            </button>
          }
        </div>
        @if (!look()) { <ion-note class="note">{{ t.table_editor_look_own() }}</ion-note> }

        <div class="switch">
          <ion-label>{{ t.table_editor_header_label() }}</ion-label>
          <ion-toggle [checked]="content().hasHeader" [disabled]="readOnly()" [attr.aria-label]="t.table_editor_header_label()" (ionChange)="setHeader($event.detail.checked)" />
        </div>

        <span class="field-label">{{ t.table_editor_title_title() }}</span>
        <ion-segment [value]="showTitleAs()" [disabled]="readOnly()" [attr.aria-label]="t.table_editor_title_title()" (ionChange)="setTitlePosition($event.detail.value)">
          @for (p of titlePositions; track p) { <ion-segment-button [value]="p"><ion-label>{{ titleLabels()[p] }}</ion-label></ion-segment-button> }
        </ion-segment>

        <span class="field-label">{{ t.table_editor_size_title() }}</span>
        <ion-segment [value]="size() ?? ''" [disabled]="readOnly()" [attr.aria-label]="t.table_editor_size_title()" (ionChange)="setSize($event.detail.value)">
          @for (s of sizes; track s) { <ion-segment-button [value]="s"><ion-label>{{ sizeLabels()[s] }}</ion-label></ion-segment-button> }
        </ion-segment>
      </ion-card-content>
    </ion-card>

    <ion-card>
      <ion-card-content>
        <span class="field-label">{{ t.table_editor_columns_title() }}</span>
        @for (column of content().columns; track $index; let c = $index) {
          <div class="column">
            <span class="name">{{ columnName(c) }}</span>
            <ion-segment [value]="widthPreset(column.width)" [disabled]="readOnly()" [attr.aria-label]="columnName(c)" (ionChange)="setWidth(c, $event.detail.value)">
              @for (w of widths; track w) { <ion-segment-button [value]="w"><ion-label>{{ widthLabels()[w] }}</ion-label></ion-segment-button> }
            </ion-segment>
            <div class="aligns" role="radiogroup" [attr.aria-label]="columnName(c)">
              @for (a of aligns; track a) {
                <ion-button fill="clear" size="small" role="radio" [class.current]="(column.align ?? '') === a" [attr.aria-checked]="(column.align ?? '') === a"
                  [title]="alignLabels()[a]" [attr.aria-label]="alignLabels()[a]" [disabled]="readOnly()" (click)="setAlign(c, a)">
                  <ion-icon slot="icon-only" src="{{ alignIcons[a] | svgIcon }}" aria-hidden="true" />
                </ion-button>
              }
            </div>
          </div>
          @if (!widthPreset(column.width)) { <ion-note class="note">{{ t.table_editor_columns_own() }}: {{ column.width }}</ion-note> }
        }
        <okr-error-note [errors]="errorsFor('columns')" />
      </ion-card-content>
    </ion-card>

    <ion-card>
      <ion-card-content>
        <span class="field-label">{{ t.table_editor_responsive_title() }}</span>
        <ion-segment [value]="responsive().mode" [disabled]="readOnly()" [attr.aria-label]="t.table_editor_responsive_title()" (ionChange)="setResponsive({ mode: $event.detail.value })">
          @for (m of modes; track m) { <ion-segment-button [value]="m"><ion-label>{{ modeLabels()[m] }}</ion-label></ion-segment-button> }
        </ion-segment>
        <ion-note class="note">{{ modeHelper() }}</ion-note>
        <okr-error-note [errors]="errorsFor('responsive.mode')" />
        <span class="field-label">{{ t.table_editor_responsive_breakpoint() }}</span>
        <ion-segment [value]="responsive().breakpoint" [disabled]="readOnly()" [attr.aria-label]="t.table_editor_responsive_breakpoint()" (ionChange)="setResponsive({ breakpoint: $event.detail.value })">
          @for (b of breakpoints; track b) { <ion-segment-button [value]="b"><ion-label>{{ breakpointLabels()[b] }}</ion-label></ion-segment-button> }
        </ion-segment>
        <okr-error-note [errors]="errorsFor('responsive.breakpoint')" />
      </ion-card-content>
    </ion-card>

    <ion-card>
      <ion-card-content class="custom">
        <div>
          <strong>{{ t.table_editor_custom_title() }}</strong>
          <ion-note class="note">{{ t.table_editor_custom_helper() }}</ion-note>
        </div>
        <ion-button fill="clear" size="small" [attr.aria-expanded]="customOpen()" [attr.aria-label]="t.table_editor_custom_title()" (click)="customOpen.set(!customOpen())">
          <ion-icon slot="icon-only" src="{{ (customOpen() ? 'chevron-up' : 'chevron-down') | svgIcon }}" aria-hidden="true" />
        </ion-button>
      </ion-card-content>
    </ion-card>
    @if (customOpen()) {
      <ion-card>
        <ion-card-content>
          <okr-text-input [i18n]="templateI18n()" [value]="config().grid?.template ?? ''" (valueChange)="setTemplate($event)" [maxLength]="templateLength" [showHelper]="true" [readOnly]="readOnly()" />
          <okr-error-note [errors]="errorsFor('grid.template')" />
        </ion-card-content>
      </ion-card>
      <okr-table-style name="header" [formData]="config().header" (formDataChange)="setStyle('header', $event)" [readOnly]="readOnly()" [i18n]="t" />
      <okr-table-style name="body" [formData]="config().body" (formDataChange)="setStyle('body', $event)" [readOnly]="readOnly()" [i18n]="t" />
    }
  `,
})
export class TablePanel {
  // inputs
  public readonly config = input.required<TableConfig>();
  public readonly errors = input<SectionErrors>({});
  public readonly readOnly = input(false);
  public readonly i18n = input.required<TableEditorI18n>();

  // outputs
  public readonly configChange = output<TableConfig>();

  protected readonly looks = TABLE_LOOKS;
  protected readonly sizes = TABLE_SIZES;
  protected readonly widths = TABLE_WIDTH_PRESETS;
  protected readonly aligns = TABLE_ALIGNS;
  protected readonly alignIcons = ALIGN_ICONS;
  protected readonly modes = TABLE_RESPONSIVE_MODES;
  protected readonly breakpoints = TABLE_BREAKPOINTS;
  protected readonly titlePositions = TITLE_POSITIONS;
  /** the template stays the same cap the suite enforces */
  protected readonly templateLength = NAME_LENGTH * 2;
  protected readonly customOpen = signal(false);

  protected readonly content = computed(() => tableContentOf(this.config()));
  protected readonly look = computed(() => tableLookOf(this.config()));
  protected readonly size = computed(() => tableSizeOf(this.config()));
  protected readonly responsive = computed(() => tableResponsiveOf(this.config()));
  protected readonly showTitleAs = computed<ShowTitleAs>(() => this.config().grid?.showTitleAs ?? 'title');

  protected readonly lookLabels = computed<Record<TableLook, string>>(() => {
    const t = this.i18n();
    return { lines: t.table_editor_look_lines(), plain: t.table_editor_look_plain(), colored: t.table_editor_look_colored() };
  });
  protected readonly sizeLabels = computed<Record<TableSize, string>>(() => {
    const t = this.i18n();
    return { s: t.table_editor_size_s(), m: t.table_editor_size_m(), l: t.table_editor_size_l() };
  });
  protected readonly titleLabels = computed<Record<ShowTitleAs, string>>(() => {
    const t = this.i18n();
    return { title: t.table_editor_title_above(), legend: t.table_editor_title_legend(), header: t.table_editor_title_header(), none: t.table_editor_title_none() };
  });
  protected readonly widthLabels = computed<Record<(typeof TABLE_WIDTH_PRESETS)[number], string>>(() => {
    const t = this.i18n();
    return { auto: t.table_editor_columns_auto(), narrow: t.table_editor_columns_narrow(), wide: t.table_editor_columns_wide() };
  });
  protected readonly alignLabels = computed<Record<TableAlign, string>>(() => {
    const t = this.i18n();
    return { left: t.table_editor_columns_alignLeft(), center: t.table_editor_columns_alignCenter(), right: t.table_editor_columns_alignRight() };
  });
  protected readonly modeLabels = computed<Record<TableResponsiveMode, string>>(() => {
    const t = this.i18n();
    return { auto: t.table_editor_responsive_auto(), stack: t.table_editor_responsive_stack(), scroll: t.table_editor_responsive_scroll() };
  });
  protected readonly modeHelper = computed(() => {
    const t = this.i18n();
    switch (this.responsive().mode) {
      case 'stack': return t.table_editor_responsive_stackHelper();
      case 'scroll': return t.table_editor_responsive_scrollHelper();
      default: return t.table_editor_responsive_autoHelper();
    }
  });
  protected readonly breakpointLabels = computed<Record<TableBreakpoint, string>>(() => {
    const t = this.i18n();
    return { mobile: t.table_editor_responsive_mobile(), tablet: t.table_editor_responsive_tablet() };
  });
  protected readonly templateI18n = computed(() => ({
    name: 'template', label: this.i18n().table_grid_template_label(), placeholder: this.i18n().table_grid_template_placeholder(),
    helper: this.i18n().table_grid_template_helper(),
  } as TextInputI18n));

  /************************************** changes *********************************************** */
  protected setLook(look: TableLook): void {
    this.configChange.emit(applyTableLook(this.config(), look));
  }

  protected setSize(value: unknown): void {
    const size = TABLE_SIZES.find((s) => s === value);
    if (size && size !== this.size()) this.configChange.emit(applyTableSize(this.config(), size));
  }

  protected setHeader(hasHeader: boolean): void {
    if (hasHeader !== this.content().hasHeader) this.configChange.emit(withTableContent(this.config(), setTableHeader(this.content(), hasHeader)));
  }

  protected setTitlePosition(value: unknown): void {
    const position = TITLE_POSITIONS.find((p) => p === value);
    if (position && position !== this.showTitleAs()) this.configChange.emit({ ...this.config(), grid: { ...this.config().grid, showTitleAs: position } });
  }

  protected setWidth(at: number, value: unknown): void {
    const width = TABLE_WIDTH_PRESETS.find((w) => w === value);
    if (width && width !== this.content().columns[at]?.width) this.configChange.emit(withTableContent(this.config(), setTableColumn(this.content(), at, { width })));
  }

  /** a second click on the chosen alignment drops it: the style's alignment applies again */
  protected setAlign(at: number, align: TableAlign): void {
    const content = this.content();
    if (content.columns[at]?.align !== align) {
      this.configChange.emit(withTableContent(this.config(), setTableColumn(content, at, { align })));
      return;
    }
    // without the key: Firestore takes no undefined value
    const columns = content.columns.map((c, i) => (i === at ? { width: c.width } : c));
    this.configChange.emit(withTableContent(this.config(), { ...content, columns }));
  }

  protected setResponsive(patch: { mode?: unknown; breakpoint?: unknown }): void {
    const mode = TABLE_RESPONSIVE_MODES.find((m) => m === patch.mode);
    const breakpoint = TABLE_BREAKPOINTS.find((b) => b === patch.breakpoint);
    const current = this.responsive();
    const next = { mode: mode ?? current.mode, breakpoint: breakpoint ?? current.breakpoint };
    if (next.mode !== current.mode || next.breakpoint !== current.breakpoint || !this.config().responsive) this.configChange.emit({ ...this.config(), responsive: next });
  }

  /**
   * A typed template becomes the columns (each keeps its alignment by position). Written as columns, not by dropping them: a save
   * merges, so a dropped field would stay stored and win over the template.
   */
  protected setTemplate(template: string): void {
    const aligns = this.content().columns.map((c) => c.align);
    const columns = tableColumnsOf({ grid: { ...this.config().grid, template } }).map((c, i) => (aligns[i] ? { ...c, align: aligns[i] } : c));
    this.configChange.emit({ ...this.config(), columns, grid: { ...this.config().grid, template } });
  }

  protected setStyle(part: 'header' | 'body', style: TableStyle): void {
    this.configChange.emit({ ...this.config(), [part]: style });
  }

  /************************************** helpers *********************************************** */
  protected widthPreset(width: string): string {
    return TABLE_WIDTH_PRESETS.find((w) => w === width) ?? '';
  }

  protected columnName(at: number): string {
    return fill(this.i18n().table_editor_columns_column(), { n: String(at + 1) });
  }

  protected errorsFor(field: string): string[] {
    return getFieldErrors(this.errors(), field);
  }
}
