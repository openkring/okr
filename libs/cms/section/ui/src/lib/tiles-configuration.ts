import { Component, computed, inject, input, model } from '@angular/core';
import {
  IonButton, IonButtons, IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonCol, IonGrid,
  IonIcon, IonItem, IonLabel, IonList, IonNote, IonReorder, IonReorderGroup, IonRow, IonSelect, IonSelectOption,
  ItemReorderEventDetail, ModalController
} from '@ionic/angular';

import { ColorsIonic } from '@okr/shared-categories';
import { ColorIonic, TILE_VARIANTS, TileItem, TileVariant, TilesConfig } from '@okr/shared-models';
import { CategoryOld, CategoryOldI18n, ErrorNote } from '@okr/shared-ui';
import { SvgIconPipe } from '@okr/shared-pipes';
import { getFieldErrors, SECTION_ICON_PICKER, SectionErrors, SectionI18n, tilesItemField, withTilesDefaults } from '@okr/cms-section-util';

import { TileEditModal } from './tile-edit.modal';

/**
 * Configuration of a tiles section: kind of tiles, columns, the section colour and the tiles themselves.
 * The lines around the grid are the section's own title, subTitle and intro (section-configuration).
 * A tap on a tile opens it in the tile edit modal; the handle reorders it, the cancel icon removes it.
 */
