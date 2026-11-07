import { Component, computed, inject, input, model, signal, Signal } from '@angular/core';
import {
  ActionSheetController, ActionSheetOptions, AlertController,
  IonBadge, IonButton, IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonCol, IonGrid,
  IonIcon, IonItem, IonLabel, IonList, IonNote, IonRow, IonSelect, IonSelectOption
} from '@ionic/angular';

import { ENV } from '@okr/shared-config';
import { IMAGE_MIMETYPES } from '@okr/shared-constants';
import {
  FOOTER_ITEM_TYPES, FOOTER_LOGO_HEIGHTS, FOOTER_MAX_COLUMNS, FooterConfig, FooterItem, FooterItemType, FooterLogoHeight, UserModel
} from '@okr/shared-models';
import { Checkbox, CheckboxI18n, ErrorNote, ImgDirective, TextareaInput, TextInput, TextInputI18n } from '@okr/shared-ui';
import { confirm, createActionSheetButton, createActionSheetOptions } from '@okr/shared-util-angular';
import { fill, IMGIX_THUMBNAIL_PARAMS, sanitizeFileName } from '@okr/shared-util-core';
import { UploadService } from '@okr/avatar-data-access';
import { SvgIconPipe } from '@okr/shared-pipes';
import {
  FOOTER_BOTTOM_LINE_LENGTH, FOOTER_LABEL_LENGTH, FOOTER_URL_LENGTH, footerColumnCount, footerItemField, footerLabelLength,
  getFieldErrors, newFooterItem, normalizeFooterConfig, SectionErrors
} from '@okr/cms-section-util';

interface FooterConfigI18n {
  footer_title:                   Signal<string>;
  footer_subtitle:                Signal<string>;
  footer_columnCount:             Signal<string>;
  footer_column:                  Signal<string>;
  footer_columnHidden:            Signal<string>;
  footer_empty:                   Signal<string>;
  footer_add:                     Signal<string>;
  footer_addTitle:                Signal<string>;
  footer_actions:                 Signal<string>;
  footer_edit:                    Signal<string>;
  footer_moveUp:                  Signal<string>;
  footer_moveDown:                Signal<string>;
  footer_remove:                  Signal<string>;
  footer_showBottomLine_label:    Signal<string>;
  footer_showBottomLine_helper:   Signal<string>;
  footer_bottomLine_label:        Signal<string>;
  footer_bottomLine_placeholder:  Signal<string>;
  footer_bottomLine_helper:       Signal<string>;
  footer_type_title:              Signal<string>;
  footer_type_text:               Signal<string>;
  footer_type_link:               Signal<string>;
  footer_type_icon:               Signal<string>;
  footer_type_logo:               Signal<string>;
  footer_itemLabel_title:         Signal<string>;
  footer_itemLabel_text:          Signal<string>;
  footer_itemLabel_link:          Signal<string>;
  footer_itemLabel_icon:          Signal<string>;
  footer_itemLabel_logo:          Signal<string>;
  footer_itemLabel_logoHelper:    Signal<string>;
  footer_url_label:               Signal<string>;
  footer_url_placeholder:         Signal<string>;
  footer_url_helper:              Signal<string>;
  footer_icon_label:              Signal<string>;
  footer_icon_placeholder:        Signal<string>;
  footer_icon_helper:             Signal<string>;
  footer_logo_upload:             Signal<string>;
  footer_logo_replace:            Signal<string>;
  footer_height_label:            Signal<string>;
  footer_height_small:            Signal<string>;
  footer_height_medium:           Signal<string>;
  footer_height_large:            Signal<string>;
  image_upload:                   Signal<string>;
  image_overwrite_message:        Signal<string>;
  ok:                             Signal<string>;
  cancel:                         Signal<string>;
}

/**
 * Configuration of a footer section: column count, the optional bottom line, and one editor per
 * column. The column editors sit side by side on large screens, like the footer itself, and stack
 * below. A tap on an item opens its fields inline; its ⋯ button moves or removes it. Columns beyond
 * the count stay editable but dimmed — their items are kept, only not shown.
 */
