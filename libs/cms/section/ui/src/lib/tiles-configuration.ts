import { Component, computed, inject, input, model, signal, Signal } from '@angular/core';
import {
  ActionSheetController, ActionSheetOptions,
  IonButton, IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonCol, IonGrid,
  IonIcon, IonItem, IonLabel, IonList, IonNote, IonRow, IonSelect, IonSelectOption
} from '@ionic/angular';

import { ENV } from '@okr/shared-config';
import { COMMENT_LENGTH, LONG_NAME_LENGTH, NAME_LENGTH, URL_LENGTH } from '@okr/shared-constants';
import { TILE_TONES, TILE_VARIANTS, TileItem, TileTone, TileVariant, TilesConfig } from '@okr/shared-models';
import { ErrorNote, TextareaInput, TextInput, TextInputI18n } from '@okr/shared-ui';
import { createActionSheetButton, createActionSheetOptions } from '@okr/shared-util-angular';
import { SvgIconPipe } from '@okr/shared-pipes';
import { getFieldErrors, SectionErrors, tilesItemField, withTilesDefaults } from '@okr/cms-section-util';

interface TilesConfigI18n {
  tiles_title:                  Signal<string>;
  tiles_subtitle:               Signal<string>;
  tiles_variant_label:          Signal<string>;
  tiles_variant_stat:           Signal<string>;
  tiles_variant_card:           Signal<string>;
  tiles_columns_label:          Signal<string>;
  tiles_columns_helper:         Signal<string>;
  tiles_lead_label:             Signal<string>;
  tiles_lead_placeholder:       Signal<string>;
  tiles_lead_helper:            Signal<string>;
  tiles_linkLabel_label:        Signal<string>;
  tiles_linkLabel_placeholder:  Signal<string>;
  tiles_linkLabel_helper:       Signal<string>;
  tiles_items:                  Signal<string>;
  tiles_empty:                  Signal<string>;
  tiles_add:                    Signal<string>;
  tiles_actions:                Signal<string>;
  tiles_edit:                   Signal<string>;
  tiles_moveUp:                 Signal<string>;
  tiles_moveDown:               Signal<string>;
  tiles_remove:                 Signal<string>;
  tiles_value_label:            Signal<string>;
  tiles_value_placeholder:      Signal<string>;
  tiles_value_helper:           Signal<string>;
  tiles_caption_label:          Signal<string>;
  tiles_caption_placeholder:    Signal<string>;
  tiles_itemTitle_label:        Signal<string>;
  tiles_itemTitle_placeholder:  Signal<string>;
  tiles_text_label:             Signal<string>;
  tiles_text_placeholder:       Signal<string>;
  tiles_icon_label:             Signal<string>;
  tiles_icon_placeholder:       Signal<string>;
  tiles_icon_helper:            Signal<string>;
  tiles_url_label:              Signal<string>;
  tiles_url_placeholder:        Signal<string>;
  tiles_url_helper:             Signal<string>;
  tiles_tone_label:             Signal<string>;
  tiles_tone_primary:           Signal<string>;
  tiles_tone_secondary:         Signal<string>;
  kicker_label:                 Signal<string>;
  kicker_placeholder:           Signal<string>;
  kicker_helper:                Signal<string>;
  cancel:                       Signal<string>;
}

/**
 * Configuration of a tiles section: kind of tiles, columns, the lines around the title, and the
 * tiles themselves. A stat tile has a value and a caption; a card has an icon, a title, a text and
 * an optional link. A tap on a tile opens its fields inline; its ⋯ button moves or removes it.
 * Only the plain German fields are edited — translations (`*I18n`) are left untouched.
 */
