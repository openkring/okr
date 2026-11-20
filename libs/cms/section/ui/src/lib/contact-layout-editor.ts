import { Component, computed, input, model, signal } from '@angular/core';
import { CdkDrag, CdkDragDrop, CdkDragPlaceholder, CdkDropList, CdkDropListGroup } from '@angular/cdk/drag-drop';
import { IonButton, IonChip, IonIcon, IonLabel, IonNote, IonSegment, IonSegmentButton } from '@ionic/angular';

import { CONTACT_LAYOUTS, ContactConfig, ContactElement, ContactLayout } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import {
  addContactColumn, addContactRow, CONTACT_LAYOUT_PRESETS, CONTACT_MAX_COLUMNS, CONTACT_MAX_ROWS, ContactDetails,
  cycleContactColumnWidth, getContactLayoutRows, getUnplacedElements, isContactElementVisible, placeContactElement,
  removeContactColumn, removeContactElement, removeContactRow, SectionI18n
} from '@okr/cms-section-util';

/** Where a drop list sits: the palette, or a column of a row. */
type DropTarget = { kind: 'palette' } | { kind: 'column'; row: number; col: number };

const PRESETS = CONTACT_LAYOUTS.filter((l): l is Exclude<ContactLayout, 'custom'> => l !== 'custom');

/**
 * The layout card of a contact section: a scaled-down picture of the section in which every block
 * (title, subtitle, the info fields, map, form) can be dragged between columns, reordered, or
 * dragged back to the palette. Presets replace the arrangement in one click; any move turns the
 * layout into 'custom'. Rows hold 1–3 columns whose width cycles 1–3 (fr units); on a narrow
 * screen the columns stack, which the phone toggle previews.
 */