@Component({
  selector: 'okr-tiles-config',
  standalone: true,
  imports: [
    CategoryOld, ErrorNote, SvgIconPipe,
    IonCard, IonCardHeader, IonCardTitle, IonCardSubtitle, IonCardContent, IonGrid, IonRow, IonCol,
    IonSelect, IonSelectOption, IonList, IonItem, IonLabel, IonNote, IonButtons, IonButton, IonIcon,
    IonReorderGroup, IonReorder
  ],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px; } }
    .list-header { display: flex; justify-content: space-between; align-items: center; }
    .item-label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .tone-primary { color: var(--ion-color-primary); }
    .tone-secondary { color: var(--ion-color-secondary); }
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
              <okr-category-old [i18n]="colorI18n()" [value]="color()" (valueChange)="color.set($event)" [categories]="colors" [readOnly]="readOnly()" />
              <okr-error-note [errors]="errorsFor('color')" />
            </ion-col>
          </ion-row>
        </ion-grid>
      </ion-card-content>
    </ion-card>

    <ion-card>
      <ion-card-header>
        <div class="list-header">
          <ion-card-title>{{ i18n().tiles_items() }}</ion-card-title>
          @if (!readOnly()) {
            <ion-buttons>
              <ion-button (click)="addItem()" [attr.aria-label]="i18n().tiles_add()">
                <ion-icon slot="icon-only" src="{{ 'add-circle' | svgIcon }}" />
              </ion-button>
            </ion-buttons>
          }
        </div>
      </ion-card-header>
      <ion-card-content class="ion-no-padding">
        <ion-list lines="inset">
          @if (config().items.length === 0) {
            <ion-item lines="none"><ion-label color="medium">{{ i18n().tiles_empty() }}</ion-label></ion-item>
          } @else {
            <!-- Casting $event to $any is a temporary fix for https://github.com/ionic-team/ionic-framework/issues/24245 -->
            <ion-reorder-group [disabled]="readOnly()" (ionItemReorder)="reorder($any($event))">
              @for (item of config().items; track $index; let i = $index) {
                <ion-item [button]="!readOnly()" [detail]="false" (click)="editItem(i)">
                  @if (!readOnly()) {
                    <ion-reorder slot="start" />
                  }
                  @if (config().variant === 'card' && item.icon) {
                    <ion-icon slot="start" [class]="'tone-' + (item.tone ?? 'primary')" src="{{ item.icon | svgIcon }}" />
                  }
                  <ion-label class="item-label">
                    {{ itemSummary(item) }}
                    @if (hasItemErrors(i)) {
                      <okr-error-note [errors]="itemErrors(i)" />
                    }
                  </ion-label>
                  @if (!readOnly()) {
                    <ion-button slot="end" fill="clear" color="medium" [attr.aria-label]="i18n().tiles_remove()"
                                (click)="$event.stopPropagation(); removeItem(i)">
                      <ion-icon slot="icon-only" src="{{ 'cancel-circle' | svgIcon }}" />
                    </ion-button>
                  }
                </ion-item>
              }
            </ion-reorder-group>
          }
        </ion-list>
      </ion-card-content>
    </ion-card>
  `
})
export class TilesConfiguration {
  private readonly modalController = inject(ModalController);
  /** provided by the section edit modal; without it the icon name is typed by hand */
  private readonly iconPicker = inject(SECTION_ICON_PICKER, { optional: true });

  public formData = model.required<TilesConfig>();
  /** the section's own colour (BaseSection.color): the accent of the subtitle line above the title */
  public color = model<ColorIonic>(ColorIonic.Primary);
  public readonly readOnly = input(true);
  public readonly i18n = input.required<SectionI18n>();
  /** vest field name -> messages of the running section suite (see section.form.ts) */
  public readonly errors = input<SectionErrors>({});

  protected readonly variants = TILE_VARIANTS;
  protected readonly columnNumbers = [1, 2, 3, 4];
  protected readonly colors = ColorsIonic;

  /** older documents lack variant/columns/items: fall back to the defaults */
  protected readonly config = computed(() => withTilesDefaults(this.formData()));

  protected readonly variantLabels = computed<Record<TileVariant, string>>(() => ({
    stat: this.i18n().tiles_variant_stat(), card: this.i18n().tiles_variant_card(), image: this.i18n().tiles_variant_image(),
  }));

  protected readonly colorI18n = computed(() => ({
    name: 'color', label: this.i18n().tiles_color_label(), helper: this.i18n().tiles_color_helper(),
  } as CategoryOldI18n));

  /*-------------------------- view helpers --------------------------------*/
  /** what the row shows: value + caption for a stat, the title for a card */
  protected itemSummary(item: TileItem): string {
    if (this.config().variant === 'stat') {
      return [item.value, item.title].filter((s) => !!s?.trim()).join(' · ') || '…';
    }
    return item.title?.trim() || item.icon || '…';
  }

  protected errorsFor(field: string): string[] {
    return getFieldErrors(this.errors(), field);
  }

  /** all messages of one tile, shown under its row */
  protected itemErrors(index: number): string[] {
    return (['value', 'title', 'url'] as const).flatMap((name) => this.errorsFor(tilesItemField(index, name)));
  }

  protected hasItemErrors(index: number): boolean {
    return this.itemErrors(index).length > 0;
  }

  /*-------------------------- changes --------------------------------*/
  protected patch(changes: Partial<TilesConfig>): void {
    this.formData.set({ ...this.config(), ...changes });
  }

  private setItems(update: (items: TileItem[]) => TileItem[]): void {
    this.patch({ items: update([...this.config().items]) });
  }

  protected reorder(ev: CustomEvent<ItemReorderEventDetail>): void {
    this.setItems((items) => ev.detail.complete(items));
  }

  protected removeItem(index: number): void {
    if (this.readOnly()) return;
    this.setItems((items) => items.filter((_, i) => i !== index));
  }

  protected async addItem(): Promise<void> {
    if (this.readOnly()) return;
    const tile = await this.openTile({ tone: 'primary' });
    if (tile) this.setItems((items) => [...items, tile]);
  }

  protected async editItem(index: number): Promise<void> {
    if (this.readOnly()) return;
    const current = this.config().items[index];
    if (!current) return;
    const tile = await this.openTile(current);
    if (tile) this.setItems((items) => items.map((item, i) => (i === index ? tile : item)));
  }

  /** opens the tile edit modal; resolves to the edited tile, or undefined when it was closed without saving */
  private async openTile(tile: TileItem): Promise<TileItem | undefined> {
    const modal = await this.modalController.create({
      component: TileEditModal,
      componentProps: {
        tile,
        variant: this.config().variant,
        readOnly: this.readOnly(),
        i18n: this.i18n(),
        iconPicker: this.iconPicker ?? undefined,
      },
    });
    await modal.present();
    const { data, role } = await modal.onWillDismiss();
    return role === 'confirm' && data ? (data as TileItem) : undefined;
  }
}
