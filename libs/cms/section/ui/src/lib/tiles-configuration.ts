import { Component, computed, inject, input, model } from '@angular/core';
import {
  IonButton, IonButtons, IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonCol, IonGrid,
  IonIcon, IonItem, IonLabel, IonList, IonNote, IonReorder, IonReorderGroup, IonRow, IonSelect, IonSelectOption,
  ItemReorderEventDetail, ModalController
} from '@ionic/angular';

import { ColorsIonic } from '@okr/shared-categories';
import { ColorIonic, TILE_LAYOUTS, TILE_SOURCES, TILE_VARIANTS, TileItem, TileLayout, TileVariant, TilesConfig } from '@okr/shared-models';
import { CategoryOld, CategoryOldI18n, Checkbox, CheckboxI18n, ErrorNote, TextInput, TextInputI18n } from '@okr/shared-ui';
import { SvgIconPipe } from '@okr/shared-pipes';
import { getFieldErrors, SECTION_ICON_PICKER, TILE_URL_LENGTH, TILES_LINK_LABEL_LENGTH, TILES_MAX_COLUMNS, SectionErrors, SectionI18n, tilesItemField, withTilesDefaults } from '@okr/cms-section-util';

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
    CategoryOld, Checkbox, ErrorNote, TextInput, SvgIconPipe,
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
            <!-- source 'groups': one card per public group, built at render time (la21staefa Projektgruppen) -->
            <ion-col size="12" size-md="6">
              <ion-select [label]="i18n().tiles_source_label()" labelPlacement="stacked"
                          [value]="config().source ?? 'inline'" [disabled]="readOnly()"
                          (ionChange)="patch({ source: $event.detail.value })">
                @for (v of sources; track v) {
                  <ion-select-option [value]="v">{{ v === 'groups' ? i18n().tiles_source_groups() : i18n().tiles_source_inline() }}</ion-select-option>
                }
              </ion-select>
              <ion-note>{{ i18n().tiles_source_helper() }}</ion-note>
              <okr-error-note [errors]="errorsFor('tiles.source')" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <ion-select [label]="i18n().tiles_layout_label()" labelPlacement="stacked"
                          [value]="config().layout ?? 'grid'" [disabled]="readOnly()"
                          (ionChange)="patch({ layout: $event.detail.value })">
                @for (v of layouts; track v) {
                  <ion-select-option [value]="v">{{ layoutLabels()[v] }}</ion-select-option>
                }
              </ion-select>
              <okr-error-note [errors]="errorsFor('tiles.layout')" />
            </ion-col>
            <!-- a linked title and a coloured section (the SDG goals of a project) -->
            <ion-col size="12" size-md="6">
              <okr-text-input [i18n]="titleUrlI18n()" [value]="config().titleUrl ?? ''" (valueChange)="patch({ titleUrl: $event })"
                [maxLength]="urlLength" [showHelper]="true" [readOnly]="readOnly()" />
              <okr-error-note [errors]="errorsFor('tiles.titleUrl')" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <okr-text-input [i18n]="backgroundI18n()" [value]="config().background ?? ''" (valueChange)="patch({ background: $event })"
                [maxLength]="hexLength" [showHelper]="true" [readOnly]="readOnly()" />
              <okr-error-note [errors]="errorsFor('tiles.background')" />
            </ion-col>
            <!-- a collapsed logo strip (the SDG block): a linked picture and an arrow that opens the tiles -->
            <ion-col size="12">
              <okr-checkbox [i18n]="collapseI18n()" [checked]="!!config().collapse" (checkedChange)="onCollapseToggle($event)"
                            [showHelper]="true" [readOnly]="readOnly()" />
            </ion-col>
            @if (config().collapse; as collapse) {
              <ion-col size="12" size-md="6">
                <okr-text-input [i18n]="collapseImageI18n()" [value]="collapse.imageUrl" (valueChange)="patchCollapse({ imageUrl: $event })"
                  [maxLength]="urlLength" [showHelper]="true" [readOnly]="readOnly()" />
                <okr-error-note [errors]="errorsFor('tiles.collapse.imageUrl')" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <okr-text-input [i18n]="collapseUrlI18n()" [value]="collapse.url" (valueChange)="patchCollapse({ url: $event })"
                  [maxLength]="urlLength" [readOnly]="readOnly()" />
                <okr-error-note [errors]="errorsFor('tiles.collapse.url')" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <okr-text-input [i18n]="collapseAltI18n()" [value]="collapse.label" (valueChange)="patchCollapse({ label: $event })"
                  [maxLength]="linkLabelLength" [readOnly]="readOnly()" />
              </ion-col>
            }
            @if (fromGroups()) {
              <ion-col size="12" size-md="6">
                <okr-text-input [i18n]="linkLabelI18n()" [value]="config().linkLabel ?? ''" (valueChange)="patch({ linkLabel: $event })"
                  [maxLength]="linkLabelLength" [showHelper]="true" [readOnly]="readOnly()" />
                <okr-error-note [errors]="errorsFor('tiles.linkLabel')" />
              </ion-col>
            }
            @if (!fromGroups()) {
            <ion-col size="12" size-md="6">
              <ion-select [label]="i18n().tiles_variant_label()" labelPlacement="stacked"
                          [value]="config().variant" [disabled]="readOnly()"
                          (ionChange)="patch({ variant: $event.detail.value })">
                @for (v of variants; track v) {
                  <ion-select-option [value]="v">{{ variantLabels()[v] }}</ion-select-option>
                }
              </ion-select>
            </ion-col>
            }
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

    @if (!fromGroups()) {
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
    }
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
  protected readonly sources = TILE_SOURCES;
  protected readonly layouts = TILE_LAYOUTS;
  /** kept in step with the cap the Vest suite enforces on this field */
  protected readonly linkLabelLength = TILES_LINK_LABEL_LENGTH;
  protected readonly fromGroups = computed(() => this.config().source === 'groups');
  /** kept in step with the url cap of the tile suite */
  protected readonly urlLength = TILE_URL_LENGTH;
  protected readonly collapseI18n = computed((): CheckboxI18n => ({
    name: 'collapse', label: this.i18n().tiles_collapse_label(), helper: this.i18n().tiles_collapse_helper(),
  }));
  protected readonly collapseImageI18n = computed((): TextInputI18n => ({
    name: 'collapseImage', label: this.i18n().tiles_collapse_image_label(), placeholder: '', helper: this.i18n().tiles_collapse_image_helper(),
  }));
  protected readonly collapseUrlI18n = computed((): TextInputI18n => ({
    name: 'collapseUrl', label: this.i18n().tiles_collapse_url_label(), placeholder: 'https://', helper: '',
  }));
  protected readonly collapseAltI18n = computed((): TextInputI18n => ({
    name: 'collapseAlt', label: this.i18n().tiles_collapse_alt_label(), placeholder: '', helper: '',
  }));

  /** on: an empty strip to fill in; off: the key is removed, the tiles show as always */
  protected onCollapseToggle(on: boolean): void {
    if (on) { this.patch({ collapse: this.config().collapse ?? { imageUrl: '', url: '', label: '' } }); return; }
    const { collapse: _removed, ...rest } = this.config();   // eslint-disable-line @typescript-eslint/no-unused-vars
    this.formData.set(rest as TilesConfig);
  }

  protected patchCollapse(changes: Partial<NonNullable<TilesConfig['collapse']>>): void {
    const current = this.config().collapse ?? { imageUrl: '', url: '', label: '' };
    this.patch({ collapse: { ...current, ...changes } });
  }
  protected readonly layoutLabels = computed<Record<TileLayout, string>>(() => ({
    grid: this.i18n().tiles_layout_grid(), list: this.i18n().tiles_layout_list(), logos: this.i18n().tiles_layout_logos(),
  }));
  /** a css hex colour is at most 7 characters (#rrggbb) */
  protected readonly hexLength = 7;
  protected readonly titleUrlI18n = computed((): TextInputI18n => ({
    name: 'titleUrl', label: this.i18n().tiles_titleUrl_label(), placeholder: 'https://', helper: this.i18n().tiles_titleUrl_helper(),
  }));
  protected readonly backgroundI18n = computed((): TextInputI18n => ({
    name: 'background', label: this.i18n().tiles_background_label(), placeholder: '#976C8B', helper: this.i18n().tiles_background_helper(),
  }));
  protected readonly linkLabelI18n = computed((): TextInputI18n => ({
    name: 'linkLabel', label: this.i18n().tiles_groupLinkLabel_label(), placeholder: '', helper: this.i18n().tiles_groupLinkLabel_helper(),
  }));
  protected readonly columnNumbers = Array.from({ length: TILES_MAX_COLUMNS }, (_, i) => i + 1);
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
