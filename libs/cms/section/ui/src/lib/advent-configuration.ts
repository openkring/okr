import { Component, computed, inject, input, model } from '@angular/core';
import {
  ActionSheetController, ActionSheetOptions, AlertController,
  IonButton, IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonCol, IonGrid,
  IonIcon, IonItem, IonLabel, IonList, IonNote, IonRow, IonThumbnail, ModalController
} from '@ionic/angular';

import { ENV } from '@okr/shared-config';
import { IMAGE_MIMETYPES } from '@okr/shared-constants';
import { AdventConfig, AdventDoor, IMAGE_CONFIG_SHAPE, ImageConfig, ImageType, UserModel } from '@okr/shared-models';
import { Checkbox, CheckboxI18n, ErrorNote, ImgDirective, NumberInput, NumberInputI18n, StringSelect, StringSelectI18n } from '@okr/shared-ui';
import { confirm, createActionSheetButton, createActionSheetOptions } from '@okr/shared-util-angular';
import { fill, IMGIX_THUMBNAIL_PARAMS, sanitizeFileName } from '@okr/shared-util-core';
import { UploadService } from '@okr/avatar-data-access';
import { SvgIconPipe } from '@okr/shared-pipes';
import {
  ADVENT_MAX_YEAR, ADVENT_MIN_YEAR, adventImageName, getFieldErrors, newAdventSeed, rearrangeAdventDoors,
  resolveAdventBackground, SectionErrors, SectionI18n
} from '@okr/cms-section-util';

import { ImageEditModal } from './image-edit.modal';
import { ImagesConfiguration } from './images-configuration';

/**
 * Configuration of the Advent calendar section (spec 1.119): year and title toggle, the sortable
 * background images (the existing images config) with a background choice, and the 25 doors.
 */
