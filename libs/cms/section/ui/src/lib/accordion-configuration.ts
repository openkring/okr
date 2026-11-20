import { Component, computed, input, model } from '@angular/core';
import {
  IonButton, IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonCol, IonGrid, IonNote, IonRow,
  IonSelect, IonSelectOption
} from '@ionic/angular';

import {
  ACCORDION_ICON_POSITIONS, ACCORDION_TITLE_STYLES, ACCORDION_VIEW_TYPES, AccordionColumns, AccordionConfig,
  AccordionIconPosition, AccordionTitleStyle, AccordionViewType
} from '@okr/shared-models';
import { Checkbox, CheckboxI18n, Color, IconInput, NumberInput, NumberInputI18n, TextInputI18n } from '@okr/shared-ui';
import { ACCORDION_MAX_COLUMNS, ACCORDION_MAX_SIZE, ACCORDION_MIN_SIZE, accordionSize, SectionI18n, withAccordionDefaults } from '@okr/cms-section-util';

type ScreenSize = keyof AccordionColumns;

/**
 * Configuration of an accordion section: view type, columns per screen size (cards), and the formatting of
 * titles, icons and the opened text. The items themselves reference other sections and are unchanged here.
 */
@Component({
  selector: 'okr-accordion-config',
  standalone: true,
  imports: [
    Checkbox, Color, IconInput, NumberInput,
    IonCard, IonCardHeader, IonCardTitle, IonCardSubtitle, IonCardContent, IonGrid, IonRow, IonCol,
    IonSelect, IonSelectOption, IonNote, IonButton
  ],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px; } }
    .color-row { display: flex; align-items: center; }
  `],
  template: `
    <ion-card>
      <ion-card-header>
        <ion-card-title>{{ i18n().accordion_title() }}</ion-card-title>
        <ion-card-subtitle>{{ i18n().accordion_subtitle() }}</ion-card-subtitle>
      </ion-card-header>
      <ion-card-content>
        <ion-grid>
          <ion-row>
            <ion-col size="12" size-md="6">
              <ion-select [label]="i18n().accordion_viewType_label()" labelPlacement="stacked"
                          [value]="config().viewType" [disabled]="readOnly()"
                          (ionChange)="patch({ viewType: $event.detail.value })">
                @for (v of viewTypes; track v) {
                  <ion-select-option [value]="v">{{ viewTypeLabels()[v] }}</ion-select-option>
                }
              </ion-select>
              <ion-note>{{ i18n().accordion_viewType_helper() }}</ion-note>
            </ion-col>
            <ion-col size="12" size-md="6">
              <okr-checkbox [i18n]="multipleI18n()" [checked]="config().multiple" (checkedChange)="patch({ multiple: $event })"
                            [showHelper]="true" [readOnly]="readOnly()" />
            </ion-col>
          </ion-row>

          @if (config().viewType === 'cards') {
            <ion-row>
              @for (size of screenSizes; track size) {
                <ion-col size="12" size-md="4">
                  <ion-select [label]="columnLabels()[size]" labelPlacement="stacked"
                              [value]="config().columns[size]" [disabled]="readOnly()"
                              (ionChange)="patchColumns(size, $event.detail.value)">
                    @for (n of columnNumbers; track n) {
                      <ion-select-option [value]="n">{{ n }}</ion-select-option>
                    }
                  </ion-select>
                </ion-col>
              }
              <ion-col size="12">
                <ion-note>{{ i18n().accordion_columns_helper() }}</ion-note>
              </ion-col>
            </ion-row>
          }

          <ion-row>
            <ion-col size="12" size-md="6">
              <ion-select [label]="i18n().accordion_titleStyle_label()" labelPlacement="stacked"
                          [value]="config().titleStyle" [disabled]="readOnly()"
                          (ionChange)="patch({ titleStyle: $event.detail.value })">
                @for (s of titleStyles; track s) {
                  <ion-select-option [value]="s">{{ titleStyleLabels()[s] }}</ion-select-option>
                }
              </ion-select>
            </ion-col>
            <ion-col size="12" size-md="6">
              <okr-number-input [i18n]="titleSizeI18n()" [value]="config().titleSize" (valueChange)="patchSize('titleSize', $event)"
                                [min]="minSize" [max]="maxSize" [showHelper]="true" [clearInput]="false" [readOnly]="readOnly()" />
            </ion-col>
          </ion-row>

          <ion-row>
            <ion-col size="12" size-md="6">
              <okr-icon-input [i18n]="iconClosedI18n()" [icon]="config().iconClosed" (iconChange)="patch({ iconClosed: $event })" [readOnly]="readOnly()" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <okr-icon-input [i18n]="iconOpenI18n()" [icon]="config().iconOpen" (iconChange)="patch({ iconOpen: $event })" [readOnly]="readOnly()" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <ion-select [label]="i18n().accordion_iconPosition_label()" labelPlacement="stacked"
                          [value]="config().iconPosition" [disabled]="readOnly()"
                          (ionChange)="patch({ iconPosition: $event.detail.value })">
                @for (p of iconPositions; track p) {
                  <ion-select-option [value]="p">{{ iconPositionLabels()[p] }}</ion-select-option>
                }
              </ion-select>
            </ion-col>
            <ion-col size="12" size-md="6">
              <div class="color-row">
                <okr-color [label]="i18n().accordion_iconColor_label()" [hexColor]="config().iconColor" (hexColorChange)="patch({ iconColor: $event })" [readOnly]="readOnly()" />
                @if (config().iconColor && !readOnly()) {
                  <ion-button fill="clear" size="small" (click)="patch({ iconColor: '' })">{{ i18n().accordion_color_reset() }}</ion-button>
                }
              </div>
            </ion-col>
          </ion-row>

          <ion-row>
            <ion-col size="12" size-md="6">
              <div class="color-row">
                <okr-color [label]="i18n().accordion_textBackground_label()" [hexColor]="config().textBackground" (hexColorChange)="patch({ textBackground: $event })" [readOnly]="readOnly()" />
                @if (config().textBackground && !readOnly()) {
                  <ion-button fill="clear" size="small" (click)="patch({ textBackground: '' })">{{ i18n().accordion_color_reset() }}</ion-button>
                }
              </div>
            </ion-col>
            <ion-col size="12" size-md="6">
              <okr-number-input [i18n]="textSizeI18n()" [value]="config().textSize" (valueChange)="patchSize('textSize', $event)"
                                [min]="minSize" [max]="maxSize" [showHelper]="true" [clearInput]="false" [readOnly]="readOnly()" />
            </ion-col>
          </ion-row>
        </ion-grid>
      </ion-card-content>
    </ion-card>
  `
})
export class AccordionConfiguration {
  // inputs
  public formData = model.required<AccordionConfig>();
  public readonly readOnly = input(true);
  public readonly i18n = input.required<SectionI18n>();

  /** older documents lack the formatting fields: show (and save) the defaults */
  protected readonly config = computed(() => withAccordionDefaults(this.formData()));

  protected readonly viewTypes = ACCORDION_VIEW_TYPES;
  protected readonly titleStyles = ACCORDION_TITLE_STYLES;
  protected readonly iconPositions = ACCORDION_ICON_POSITIONS;
  protected readonly screenSizes: ScreenSize[] = ['sm', 'md', 'lg'];
  protected readonly columnNumbers = Array.from({ length: ACCORDION_MAX_COLUMNS }, (_, i) => i + 1);
  protected readonly minSize = ACCORDION_MIN_SIZE;
  protected readonly maxSize = ACCORDION_MAX_SIZE;

  protected readonly viewTypeLabels = computed<Record<AccordionViewType, string>>(() => ({
    list: this.i18n().accordion_viewType_list(), cards: this.i18n().accordion_viewType_cards(),
  }));
  protected readonly titleStyleLabels = computed<Record<AccordionTitleStyle, string>>(() => ({
    regular: this.i18n().accordion_titleStyle_regular(), bold: this.i18n().accordion_titleStyle_bold(),
    italic: this.i18n().accordion_titleStyle_italic(), underline: this.i18n().accordion_titleStyle_underline(),
  }));
  protected readonly iconPositionLabels = computed<Record<AccordionIconPosition, string>>(() => ({
    start: this.i18n().accordion_iconPosition_start(), end: this.i18n().accordion_iconPosition_end(),
  }));
  protected readonly columnLabels = computed<Record<ScreenSize, string>>(() => ({
    sm: this.i18n().accordion_columns_sm(), md: this.i18n().accordion_columns_md(), lg: this.i18n().accordion_columns_lg(),
  }));

  protected readonly multipleI18n = computed((): CheckboxI18n => ({
    name: 'multiple', label: this.i18n().accordion_multiple_label(), helper: this.i18n().accordion_multiple_helper(),
  }));
  protected readonly titleSizeI18n = computed((): NumberInputI18n => ({
    name: 'titleSize', label: this.i18n().accordion_titleSize_label(), placeholder: '1', helper: this.i18n().accordion_size_helper(),
  }));
  protected readonly textSizeI18n = computed((): NumberInputI18n => ({
    name: 'textSize', label: this.i18n().accordion_textSize_label(), placeholder: '1', helper: this.i18n().accordion_size_helper(),
  }));
  protected readonly iconClosedI18n = computed((): TextInputI18n => ({
    name: 'iconClosed', label: this.i18n().accordion_iconClosed_label(), placeholder: 'add', helper: this.i18n().accordion_icon_helper(),
  }));
  protected readonly iconOpenI18n = computed((): TextInputI18n => ({
    name: 'iconOpen', label: this.i18n().accordion_iconOpen_label(), placeholder: 'remove', helper: this.i18n().accordion_icon_helper(),
  }));

  /*-------------------------- changes --------------------------------*/
  /** merges onto the stored config, so an untouched default (e.g. the icons of a view type) stays a default */
  protected patch(changes: Partial<AccordionConfig>): void {
    this.formData.set({ ...this.formData(), ...changes });
  }

  protected patchColumns(size: ScreenSize, value: number): void {
    this.patch({ columns: { ...this.config().columns, [size]: value } });
  }

  protected patchSize(field: 'titleSize' | 'textSize', value: number): void {
    this.patch({ [field]: accordionSize(value) });
  }
}