@Component({
  selector: 'okr-contact-layout-editor',
  standalone: true,
  imports: [
    CdkDropListGroup, CdkDropList, CdkDrag, CdkDragPlaceholder, SvgIconPipe,
    IonButton, IonIcon, IonChip, IonLabel, IonNote, IonSegment, IonSegmentButton
  ],
  styles: [`
    :host { display: block; }
    .presets { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
    .preset {
      display: flex; flex-direction: column; align-items: center; gap: 4px; cursor: pointer;
      padding: 6px; border-radius: 8px; border: 2px solid transparent; background: none; color: inherit; font: inherit;
    }
    .preset.active { border-color: var(--ion-color-primary); }
    .preset:disabled { cursor: default; opacity: 0.6; }
    .thumb { display: flex; flex-direction: column; gap: 2px; width: 72px; height: 48px; padding: 3px;
             border-radius: 4px; background: var(--ion-color-light); }
    .thumb-row { display: grid; gap: 2px; flex: 1; }
    .thumb-col { background: var(--ion-color-medium-tint); border-radius: 2px; }
    .preset span { font-size: 0.75rem; }

    .toolbar { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; }

    .palette {
      display: flex; flex-wrap: wrap; gap: 6px; min-height: 44px; padding: 8px; margin: 8px 0 12px;
      border: 1px dashed var(--ion-color-medium); border-radius: 8px;
    }
    .palette-title { font-size: 0.8rem; color: var(--ion-color-medium); margin-top: 8px; }
    .chip {
      display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; border-radius: 16px; cursor: grab;
      background: var(--ion-color-primary); color: var(--ion-color-primary-contrast); font-size: 0.8rem; touch-action: none;
    }

    /* the stage: a framed miniature of the section */
    .stage { border: 1px solid var(--ion-color-medium-tint); border-radius: 8px; padding: 12px;
             background: var(--ion-background-color, #fff); margin: 0 auto; transition: max-width 0.2s; }
    .stage.narrow { max-width: 360px; }
    .row { position: relative; display: grid; gap: 12px; margin-bottom: 12px; padding: 6px;
           border: 1px dotted var(--ion-color-medium-tint); border-radius: 6px; }
    .stage.narrow .row { grid-template-columns: 1fr !important; }
    .row-tools, .col-tools { display: flex; justify-content: flex-end; gap: 2px; }
    .row-tools { grid-column: 1 / -1; }
    .col { display: flex; flex-direction: column; min-width: 0; }
    .drop {
      flex: 1; display: flex; flex-direction: column; gap: 6px; min-height: 64px; padding: 6px;
      border-radius: 6px; background: var(--ion-color-light);
    }
    .drop.empty::after { content: attr(data-empty); margin: auto; font-size: 0.75rem; color: var(--ion-color-medium); }

    .block { position: relative; padding: 6px 28px 6px 8px; border-radius: 4px; cursor: grab; touch-action: none;
             background: var(--ion-color-step-50, #fff); border: 1px solid var(--ion-color-light-shade); font-size: 0.8rem; }
    .block.off { opacity: 0.45; }
    .block .remove { position: absolute; top: 2px; right: 2px; --padding-start: 2px; --padding-end: 2px; margin: 0; height: 22px; }
    .block .kind { display: block; font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--ion-color-medium); }
    .block .hidden { font-size: 0.65rem; color: var(--ion-color-warning-shade); }
    .block .title { font-size: 1.1rem; font-weight: 600; color: var(--ion-color-primary); }
    .block .subtitle { font-size: 0.95rem; font-weight: 600; color: var(--ion-color-primary); }
    .block .link { text-decoration: underline; color: var(--ion-color-primary); overflow-wrap: anywhere; }
    .block .img { display: block; width: 64px; height: 64px; object-fit: cover; border-radius: 4px; background: var(--ion-color-medium-tint); }
    .block .map { height: 72px; border-radius: 4px;
      background: repeating-linear-gradient(45deg, var(--ion-color-light-shade) 0 6px, var(--ion-color-light) 6px 12px); position: relative; }
    .block .map::after { content: '📍'; position: absolute; left: 50%; top: 50%; transform: translate(-50%, -60%); }
    .block .form-line { height: 10px; margin: 4px 0; border-radius: 3px; background: var(--ion-color-light-shade); }
    .block .form-line.tall { height: 28px; }
    .block .form-btn { width: 40%; height: 12px; border-radius: 3px; background: var(--ion-color-primary); }

    .cdk-drag-preview { box-shadow: 0 4px 16px rgba(0,0,0,0.25); border-radius: 4px; }
    .cdk-drag-placeholder { opacity: 0.3; }
    .cdk-drop-list-dragging .block:not(.cdk-drag-placeholder) { transition: transform 200ms cubic-bezier(0,0,0.2,1); }
    .cdk-drop-list-receiving { outline: 2px dashed var(--ion-color-primary); outline-offset: 2px; }
  `],
  template: `
    <!-- presets: a thumbnail per layout -->
    <ion-note>{{ i18n().contact_layout_presets() }}</ion-note>
    <div class="presets">
      @for(preset of presets; track preset) {
        <button type="button" class="preset" [class.active]="config().layout === preset" [disabled]="readOnly()"
                (click)="applyPreset(preset)" [attr.aria-pressed]="config().layout === preset">
          <div class="thumb" aria-hidden="true">
            @for(r of presetRows[preset]; track $index) {
              <div class="thumb-row" [style.grid-template-columns]="gridColumns(r.columns)">
                @for(c of r.columns; track $index) { <div class="thumb-col"></div> }
              </div>
            }
          </div>
          <span>{{ presetLabel(preset) }}</span>
        </button>
      }
      @if(config().layout === 'custom') {
        <ion-chip color="primary" [outline]="true"><ion-label>{{ i18n().contact_layout_custom() }}</ion-label></ion-chip>
      }
    </div>

    <div cdkDropListGroup>
      <!-- palette: blocks not in the layout; dropping a block here removes it from the layout -->
      <div class="toolbar">
        <div class="palette-title">{{ i18n().contact_layout_palette() }}</div>
        <ion-segment [value]="narrow() ? 'narrow' : 'wide'" (ionChange)="narrow.set($event.detail.value === 'narrow')" style="width: auto">
          <ion-segment-button value="wide" [attr.aria-label]="i18n().contact_layout_title()">
            <ion-icon src="{{ 'desktop' | svgIcon }}" />
          </ion-segment-button>
          <ion-segment-button value="narrow" [attr.aria-label]="i18n().contact_layout_narrow()">
            <ion-icon src="{{ 'phone-portrait' | svgIcon }}" />
          </ion-segment-button>
        </ion-segment>
      </div>
      <div class="palette" cdkDropList [cdkDropListData]="paletteTarget" [cdkDropListDisabled]="readOnly()"
           cdkDropListOrientation="mixed" (cdkDropListDropped)="onDrop($event)">
        @for(element of unplaced(); track element) {
          <span class="chip" cdkDrag [cdkDragData]="element">{{ elementLabel(element) }}</span>
        } @empty {
          <ion-note>{{ i18n().contact_layout_palette_empty() }}</ion-note>
        }
      </div>

      <!-- stage -->
      <div class="stage" [class.narrow]="narrow()">
        @for(r of config().rows; track $index; let ri = $index) {
          <div class="row" [style.grid-template-columns]="gridColumns(r.columns)">
            @if(!readOnly()) {
              <div class="row-tools">
                @if(r.columns.length < maxColumns) {
                  <ion-button fill="clear" size="small" (click)="update(addColumn(ri))" [attr.aria-label]="i18n().contact_layout_add_column()">
                    <ion-icon slot="icon-only" src="{{ 'add-circle' | svgIcon }}" />
                  </ion-button>
                }
                @if(config().rows.length > 1) {
                  <ion-button fill="clear" size="small" color="danger" (click)="update(removeRow(ri))" [attr.aria-label]="i18n().contact_layout_remove_row()">
                    <ion-icon slot="icon-only" src="{{ 'trash' | svgIcon }}" />
                  </ion-button>
                }
              </div>
            }
            @for(c of r.columns; track $index; let ci = $index) {
              <div class="col">
                @if(!readOnly()) {
                  <div class="col-tools">
                    <ion-button fill="clear" size="small" (click)="update(cycleWidth(ri, ci))" [attr.aria-label]="i18n().contact_layout_width()">
                      {{ c.width }}×
                    </ion-button>
                    @if(r.columns.length > 1) {
                      <ion-button fill="clear" size="small" color="medium" (click)="update(removeColumn(ri, ci))" [attr.aria-label]="i18n().contact_layout_remove_column()">
                        <ion-icon slot="icon-only" src="{{ 'close' | svgIcon }}" />
                      </ion-button>
                    }
                  </div>
                }
                <div class="drop" [class.empty]="c.elements.length === 0" [attr.data-empty]="i18n().contact_layout_drop_here()"
                     cdkDropList [cdkDropListData]="columnTarget(ri, ci)" [cdkDropListDisabled]="readOnly()"
                     (cdkDropListDropped)="onDrop($event)">
                  @for(element of c.elements; track element) {
                    <div class="block" [class.off]="!isVisible(element)" cdkDrag [cdkDragData]="element">
                      <span class="kind">{{ elementLabel(element) }}
                        @if(!isVisible(element)) { <span class="hidden">· {{ i18n().contact_layout_hidden() }}</span> }
                      </span>
                      @switch(element) {
                        @case('title') { <div class="title">{{ title() || elementLabel(element) }}</div> }
                        @case('subTitle') { <div class="subtitle">{{ subTitle() || elementLabel(element) }}</div> }
                        @case('orgLogo') { @if(details().org?.imageUrl; as url) { <img class="img" [src]="url" alt="" /> } @else { <div class="img"></div> } }
                        @case('personAvatar') { @if(details().person?.imageUrl; as url) { <img class="img" [src]="url" alt="" /> } @else { <div class="img"></div> } }
                        @case('orgName') { <div>{{ details().org?.name }}</div> }
                        @case('personName') { <div>{{ details().person?.name }}</div> }
                        @case('orgAddress') { @for(line of details().org?.addressLines ?? []; track $index) { <div>{{ line }}</div> } }
                        @case('personAddress') { @for(line of details().person?.addressLines ?? []; track $index) { <div>{{ line }}</div> } }
                        @case('orgEmail') { <div class="link">{{ details().org?.email }}</div> }
                        @case('personEmail') { <div class="link">{{ details().person?.email }}</div> }
                        @case('orgPhone') { <div>{{ details().org?.phone }}</div> }
                        @case('personPhone') { <div>{{ details().person?.phone }}</div> }
                        @case('map') { <div class="map"></div> }
                        @case('form') {
                          <div class="form-line"></div><div class="form-line"></div><div class="form-line tall"></div><div class="form-btn"></div>
                        }
                      }
                      @if(!readOnly()) {
                        <ion-button class="remove" fill="clear" size="small" color="medium" (click)="update(remove(element))"
                                    [attr.aria-label]="i18n().contact_layout_remove_element()">
                          <ion-icon slot="icon-only" src="{{ 'close' | svgIcon }}" />
                        </ion-button>
                      }
                      <div *cdkDragPlaceholder class="block"></div>
                    </div>
                  }
                </div>
              </div>
            }
          </div>
        }
        @if(!readOnly() && config().rows.length < maxRows) {
          <ion-button fill="outline" size="small" (click)="update(addRow())">
            <ion-icon slot="start" src="{{ 'add-circle' | svgIcon }}" />{{ i18n().contact_layout_add_row() }}
          </ion-button>
        }
      </div>
    </div>
  `
})
export class ContactLayoutEditor {
  public config = model.required<ContactConfig>();
  public readonly details = input<ContactDetails>({});
  public readonly title = input('');
  public readonly subTitle = input('');
  public readonly readOnly = input(true);
  public readonly i18n = input.required<SectionI18n>();