@Component({
  selector: 'okr-advent-config',
  standalone: true,
  imports: [
    Checkbox, NumberInput, StringSelect, ErrorNote, ImgDirective, ImagesConfiguration, SvgIconPipe,
    IonCard, IonCardHeader, IonCardTitle, IonCardSubtitle, IonCardContent, IonGrid, IonRow, IonCol,
    IonList, IonItem, IonLabel, IonNote, IonThumbnail, IonButton, IonIcon
  ],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px;} }
    .day { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%;
      font-size: 1.4rem; font-weight: 700; background: var(--ion-color-light); border-radius: 4px; }
    .door-meta { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  `],
  template: `
    <ion-card>
      <ion-card-header>
        <ion-card-title>{{ i18n().advent_title() }}</ion-card-title>
        <ion-card-subtitle>{{ i18n().advent_subtitle() }}</ion-card-subtitle>
      </ion-card-header>
      <ion-card-content class="ion-no-padding">
        <ion-grid>
          <ion-row>
            <ion-col size="12" size-md="6">
              <okr-number-input [i18n]="yearI18n()" [value]="year()" (valueChange)="onYearChange($event)"
                [integer]="true" [min]="minYear" [max]="maxYear" [showHelper]="true" [readOnly]="readOnly()" />
              <okr-error-note [errors]="errorsFor('adventYear')" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <okr-checkbox [i18n]="showTitleI18n()" [checked]="showTitle()" (checkedChange)="onShowTitleChange($event)"
                [showHelper]="true" [readOnly]="readOnly()" />
            </ion-col>
          </ion-row>
        </ion-grid>
      </ion-card-content>
    </ion-card>

    <okr-images-config
      [images]="backgrounds()" (imagesChange)="onBackgroundsChange($event)"
      [storagePath]="storagePath()"
      [currentUser]="currentUser()"
      [readOnly]="readOnly()"
      [i18n]="backgroundsI18n()"
      [errors]="errors()"
    />
    @if(backgrounds().length > 1) {
      <ion-card>
        <ion-card-content class="ion-no-padding">
          <okr-string-select [i18n]="backgroundI18n()" [stringList]="backgroundUrls()" [labels]="backgroundNames()"
            [selectedString]="selectedBackgroundUrl()" (selectedStringChange)="onBackgroundUrlChange($event)"
            [readOnly]="readOnly()" />
        </ion-card-content>
      </ion-card>
    }

    <ion-card>
      <ion-card-header>
        <ion-card-title>{{ i18n().advent_doors_title() }}</ion-card-title>
        <ion-card-subtitle>{{ i18n().advent_doors_subtitle() }}</ion-card-subtitle>
      </ion-card-header>
      <ion-card-content class="ion-no-padding">
        @if(!readOnly()) {
          <ion-item lines="none">
            <ion-button fill="clear" (click)="rearrange()">
              <ion-icon slot="start" src="{{'reload' | svgIcon }}" />
              {{ i18n().advent_rearrange() }}
            </ion-button>
          </ion-item>
          <ion-item lines="none">
            <ion-note>{{ i18n().advent_rearrange_helper() }}</ion-note>
          </ion-item>
        }
        <okr-error-note [errors]="errorsFor('adventDoors')" />
        <ion-list lines="inset">
          @for(door of sortedDoors(); track door.day) {
            <ion-item [button]="!readOnly()" (click)="showDoorActions(door)">
              <ion-thumbnail slot="start">
                @if(door.image.url) {
                  <img okrImg [src]="thumbnailUrl(door.image)" [alt]="doorLabel(door.day)" />
                } @else {
                  <div class="day">{{ door.day }}</div>
                }
              </ion-thumbnail>
              <ion-label>
                <h3>{{ doorLabel(door.day) }}</h3>
                <p class="door-meta">{{ doorMeta(door) }}</p>
              </ion-label>
            </ion-item>
          }
        </ion-list>
      </ion-card-content>
    </ion-card>
  `
})
export class AdventConfiguration {
  private readonly env = inject(ENV);
  private readonly uploadService = inject(UploadService);
  private readonly modalController = inject(ModalController);
  private readonly actionSheetController = inject(ActionSheetController);
  private readonly alertController = inject(AlertController);

  // inputs
  public formData = model.required<AdventConfig>();
  public readonly storagePath = input.required<string>();
  public readonly currentUser = input<UserModel | undefined>();
  public readonly tenantId = input.required<string>();
  public readonly readOnly = input(true);
  public readonly i18n = input.required<SectionI18n>();
  /** vest field name -> messages of the running section suite (see section.form.ts) */
  public readonly errors = input<SectionErrors>({});

  // constants
  protected readonly minYear = ADVENT_MIN_YEAR;
  protected readonly maxYear = ADVENT_MAX_YEAR;
  private readonly imgixBaseUrl = this.env.services.imgixBaseUrl;

  // derived values
  protected year = computed(() => this.formData()?.year ?? new Date().getFullYear());
  protected showTitle = computed(() => this.formData()?.showTitle ?? true);
  protected backgrounds = computed(() => this.formData()?.backgrounds ?? []);
  protected backgroundUrls = computed(() => this.backgrounds().map(img => img.url));
  protected backgroundNames = computed(() => this.backgrounds().map(img => adventImageName(img)));
  protected selectedBackgroundUrl = computed(() => resolveAdventBackground(this.backgrounds(), this.formData()?.backgroundUrl)?.url ?? '');
  protected sortedDoors = computed(() => [...(this.formData()?.doors ?? [])].sort((a, b) => a.day - b.day));

  // i18n adapters for the shared/ui primitives
  protected yearI18n = computed(() => ({
    name: 'adventYear',
    label: this.i18n().advent_year_label(),
    placeholder: this.i18n().advent_year_placeholder(),
    helper: this.i18n().advent_year_helper(),
  } as NumberInputI18n));
  protected showTitleI18n = computed(() => ({
    name: 'showTitle',
    label: this.i18n().advent_showTitle_label(),
    helper: this.i18n().advent_showTitle_helper(),
  } as CheckboxI18n));
  protected backgroundI18n = computed(() => ({
    name: 'backgroundUrl',
    label: this.i18n().advent_background_label(),
    helper: this.i18n().advent_background_helper(),
  } as StringSelectI18n));
  /** the images config titles its card with image_edit_title_modal; here it lists the backgrounds */
  protected backgroundsI18n = computed(() => ({ ...this.i18n(), image_edit_title_modal: this.i18n().advent_backgrounds_title } as SectionI18n));

  protected errorsFor(field: string): string[] {
    return getFieldErrors(this.errors(), field);
  }

  protected doorLabel(day: number): string {
    return fill(this.i18n().advent_door(), { d: day });
  }

  protected doorMeta(door: AdventDoor): string {
    if (!door.image.url) return this.i18n().advent_door_empty();
    return [door.image.overlay, door.image.actionUrl].filter(s => !!s?.trim()).join(' · ') || adventImageName(door.image);
  }

  protected thumbnailUrl(img: ImageConfig): string {
    const url = img.url ?? '';
    if (!url || url.startsWith('http')) return url;
    return `${this.imgixBaseUrl}/${url}?${IMGIX_THUMBNAIL_PARAMS}`;
  }

  /*-------------------------- changes --------------------------------*/
  private patch(changes: Partial<AdventConfig>): void {
    this.formData.update(config => ({ ...config, ...changes }));
  }

  protected onYearChange(year: number): void {
    this.patch({ year });
  }

  protected onShowTitleChange(showTitle: boolean): void {
    this.patch({ showTitle });
  }

  protected onBackgroundsChange(backgrounds: ImageConfig[]): void {
    this.patch({ backgrounds });
  }

  protected onBackgroundUrlChange(backgroundUrl: string): void {
    this.patch({ backgroundUrl });
  }

  protected rearrange(): void {
    if (this.readOnly()) return;
    const layoutSeed = newAdventSeed();
    this.patch({ layoutSeed, doors: rearrangeAdventDoors(this.formData().doors ?? [], layoutSeed) });
  }

  private setDoorImage(day: number, image: ImageConfig): void {
    this.patch({ doors: (this.formData().doors ?? []).map(door => door.day === day ? { ...door, image } : door) });
  }

  /*-------------------------- door actions --------------------------------*/
  protected async showDoorActions(door: AdventDoor): Promise<void> {
    if (this.readOnly()) return;
    const i18n = this.i18n();
    const options: ActionSheetOptions = createActionSheetOptions(this.doorLabel(door.day));
    options.buttons.push(createActionSheetButton('door.upload', i18n.advent_door_upload(), this.imgixBaseUrl, 'upload'));
    if (door.image.url) {
      options.buttons.push(createActionSheetButton('door.edit', i18n.image_edit_title(), this.imgixBaseUrl, 'edit'));
      options.buttons.push(createActionSheetButton('door.remove', i18n.advent_door_remove(), this.imgixBaseUrl, 'trash'));
    }
    options.buttons.push(createActionSheetButton('cancel', i18n.cancel(), this.imgixBaseUrl, 'cancel-circle'));

    const sheet = await this.actionSheetController.create(options);
    await sheet.present();
    const { data } = await sheet.onDidDismiss();
    if (!data) return;
    switch (data.action) {
      case 'door.upload': await this.uploadDoorImage(door); break;
      case 'door.edit': await this.editDoorImage(door); break;
      case 'door.remove': this.setDoorImage(door.day, { ...IMAGE_CONFIG_SHAPE, label: String(door.day) }); break;
    }
  }

  private async uploadDoorImage(door: AdventDoor): Promise<void> {
    if (door.image.url) {
      const ok = await confirm(this.alertController, this.i18n().image_overwrite_message(), this.i18n().ok(), this.i18n().cancel(), true);
      if (ok !== true) return;
    }
    const file = await this.uploadService.pickFile(IMAGE_MIMETYPES);
    if (!file) return;
    const fullPath = `${this.storagePath()}/${sanitizeFileName(file.name)}`;
    const downloadUrl = await this.uploadService.uploadFile(file, fullPath, this.i18n().image_upload());
    if (!downloadUrl) return;
    const documentKey = await this.uploadService.createAndSaveDocument(file, this.tenantId(), fullPath, downloadUrl, this.currentUser());
    this.setDoorImage(door.day, {
      ...door.image, // keeps a text overlay and a link entered before the upload
      url: fullPath,
      label: String(door.day),
      altText: file.name.replace(/\.[^.]+$/, ''),
      type: ImageType.Image,
      documentKey: documentKey ?? '',
      credit: await this.uploadService.readImageCredit(fullPath),
    });
  }

  private async editDoorImage(door: AdventDoor): Promise<void> {
    const modal = await this.modalController.create({
      component: ImageEditModal,
      componentProps: {
        formData: { ...door.image },
        readOnly: this.readOnly(),
        i18n: this.i18n(),
      },
    });
    await modal.present();
    const { data, role } = await modal.onWillDismiss();
    if (role === 'confirm' && data) this.setDoorImage(door.day, data as ImageConfig);
  }
}