@Component({
  selector: 'okr-tiles-config',
  standalone: true,
  imports: [
    TextInput, TextareaInput, ErrorNote, SvgIconPipe,
    IonCard, IonCardHeader, IonCardTitle, IonCardSubtitle, IonCardContent, IonGrid, IonRow, IonCol,
    IonSelect, IonSelectOption, IonList, IonItem, IonLabel, IonNote, IonButton, IonIcon
  ],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px; } }
    .item-label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .editor { padding: 4px 8px 12px 8px; border-bottom: 1px solid var(--ion-color-light); }
  `],
  template: `
    <ion-card>
      <ion-card-header>
        <ion-card-title>{{ i18n().tiles_title() }}</ion-card-title>
        <ion-card-subtitle>{{ i18n().tiles_subtitle() }}</ion-card-subtitle>
      </ion-card-header>
      <ion-card-content>
        <ion-grid>
          <ion-row>
            <ion-col size="12" size-md="6">
              <ion-select [label]="i18n().tiles_variant_label()" labelPlacement="stacked"
                          [value]="config().variant" [disabled]="readOnly()"
                          (ionChange)="patch({ variant: $event.detail.value })">
                @for (v of variants; track v) {
                  <ion-select-option [value]="v">{{ variantLabels()[v] }}</ion-select-option>
                }
              </ion-select>
            </ion-col>
            <ion-col size="12" size-md="6">
              <ion-select [label]="i18n().tiles_columns_label()" labelPlacement="stacked"
                          [value]="config().columns" [disabled]="readOnly()"
                          (ionChange)="patch({ columns: $event.detail.value })">
                @for (n of columnNumbers; track n) {
                  <ion-select-option [value]="n">{{ n }}</ion-select-option>
                }
              </ion-select>
              <ion-note>{{ i18n().tiles_columns_helper() }}</ion-note>
              <okr-error-note [errors]="errorsFor('tiles.columns')" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <okr-text-input [i18n]="kickerI18n()" [value]="config().kicker ?? ''" (valueChange)="patch({ kicker: $event })"
                              [maxLength]="kickerLength" [readOnly]="readOnly()" [showHelper]="true" />
            </ion-col>
            @if (config().variant === 'card') {
              <ion-col size="12" size-md="6">
                <okr-text-input [i18n]="linkLabelI18n()" [value]="config().linkLabel ?? ''" (valueChange)="patch({ linkLabel: $event })"
                                [maxLength]="linkLabelLength" [readOnly]="readOnly()" [showHelper]="true" />
              </ion-col>
            }
            <ion-col size="12">
              <okr-textarea-input [i18n]="leadI18n()" [value]="config().lead ?? ''" (valueChange)="patch({ lead: $event })"
                                  [maxLength]="textLength" [readOnly]="readOnly()" [showHelper]="true" />
            </ion-col>
          </ion-row>
        </ion-grid>
      </ion-card-content>
    </ion-card>

    <ion-card>
      <ion-card-header>
        <ion-card-title>{{ i18n().tiles_items() }}</ion-card-title>
      </ion-card-header>
      <ion-card-content>
        <ion-list lines="full">
          @for (item of config().items; track $index; let i = $index) {
            <ion-item button="true" [detail]="false" (click)="toggle(i)">
              @if (config().variant === 'card' && item.icon) {
                <ion-icon slot="start" src="{{ item.icon | svgIcon }}" />
              }
              <ion-label class="item-label">{{ itemSummary(item) }}</ion-label>
              @if (!readOnly()) {
                <ion-button slot="end" fill="clear" [attr.aria-label]="i18n().tiles_actions()"
                            (click)="$event.stopPropagation(); showItemActions(i)">
                  <ion-icon slot="icon-only" src="{{ 'menu' | svgIcon }}" />
                </ion-button>
              }
            </ion-item>
            @if (hasItemErrors(i) && !isOpen(i)) {
              <okr-error-note [errors]="itemErrors(i)" />
            }
            @if (isOpen(i)) {
              <div class="editor">
                @if (config().variant === 'stat') {
                  <okr-text-input [i18n]="valueI18n()" [value]="item.value ?? ''" (valueChange)="patchItem(i, { value: $event })"
                                  [maxLength]="valueLength" [readOnly]="readOnly()" [showHelper]="true" />
                  <okr-error-note [errors]="errorsFor(field(i, 'value'))" />
                  <okr-text-input [i18n]="captionI18n()" [value]="item.title ?? ''" (valueChange)="patchItem(i, { title: $event })"
                                  [maxLength]="titleLength" [readOnly]="readOnly()" />
                  <okr-error-note [errors]="errorsFor(field(i, 'title'))" />
                } @else {
                  <okr-text-input [i18n]="iconI18n()" [value]="item.icon ?? ''" (valueChange)="patchItem(i, { icon: $event })"
                                  [maxLength]="iconLength" [readOnly]="readOnly()" [showHelper]="true" />
                  <okr-text-input [i18n]="itemTitleI18n()" [value]="item.title ?? ''" (valueChange)="patchItem(i, { title: $event })"
                                  [maxLength]="titleLength" [readOnly]="readOnly()" />
                  <okr-error-note [errors]="errorsFor(field(i, 'title'))" />
                  <okr-textarea-input [i18n]="textI18n()" [value]="item.text ?? ''" (valueChange)="patchItem(i, { text: $event })"
                                      [maxLength]="textLength" [readOnly]="readOnly()" />
                  <okr-text-input [i18n]="urlI18n()" [value]="item.url ?? ''" (valueChange)="patchItem(i, { url: $event })"
                                  [maxLength]="urlLength" [readOnly]="readOnly()" [showHelper]="true" inputMode="url" />
                }
                <!-- a url set on a stat tile is still validated, so its note shows in both variants -->
                <okr-error-note [errors]="errorsFor(field(i, 'url'))" />
                <ion-select [label]="i18n().tiles_tone_label()" labelPlacement="stacked"
                            [value]="item.tone ?? 'primary'" [disabled]="readOnly()"
                            (ionChange)="patchItem(i, { tone: $event.detail.value })">
                  @for (t of tones; track t) {
                    <ion-select-option [value]="t">{{ toneLabels()[t] }}</ion-select-option>
                  }
                </ion-select>
              </div>
            }
          } @empty {
            <ion-item lines="none"><ion-note>{{ i18n().tiles_empty() }}</ion-note></ion-item>
          }
        </ion-list>
        @if (!readOnly()) {
          <ion-button expand="block" fill="clear" (click)="addItem()">
            <ion-icon slot="start" src="{{ 'add' | svgIcon }}" />
            {{ i18n().tiles_add() }}
          </ion-button>
        }
      </ion-card-content>
    </ion-card>
  `
})
export class TilesConfiguration {
  private readonly actionSheetController = inject(ActionSheetController);
  private readonly imgixBaseUrl = inject(ENV).services.imgixBaseUrl;

  public formData = model.required<TilesConfig>();
  public readonly readOnly = input(true);
  public readonly i18n = input.required<TilesConfigI18n>();
  /** vest field name -> messages of the running section suite (see section.form.ts) */
  public readonly errors = input<SectionErrors>({});

  protected readonly variants = TILE_VARIANTS;
  protected readonly tones = TILE_TONES;
  protected readonly columnNumbers = [1, 2, 3, 4];
  protected readonly kickerLength = LONG_NAME_LENGTH;
  protected readonly linkLabelLength = NAME_LENGTH;
  protected readonly valueLength = NAME_LENGTH;
  protected readonly titleLength = LONG_NAME_LENGTH;
  protected readonly iconLength = NAME_LENGTH;
  protected readonly textLength = COMMENT_LENGTH;
  protected readonly urlLength = URL_LENGTH;

  /** the tile whose fields are open */
  private readonly openItem = signal<number | undefined>(undefined);

  /** older documents lack variant/columns/items: fall back to the defaults */
  protected readonly config = computed(() => withTilesDefaults(this.formData()));

  protected readonly variantLabels = computed<Record<TileVariant, string>>(() => ({
    stat: this.i18n().tiles_variant_stat(), card: this.i18n().tiles_variant_card(),
  }));

  protected readonly toneLabels = computed<Record<TileTone, string>>(() => ({
    primary: this.i18n().tiles_tone_primary(), secondary: this.i18n().tiles_tone_secondary(),
  }));

  protected readonly kickerI18n = computed(() => this.textI18nOf('kicker', 'kicker_label', 'kicker_placeholder', 'kicker_helper'));
  protected readonly leadI18n = computed(() => this.textI18nOf('lead', 'tiles_lead_label', 'tiles_lead_placeholder', 'tiles_lead_helper'));
  protected readonly linkLabelI18n = computed(() => this.textI18nOf('linkLabel', 'tiles_linkLabel_label', 'tiles_linkLabel_placeholder', 'tiles_linkLabel_helper'));
  protected readonly valueI18n = computed(() => this.textI18nOf('value', 'tiles_value_label', 'tiles_value_placeholder', 'tiles_value_helper'));
  protected readonly captionI18n = computed(() => this.textI18nOf('title', 'tiles_caption_label', 'tiles_caption_placeholder'));
  protected readonly itemTitleI18n = computed(() => this.textI18nOf('title', 'tiles_itemTitle_label', 'tiles_itemTitle_placeholder'));
  protected readonly textI18n = computed(() => this.textI18nOf('text', 'tiles_text_label', 'tiles_text_placeholder'));
  protected readonly iconI18n = computed(() => this.textI18nOf('icon', 'tiles_icon_label', 'tiles_icon_placeholder', 'tiles_icon_helper'));
  protected readonly urlI18n = computed(() => this.textI18nOf('url', 'tiles_url_label', 'tiles_url_placeholder', 'tiles_url_helper'));

  private textI18nOf(name: string, label: keyof TilesConfigI18n, placeholder: keyof TilesConfigI18n, helper?: keyof TilesConfigI18n): TextInputI18n {
    const i = this.i18n();
    return { name, label: i[label](), placeholder: i[placeholder](), helper: helper ? i[helper]() : '' };
  }

  /*-------------------------- view helpers --------------------------------*/
  /** what the row shows: value + caption for a stat, the title for a card */
  protected itemSummary(item: TileItem): string {
    if (this.config().variant === 'stat') {
      return [item.value, item.title].filter((s) => !!s?.trim()).join(' · ') || '…';
    }
    return item.title?.trim() || item.icon || '…';
  }

  protected field(index: number, name: keyof TileItem): string {
    return tilesItemField(index, name);
  }

  protected errorsFor(field: string): string[] {
    return getFieldErrors(this.errors(), field);
  }

  /** all messages of one tile, shown under its row while it is closed */
  protected itemErrors(index: number): string[] {
    return (['value', 'title', 'url'] as const).flatMap((name) => this.errorsFor(this.field(index, name)));
  }

  protected hasItemErrors(index: number): boolean {
    return this.itemErrors(index).length > 0;
  }

  protected isOpen(index: number): boolean {
    return this.openItem() === index;
  }

  protected toggle(index: number): void {
    this.openItem.update((open) => (open === index ? undefined : index));
  }

  /*-------------------------- changes --------------------------------*/
  protected patch(changes: Partial<TilesConfig>): void {
    this.formData.set({ ...this.config(), ...changes });
  }

  private setItems(update: (items: TileItem[]) => TileItem[]): void {
    this.patch({ items: update([...this.config().items]) });
  }

  protected patchItem(index: number, changes: Partial<TileItem>): void {
    this.setItems((items) => items.map((item, i) => (i === index ? { ...item, ...changes } : item)));
  }

  private moveItem(index: number, delta: number): void {
    const target = index + delta;
    this.setItems((items) => {
      if (target < 0 || target >= items.length) return items;
      [items[index], items[target]] = [items[target], items[index]];
      return items;
    });
    if (this.isOpen(index)) this.openItem.set(target);
  }

  private removeItem(index: number): void {
    this.setItems((items) => items.filter((_, i) => i !== index));
    this.openItem.set(undefined);
  }

  protected addItem(): void {
    if (this.readOnly()) return;
    const index = this.config().items.length;
    this.setItems((items) => [...items, { tone: 'primary' }]);
    this.openItem.set(index);
  }

  /*-------------------------- action sheet --------------------------------*/
  protected async showItemActions(index: number): Promise<void> {
    if (this.readOnly()) return;
    const i18n = this.i18n();
    const count = this.config().items.length;
    const options: ActionSheetOptions = createActionSheetOptions(i18n.tiles_actions());
    options.buttons.push(createActionSheetButton('item.edit', i18n.tiles_edit(), this.imgixBaseUrl, 'edit'));
    if (index > 0) options.buttons.push(createActionSheetButton('item.up', i18n.tiles_moveUp(), this.imgixBaseUrl, 'chevron-up'));
    if (index < count - 1) options.buttons.push(createActionSheetButton('item.down', i18n.tiles_moveDown(), this.imgixBaseUrl, 'chevron-down'));
    options.buttons.push(createActionSheetButton('item.remove', i18n.tiles_remove(), this.imgixBaseUrl, 'trash'));
    options.buttons.push(createActionSheetButton('cancel', i18n.cancel(), this.imgixBaseUrl, 'cancel-circle'));
    const sheet = await this.actionSheetController.create(options);
    await sheet.present();
    const { data } = await sheet.onDidDismiss();
    switch (data?.action) {
      case 'item.edit': this.openItem.set(index); break;
      case 'item.up': this.moveItem(index, -1); break;
      case 'item.down': this.moveItem(index, 1); break;
      case 'item.remove': this.removeItem(index); break;
    }
  }
}