  protected readonly presets = PRESETS;
  protected readonly presetRows = CONTACT_LAYOUT_PRESETS;
  protected readonly maxColumns = CONTACT_MAX_COLUMNS;
  protected readonly maxRows = CONTACT_MAX_ROWS;
  protected readonly paletteTarget: DropTarget = { kind: 'palette' };
  protected readonly narrow = signal(false);

  protected readonly unplaced = computed(() => getUnplacedElements(this.config().rows));

  // column targets are cached per position so cdkDropListData keeps its identity between renders
  private readonly targets = new Map<string, DropTarget>();

  protected columnTarget(row: number, col: number): DropTarget {
    const key = `${row}:${col}`;
    let target = this.targets.get(key);
    if (!target) {
      target = { kind: 'column', row, col };
      this.targets.set(key, target);
    }
    return target;
  }

  protected gridColumns(columns: { width: number }[]): string {
    return columns.map(c => `${c.width}fr`).join(' ');
  }

  protected isVisible(element: ContactElement): boolean {
    return isContactElementVisible(element, this.config(), this.details(), this.title(), this.subTitle());
  }

  protected elementLabel(element: ContactElement): string {
    const key = `contact_element_${element}` as keyof SectionI18n;
    return this.i18n()[key]();
  }

  protected presetLabel(preset: ContactLayout): string {
    const key = `contact_layout_${preset}` as keyof SectionI18n;
    return this.i18n()[key]();
  }