@Component({
  selector: 'okr-footer-config',
  standalone: true,
  imports: [
    Checkbox, TextInput, TextareaInput, ErrorNote, ImgDirective, SvgIconPipe,
    IonCard, IonCardHeader, IonCardTitle, IonCardSubtitle, IonCardContent, IonGrid, IonRow, IonCol,
    IonSelect, IonSelectOption, IonList, IonItem, IonLabel, IonNote, IonBadge, IonButton, IonIcon
  ],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px; } }
    .column.hidden { opacity: 0.55; }
    .column ion-card-title { font-size: 1rem; }
    .item-label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    ion-badge { margin-right: 8px; }
    .editor { padding: 4px 8px 12px 8px; border-bottom: 1px solid var(--ion-color-light); }
    .logo-preview { max-height: 48px; width: auto; margin: 8px 0; }
  `],
  template: `
    <ion-card>
      <ion-card-header>
        <ion-card-title>{{ i18n().footer_title() }}</ion-card-title>
        <ion-card-subtitle>{{ i18n().footer_subtitle() }}</ion-card-subtitle>
      </ion-card-header>
      <ion-card-content>
        <ion-grid>
          <ion-row>
            <ion-col size="12" size-md="6">
              <ion-select [label]="i18n().footer_columnCount()" labelPlacement="stacked"
                          [value]="columnCount()" [disabled]="readOnly()"
                          (ionChange)="patch({ columnCount: $event.detail.value })">
                @for (n of columnNumbers; track n) {
                  <ion-select-option [value]="n">{{ n }}</ion-select-option>
                }
              </ion-select>
              <okr-error-note [errors]="errorsFor('footer.columnCount')" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <okr-checkbox [i18n]="showBottomLineI18n()" [checked]="config().showBottomLine"
                            (checkedChange)="patch({ showBottomLine: $event })"
                            [showHelper]="true" [readOnly]="readOnly()" />
            </ion-col>
          </ion-row>
          @if (config().showBottomLine) {
            <ion-row>
              <ion-col size="12">
                <okr-text-input [i18n]="bottomLineI18n()" [value]="config().bottomLine" (valueChange)="patch({ bottomLine: $event })"
                                [maxLength]="bottomLineLength" [readOnly]="readOnly()" [showHelper]="true" />
                <okr-error-note [errors]="errorsFor('footer.bottomLine')" />
              </ion-col>
            </ion-row>
          }
        </ion-grid>
      </ion-card-content>
    </ion-card>

    <ion-grid>
      <ion-row>
        @for (column of config().columns; track $index; let c = $index) {
          <ion-col size="12" size-lg="4">
            <ion-card class="column" [class.hidden]="c >= columnCount()">
              <ion-card-header>
                <ion-card-title>{{ columnTitle(c) }}</ion-card-title>
                @if (c >= columnCount()) { <ion-card-subtitle>{{ i18n().footer_columnHidden() }}</ion-card-subtitle> }
              </ion-card-header>
              <ion-card-content>
                <ion-list lines="full">
                  @for (item of column.items; track $index; let i = $index) {
                    <ion-item button="true" [detail]="false" (click)="toggle(c, i)">
                      <ion-badge slot="start" color="light">{{ typeLabels()[item.type] ?? item.type }}</ion-badge>
                      <ion-label class="item-label">{{ itemSummary(item) }}</ion-label>
                      @if (!readOnly()) {
                        <ion-button slot="end" fill="clear" [attr.aria-label]="i18n().footer_actions()"
                                    (click)="$event.stopPropagation(); showItemActions(c, i)">
                          <ion-icon slot="icon-only" src="{{ 'menu' | svgIcon }}" />
                        </ion-button>
                      }
                    </ion-item>
                    @if (isOpen(c, i)) {
                      <div class="editor">
                        <ion-select [label]="i18n().footer_actions()" labelPlacement="stacked"
                                    [value]="item.type" [disabled]="readOnly()"
                                    (ionChange)="patchItem(c, i, { type: $event.detail.value })">
                          @for (t of itemTypes; track t) {
                            <ion-select-option [value]="t">{{ typeLabels()[t] }}</ion-select-option>
                          }
                        </ion-select>
                        <okr-error-note [errors]="errorsFor(field(c, i, 'type'))" />

                        @if (item.type === 'text') {
                          <okr-textarea-input [i18n]="labelI18n(item)" [value]="item.label" (valueChange)="patchItem(c, i, { label: $event })"
                                              [maxLength]="labelLength(item)" [readOnly]="readOnly()" />
                        } @else {
                          <okr-text-input [i18n]="labelI18n(item)" [value]="item.label" (valueChange)="patchItem(c, i, { label: $event })"
                                          [maxLength]="labelLength(item)" [readOnly]="readOnly()" [showHelper]="item.type === 'logo'" />
                        }
                        <okr-error-note [errors]="errorsFor(field(c, i, 'label'))" />

                        @if (item.type === 'icon') {
                          <okr-text-input [i18n]="iconI18n()" [value]="item.icon" (valueChange)="patchItem(c, i, { icon: $event })"
                                          [maxLength]="iconLength" [readOnly]="readOnly()" [showHelper]="true" />
                          <okr-error-note [errors]="errorsFor(field(c, i, 'icon'))" />
                        }

                        @if (item.type === 'logo') {
                          @if (item.image) {
                            <img okrImg class="logo-preview" [src]="thumbnailUrl(item.image)" [alt]="item.label" />
                          }
                          @if (!readOnly()) {
                            <ion-button size="small" fill="outline" (click)="uploadLogo(c, i)">
                              <ion-icon slot="start" src="{{ 'upload' | svgIcon }}" />
                              {{ item.image ? i18n().footer_logo_replace() : i18n().footer_logo_upload() }}
                            </ion-button>
                          }
                          <okr-error-note [errors]="errorsFor(field(c, i, 'image'))" />
                          <ion-select [label]="i18n().footer_height_label()" labelPlacement="stacked"
                                      [value]="item.height" [disabled]="readOnly()"
                                      (ionChange)="patchItem(c, i, { height: $event.detail.value })">
                            @for (h of logoHeights; track h) {
                              <ion-select-option [value]="h">{{ heightLabels()[h] }}</ion-select-option>
                            }
                          </ion-select>
                          <okr-error-note [errors]="errorsFor(field(c, i, 'height'))" />
                        }

                        @if (item.type === 'link' || item.type === 'icon' || item.type === 'logo') {
                          <okr-text-input [i18n]="urlI18n()" [value]="item.url" (valueChange)="patchItem(c, i, { url: $event })"
                                          [maxLength]="urlLength" [readOnly]="readOnly()" [showHelper]="true" inputMode="url" />
                          <okr-error-note [errors]="errorsFor(field(c, i, 'url'))" />
                        }
                      </div>
                    }
                  } @empty {
                    <ion-item lines="none"><ion-note>{{ i18n().footer_empty() }}</ion-note></ion-item>
                  }
                </ion-list>
                @if (!readOnly()) {
                  <ion-button expand="block" fill="clear" (click)="addItem(c)">
                    <ion-icon slot="start" src="{{ 'add' | svgIcon }}" />
                    {{ i18n().footer_add() }}
                  </ion-button>
                }
              </ion-card-content>
            </ion-card>
          </ion-col>
        }
      </ion-row>
    </ion-grid>
  `
})
export class FooterConfiguration {
  private readonly env = inject(ENV);
  private readonly uploadService = inject(UploadService);
  private readonly actionSheetController = inject(ActionSheetController);
  private readonly alertController = inject(AlertController);
  private readonly imgixBaseUrl = this.env.services.imgixBaseUrl;

  public formData = model.required<FooterConfig>();
  public readonly readOnly = input(true);
  public readonly i18n = input.required<FooterConfigI18n>();
  /** vest field name -> messages of the running section suite (see section.form.ts) */
  public readonly errors = input<SectionErrors>({});
  // logo upload context
  public readonly storagePath = input.required<string>();
  public readonly tenantId = input.required<string>();
  public readonly currentUser = input<UserModel | undefined>();

  protected readonly columnNumbers = Array.from({ length: FOOTER_MAX_COLUMNS }, (_, i) => i + 1);
  protected readonly itemTypes = FOOTER_ITEM_TYPES;
  protected readonly logoHeights = FOOTER_LOGO_HEIGHTS;
  protected readonly bottomLineLength = FOOTER_BOTTOM_LINE_LENGTH;
  protected readonly iconLength = FOOTER_LABEL_LENGTH;
  protected readonly urlLength = FOOTER_URL_LENGTH;

  /** the item whose fields are open, as 'column:index' */
  private readonly openItem = signal<string | undefined>(undefined);

  /** always three columns and complete items, whatever the stored document holds */
  protected readonly config = computed(() => normalizeFooterConfig(this.formData()));
  protected readonly columnCount = computed(() => footerColumnCount(this.config()));

  protected readonly typeLabels = computed<Record<FooterItemType, string>>(() => {
    const i = this.i18n();
    return {
      title: i.footer_type_title(), text: i.footer_type_text(), link: i.footer_type_link(),
      icon: i.footer_type_icon(), logo: i.footer_type_logo(),
    };
  });

  protected readonly heightLabels = computed<Record<FooterLogoHeight, string>>(() => {
    const i = this.i18n();
    return { small: i.footer_height_small(), medium: i.footer_height_medium(), large: i.footer_height_large() };
  });

  protected readonly showBottomLineI18n = computed(() => ({
    name: 'showBottomLine', label: this.i18n().footer_showBottomLine_label(), helper: this.i18n().footer_showBottomLine_helper(),
  } as CheckboxI18n));

  protected readonly bottomLineI18n = computed(() => ({
    name: 'bottomLine', label: this.i18n().footer_bottomLine_label(),
    placeholder: this.i18n().footer_bottomLine_placeholder(), helper: this.i18n().footer_bottomLine_helper(),
  } as TextInputI18n));

  protected readonly urlI18n = computed(() => ({
    name: 'url', label: this.i18n().footer_url_label(),
    placeholder: this.i18n().footer_url_placeholder(), helper: this.i18n().footer_url_helper(),
  } as TextInputI18n));

  protected readonly iconI18n = computed(() => ({
    name: 'icon', label: this.i18n().footer_icon_label(),
    placeholder: this.i18n().footer_icon_placeholder(), helper: this.i18n().footer_icon_helper(),
  } as TextInputI18n));

  private readonly itemLabels = computed<Record<FooterItemType, string>>(() => {
    const i = this.i18n();
    return {
      title: i.footer_itemLabel_title(), text: i.footer_itemLabel_text(), link: i.footer_itemLabel_link(),
      icon: i.footer_itemLabel_icon(), logo: i.footer_itemLabel_logo(),
    };
  });

  /*-------------------------- view helpers --------------------------------*/
  protected columnTitle(column: number): string {
    return fill(this.i18n().footer_column(), { n: column + 1 });
  }

  protected labelI18n(item: FooterItem): TextInputI18n {
    return {
      name: 'label',
      label: this.itemLabels()[item.type] ?? this.itemLabels().text,
      placeholder: '',
      helper: item.type === 'logo' ? this.i18n().footer_itemLabel_logoHelper() : '',
    };
  }

  protected labelLength(item: FooterItem): number {
    return footerLabelLength(item);
  }

  /** what the row shows: the label, else the icon name or the logo's file name */
  protected itemSummary(item: FooterItem): string {
    return item.label || item.icon || item.image.split('/').pop() || '…';
  }

  protected thumbnailUrl(path: string): string {
    if (path.startsWith('http')) return path;
    return `${this.imgixBaseUrl}/${path}?${IMGIX_THUMBNAIL_PARAMS}`;
  }

  protected field(column: number, index: number, name: keyof FooterItem): string {
    return footerItemField(column, index, name);
  }

  /** messages of a single field, for the inline <okr-error-note> */
  protected errorsFor(field: string): string[] {
    return getFieldErrors(this.errors(), field);
  }

  protected isOpen(column: number, index: number): boolean {
    return this.openItem() === `${column}:${index}`;
  }

  protected toggle(column: number, index: number): void {
    const key = `${column}:${index}`;
    this.openItem.update(open => (open === key ? undefined : key));
  }

  /*-------------------------- changes --------------------------------*/
  protected patch(changes: Partial<FooterConfig>): void {
    this.formData.set({ ...this.config(), ...changes });
  }

  private setItems(column: number, update: (items: FooterItem[]) => FooterItem[]): void {
    const columns = this.config().columns.map((col, c) => (c === column ? { items: update([...col.items]) } : col));
    this.patch({ columns });
  }

  protected patchItem(column: number, index: number, changes: Partial<FooterItem>): void {
    this.setItems(column, items => items.map((item, i) => (i === index ? { ...item, ...changes } : item)));
  }

  private moveItem(column: number, index: number, delta: number): void {
    const target = index + delta;
    this.setItems(column, items => {
      if (target < 0 || target >= items.length) return items;
      [items[index], items[target]] = [items[target], items[index]];
      return items;
    });
    if (this.isOpen(column, index)) this.openItem.set(`${column}:${target}`);
  }

  private removeItem(column: number, index: number): void {
    this.setItems(column, items => items.filter((_, i) => i !== index));
    this.openItem.set(undefined);
  }

  /*-------------------------- action sheets --------------------------------*/
  protected async addItem(column: number): Promise<void> {
    if (this.readOnly()) return;
    const options: ActionSheetOptions = createActionSheetOptions(this.i18n().footer_addTitle());
    for (const type of FOOTER_ITEM_TYPES) {
      options.buttons.push(createActionSheetButton(type, this.typeLabels()[type], this.imgixBaseUrl, 'add'));
    }
    options.buttons.push(createActionSheetButton('cancel', this.i18n().cancel(), this.imgixBaseUrl, 'cancel-circle'));
    const sheet = await this.actionSheetController.create(options);
    await sheet.present();
    const { data } = await sheet.onDidDismiss();
    const type = data?.action as FooterItemType | undefined;
    if (!type || !FOOTER_ITEM_TYPES.includes(type)) return;
    const index = this.config().columns[column].items.length;
    this.setItems(column, items => [...items, newFooterItem(type)]);
    this.openItem.set(`${column}:${index}`);
  }

  protected async showItemActions(column: number, index: number): Promise<void> {
    if (this.readOnly()) return;
    const i18n = this.i18n();
    const count = this.config().columns[column].items.length;
    const options: ActionSheetOptions = createActionSheetOptions(i18n.footer_actions());
    options.buttons.push(createActionSheetButton('item.edit', i18n.footer_edit(), this.imgixBaseUrl, 'edit'));
    if (index > 0) options.buttons.push(createActionSheetButton('item.up', i18n.footer_moveUp(), this.imgixBaseUrl, 'chevron-up'));
    if (index < count - 1) options.buttons.push(createActionSheetButton('item.down', i18n.footer_moveDown(), this.imgixBaseUrl, 'chevron-down'));
    options.buttons.push(createActionSheetButton('item.remove', i18n.footer_remove(), this.imgixBaseUrl, 'trash'));
    options.buttons.push(createActionSheetButton('cancel', i18n.cancel(), this.imgixBaseUrl, 'cancel-circle'));
    const sheet = await this.actionSheetController.create(options);
    await sheet.present();
    const { data } = await sheet.onDidDismiss();
    switch (data?.action) {
      case 'item.edit': this.openItem.set(`${column}:${index}`); break;
      case 'item.up': this.moveItem(column, index, -1); break;
      case 'item.down': this.moveItem(column, index, 1); break;
      case 'item.remove': this.removeItem(column, index); break;
    }
  }

  protected async uploadLogo(column: number, index: number): Promise<void> {
    if (this.readOnly()) return;
    const current = this.config().columns[column].items[index];
    if (current?.image) {
      const ok = await confirm(this.alertController, this.i18n().image_overwrite_message(), this.i18n().ok(), this.i18n().cancel(), true);
      if (ok !== true) return;
    }
    const file = await this.uploadService.pickFile(IMAGE_MIMETYPES);
    if (!file) return;
    const fullPath = `${this.storagePath()}/${sanitizeFileName(file.name)}`;
    const downloadUrl = await this.uploadService.uploadFile(file, fullPath, this.i18n().image_upload());
    if (!downloadUrl) return;
    await this.uploadService.createAndSaveDocument(file, this.tenantId(), fullPath, downloadUrl, this.currentUser());
    this.patchItem(column, index, {
      image: fullPath,
      // seed the alt text from the file name; the admin can refine it
      label: current?.label || file.name.replace(/\.[^.]+$/, ''),
    });
  }
}
