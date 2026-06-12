import { Component, computed, effect, inject, input, linkedSignal, model, output } from '@angular/core';
import { IonCard, IonCardContent, IonCol, IonGrid, IonIcon, IonItem, IonRow, ToastController } from '@ionic/angular/standalone';

import { CategoryListModel, DocumentModel, RoleName, UserModel } from '@bk2/shared-models';
import { CategorySelect, Chips, DateInput, DateInputI18n, NotesInput, NotesInputI18n, TextInput, TextInputI18n } from '@bk2/shared-ui';
import { coerceBoolean, hasRole } from '@bk2/shared-util-core';
import { DEFAULT_DATE, DEFAULT_NOTES, DEFAULT_TAGS } from '@bk2/shared-constants';
import { FileLogoPipe, SvgIconPipe, ThumbnailUrlPipe } from '@bk2/shared-pipes';
import { copyToClipboard, showToast } from '@bk2/shared-util-angular';
import { ENV } from '@bk2/shared-config';

import { DocumentI18n, documentValidations } from '@bk2/document-util';

@Component({
  selector: 'bk-document-form',
  standalone: true,
  imports: [
    SvgIconPipe, ThumbnailUrlPipe, FileLogoPipe,
    TextInput, DateInput, CategorySelect, Chips, NotesInput,
    IonGrid, IonRow, IonCol, IonCard, IonCardContent, IonIcon, IonItem
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    @if (showForm()) {
      <form novalidate>

      <ion-card>
        <ion-card-content class="ion-no-padding">
          <ion-grid>
            <ion-row>
              <ion-col size="12" class="ion-text-center" (click)="download()">
                @if(mimeType().startsWith('image/') || mimeType() === 'application/pdf') {
                  <img [src]="fullPath() | thumbnailUrl" [alt]="altText()" style="max-width: 100%; max-height: 300px; object-fit: contain; border-radius: 4px;" />
                } @else {
                  <ion-icon style="width: 80px; height: 80px;" src="{{ fullPath() | fileLogo }}" />
                }
              </ion-col>
            </ion-row>
            <ion-row>
              @if(hasRole('admin')) {
                <ion-col size="12" size-md="6">
                  <bk-text-input [i18n]="bkeyI18n()" [value]="bkey()" [readOnly]="true" [copyable]="true" />
                </ion-col>
              }
              <ion-col size="12" >
                  <ion-icon src="{{ 'download' | svgIcon }}" slot="start" (click)="download()" />
                  <bk-text-input [i18n]="fullPathI18n()" [value]="fullPath()" (valueChange)="onFieldChange('fullPath', $event)" [maxLength]=300 [readOnly]="true" [copyable]="true"/>
              </ion-col>
              <ion-col size="12">
                <bk-text-input [i18n]="titleI18n()" [value]="title()" (valueChange)="onFieldChange('title', $event)" [autofocus]="true" [maxLength]=50 [readOnly]="isReadOnly()" />
              </ion-col>

              <ion-col size="12">
                <bk-text-input [i18n]="altTextI18n()" [value]="altText()" (valueChange)="onFieldChange('altText', $event)" [maxLength]=100 [readOnly]="isReadOnly()" />
              </ion-col>
            </ion-row>

            <ion-row>
              <ion-col size="12" size-md="6">
                <bk-cat-select [category]="types()!" [selectedItemName]="type()" (selectedItemNameChange)="onFieldChange('type', $event)" [withAll]="false" [readOnly]="isReadOnly()" />
              </ion-col>

              <ion-col size="12" size-md="6">
                <bk-cat-select [category]="sources()!" [selectedItemName]="source()" (selectedItemNameChange)="onFieldChange('source', $event)" [withAll]="false" [readOnly]="isReadOnly()" />
              </ion-col>
            </ion-row>

            <ion-row>
              @if (hasRole('admin')) {
                <ion-col size="12">
                  <bk-text-input [i18n]="urlI18n()" [value]="url()" (valueChange)="onFieldChange('url', $event)" [autofocus]="true" [maxLength]=300 [readOnly]="isReadOnly()" [copyable]="true" />
                </ion-col>
              }

              <ion-col size="12">
                <bk-text-input [i18n]="mimeTypeI18n()" [value]="mimeType()" (valueChange)="onFieldChange('mimeType', $event)" [maxLength]=50 [readOnly]="isReadOnly()" />
              </ion-col>

              <ion-col size="12" size-md="6">
                <bk-text-input [i18n]="authorKeyI18n()" [value]="authorKey()" (valueChange)="onFieldChange('authorKey', $event)" [maxLength]=50 [readOnly]="isReadOnly()" />
              </ion-col>

              <ion-col size="12" size-md="6">
                <bk-text-input [i18n]="authorNameI18n()" [value]="authorName()" (valueChange)="onFieldChange('authorName', $event)" [maxLength]=50 [readOnly]="isReadOnly()" />
              </ion-col>
            </ion-row>

            <ion-row>
              <ion-col size="12" size-md="6">
                <bk-date-input [i18n]="dateOfDocCreationI18n()" [storeDate]="dateOfDocCreation()" (storeDateChange)="onFieldChange('dateOfDocCreation', $event)" [readOnly]="isReadOnly()" />
              </ion-col>

              <ion-col size="12" size-md="6">
                <bk-date-input [i18n]="dateOfDocLastUpdateI18n()" [storeDate]="dateOfDocLastUpdate()" (storeDateChange)="onFieldChange('dateOfDocLastUpdate', $event)" [readOnly]="isReadOnly()" />
              </ion-col>
            </ion-row>

            @if(hasRole('privileged') || !isReadOnly()) {
              <ion-row>
                <ion-col size="12">
                  <bk-text-input [i18n]="locationKeyI18n()" [value]="locationKey()" (valueChange)="onFieldChange('locationKey', $event)" [autofocus]="true" [maxLength]=20 [readOnly]="isReadOnly()" [copyable]="true" />
                </ion-col>

                <ion-col size="12">
                  <bk-text-input [i18n]="hashI18n()" [value]="hash()" (valueChange)="onFieldChange('hash', $event)" [maxLength]=100 [readOnly]="isReadOnly()" [copyable]="true" />
                </ion-col>

                <ion-col size="12">
                  <ion-item lines="none">
                    <ion-icon src="{{'link' | svgIcon }}" slot="start" (click)="showPriorVersion()" />
                    <bk-text-input [i18n]="priorVersionKeyI18n()" [value]="priorVersionKey()" (valueChange)="onFieldChange('priorVersionKey', $event)" [maxLength]=20 [readOnly]="isReadOnly()" [showHelper]=true />
                  </ion-item>
                </ion-col>

                <ion-col size="12">
                  <bk-text-input [i18n]="versionI18n()" [value]="version()" (valueChange)="onFieldChange('version', $event)" [maxLength]=20 [readOnly]="isReadOnly()" [showHelper]=true />
                </ion-col>
              </ion-row>
            }
          </ion-grid>
        </ion-card-content>
      </ion-card>

      @if(hasRole('privileged') || hasRole('contentAdmin')) {
        <bk-chips chipName="tag" [storedChips]="tags()" (storedChipsChange)="onFieldChange('tags', $event)" [allChips]="allTags()" [readOnly]="isReadOnly()" />
      }
      @if(hasRole('admin')) {
        <bk-notes-input [i18n]="descriptionI18n()" [value]="description()" (valueChange)="onFieldChange('description', $event)" [readOnly]="isReadOnly()" />
      }
    </form>
  }
  `
})
export class DocumentForm {
  private toastController = inject(ToastController);
  private env = inject(ENV);

  // inputs
  public readonly i18n = input.required<DocumentI18n>();
  public readonly formData = model.required<DocumentModel>();
  public readonly currentUser = input<UserModel | undefined>();
  public showForm = input(true);   // used for initializing the form and resetting vest validations
  public readonly allTags = input.required<string>();
  public readonly types = input.required<CategoryListModel>();
  public readonly sources = input.required<CategoryListModel>();
  public readonly readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

 // signals
  public dirty = output<boolean>();
  public valid = output<boolean>();
  public priorVersionClicked = output<string>();

  constructor() { effect(() => this.valid.emit(this.validationResult().isValid())); }

  // validations and errors
  private readonly validationResult = computed(() => documentValidations(this.formData(), this.env.tenantId, this.allTags()));

  // fields
  protected fullPath = linkedSignal(() => this.formData().fullPath ?? '');
  protected title = linkedSignal(() => this.formData().title ?? '');
  protected altText = linkedSignal(() => this.formData().altText ?? '');
  protected type = linkedSignal(() => this.formData().type ?? '');
  protected source = linkedSignal(() => this.formData().source ?? '');
  protected url = linkedSignal(() => this.formData().url ?? '');
  protected mimeType = linkedSignal(() => this.formData().mimeType ?? '');
  protected authorKey = linkedSignal(() => this.formData().authorKey ?? '');
  protected authorName = linkedSignal(() => this.formData().authorName ?? '');
  protected dateOfDocCreation = linkedSignal(() => this.formData().dateOfDocCreation ?? DEFAULT_DATE);
  protected dateOfDocLastUpdate = linkedSignal(() => this.formData().dateOfDocLastUpdate ?? DEFAULT_DATE);
  protected locationKey = linkedSignal(() => this.formData().locationKey ?? '');
  protected hash = linkedSignal(() => this.formData().hash ?? '');
  protected priorVersionKey = linkedSignal(() => this.formData().priorVersionKey ?? '');
  protected version = linkedSignal(() => this.formData().version ?? '');
  protected description = linkedSignal(() => this.formData().description ?? DEFAULT_NOTES);
  protected tags = linkedSignal(() => this.formData().tags ?? DEFAULT_TAGS);
  protected bkey = computed(() => this.formData().bkey ?? '');

  protected bkeyI18n = computed(() => ({
    name: 'bkey',
    label: this.i18n().bkey_label(),
    placeholder: this.i18n().bkey_placeholder(),
    helper: this.i18n().bkey_helper()
  } as TextInputI18n));

  protected fullPathI18n = computed(() => ({
    name: 'fullPath',
    label: this.i18n().fullPath_label(),
    placeholder: this.i18n().fullPath_placeholder(),
    helper: this.i18n().fullPath_helper()
  } as TextInputI18n));

  protected titleI18n = computed(() => ({
    name: 'title',
    label: this.i18n().title_label(),
    placeholder: this.i18n().title_placeholder(),
    helper: this.i18n().title_helper()
  } as TextInputI18n));

  protected altTextI18n = computed(() => ({
    name: 'altText',
    label: this.i18n().altText_label(),
    placeholder: this.i18n().altText_placeholder(),
    helper: this.i18n().altText_helper()
  } as TextInputI18n));

  protected urlI18n = computed(() => ({
    name: 'url',
    label: this.i18n().url_label(),
    placeholder: this.i18n().url_placeholder(),
    helper: this.i18n().url_helper()
  } as TextInputI18n));

  protected mimeTypeI18n = computed(() => ({
    name: 'mimeType',
    label: this.i18n().mimeType_label(),
    placeholder: this.i18n().mimeType_placeholder(),
    helper: this.i18n().mimeType_helper()
  } as TextInputI18n));

  protected authorKeyI18n = computed(() => ({
    name: 'authorKey',
    label: this.i18n().authorKey_label(),
    placeholder: this.i18n().authorKey_placeholder(),
    helper: this.i18n().authorKey_helper()
  } as TextInputI18n));

  protected authorNameI18n = computed(() => ({
    name: 'authorName',
    label: this.i18n().authorName_label(),
    placeholder: this.i18n().authorName_placeholder(),
    helper: this.i18n().authorName_helper()
  } as TextInputI18n));

  protected locationKeyI18n = computed(() => ({
    name: 'locationKey',
    label: this.i18n().locationKey_label(),
    placeholder: this.i18n().locationKey_placeholder(),
    helper: this.i18n().locationKey_helper()
  } as TextInputI18n));

  protected hashI18n = computed(() => ({
    name: 'hash',
    label: this.i18n().hash_label(),
    placeholder: this.i18n().hash_placeholder(),
    helper: this.i18n().hash_helper()
  } as TextInputI18n));

  protected priorVersionKeyI18n = computed(() => ({
    name: 'priorVersionKey',
    label: this.i18n().priorVersionKey_label(),
    placeholder: this.i18n().priorVersionKey_placeholder(),
    helper: this.i18n().priorVersionKey_helper()
  } as TextInputI18n));

  protected versionI18n = computed(() => ({
    name: 'version',
    label: this.i18n().version_label(),
    placeholder: this.i18n().version_placeholder(),
    helper: this.i18n().version_helper()
  } as TextInputI18n));

  protected descriptionI18n = computed(() => ({
    name: 'description', label: this.i18n().description_label(), placeholder: this.i18n().description_placeholder()
  } as NotesInputI18n));

  protected dateOfDocCreationI18n = computed(() => ({ name: 'dateOfDocCreation', label: this.i18n().dateOfDocCreation_label(), placeholder: this.i18n().dateOfDocCreation_placeholder(), helper: this.i18n().dateOfDocCreation_helper() } as DateInputI18n));
  protected dateOfDocLastUpdateI18n = computed(() => ({ name: 'dateOfDocLastUpdate', label: this.i18n().dateOfDocLastUpdate_label(), placeholder: this.i18n().dateOfDocLastUpdate_placeholder(), helper: this.i18n().dateOfDocLastUpdate_helper() } as DateInputI18n));

  /******************************* actions *************************************** */
  protected onFieldChange(fieldName: string, fieldValue: string | string[] | number): void {
    this.dirty.emit(true);
    this.formData.update(vm => ({ ...vm, [fieldName]: fieldValue }));
  }

  protected download(): void {
    window.open(this.url(), '_blank');
  }

  protected showPriorVersion(): void {
    if (this.priorVersionKey()) {
      this.priorVersionClicked.emit(this.priorVersionKey());
    }
  }

  protected copy(value: string): void {
      copyToClipboard(value);
      showToast(this.toastController, '@copy.conf');
  }

  /******************************* helpers *************************************** */
  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}