  protected applyPreset(preset: ContactLayout): void {
    if (this.readOnly()) return;
    this.config.update(c => ({ ...c, layout: preset, rows: getContactLayoutRows(preset) }));
  }

  protected onDrop(event: CdkDragDrop<DropTarget, DropTarget, ContactElement>): void {
    const element = event.item.data;
    const target = event.container.data;
    if (target.kind === 'palette') {
      if (event.previousContainer.data.kind !== 'palette') this.update(this.remove(element));
      return;
    }
    // same list: cdk reports the index the item should land on after leaving its old place
    const sameList = event.previousContainer === event.container;
    const index = sameList && event.currentIndex > event.previousIndex ? event.currentIndex + 1 : event.currentIndex;
    if (sameList && event.currentIndex === event.previousIndex) return;
    this.update(placeContactElement(this.config().rows, element, target.row, target.col, index));
  }

  protected update(rows: ContactConfig['rows']): void {
    if (rows === this.config().rows) return;
    this.config.update(c => ({ ...c, layout: 'custom', rows }));
  }

  protected remove(element: ContactElement) { return removeContactElement(this.config().rows, element); }
  protected addRow() { return addContactRow(this.config().rows); }
  protected removeRow(row: number) { return removeContactRow(this.config().rows, row); }
  protected addColumn(row: number) { return addContactColumn(this.config().rows, row); }
  protected removeColumn(row: number, col: number) { return removeContactColumn(this.config().rows, row, col); }
  protected cycleWidth(row: number, col: number) { return cycleContactColumnWidth(this.config().rows, row, col); }
}
