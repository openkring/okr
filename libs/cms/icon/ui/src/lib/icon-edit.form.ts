import { Component, computed, effect, input, linkedSignal, model, output, Signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { IonCard, IonCardContent, IonCol, IonGrid, IonItem, IonLabel, IonRow } from '@ionic/angular/standalone';

import { iconValidations } from '@bk2/cms-icon-util';
import { IconModel, RoleName, UserModel } from '@bk2/shared-models';
import { Chips, ErrorNote, NotesInput, NotesInputI18n, TextInput, TextInputI18n } from '@bk2/shared-ui';
import { coerceBoolean, hasRole } from '@bk2/shared-util-core';
import { DEFAULT_INDEX, DEFAULT_NOTES, DEFAULT_TAGS } from '@bk2/shared-constants';

export interface IconEditFormI18n {
  bkey_label: Signal<string>;
  bkey_placeholder: Signal<string>;
  bkey_helper: Signal<string>;
  name_label: Signal<string>;
  name_placeholder: Signal<string>;
  name_helper: Signal<string>;
  type_label: Signal<string>;
  type_placeholder: Signal<string>;
  type_helper: Signal<string>;
  fullPath_label: Signal<string>;
  fullPath_placeholder: Signal<string>;
  fullPath_helper: Signal<string>;
  index_label: Signal<string>;
  index_placeholder: Signal<string>;
  index_helper: Signal<string>;
  notes_label: Signal<string>;
  notes_placeholder: Signal<string>;
}

@Component({
  selector: 'bk-icon-edit-form',
  standalone: true,
  imports: [
    DecimalPipe,
    TextInput, NotesInput, Chips, ErrorNote,
    IonGrid, IonRow, IonCol, IonCard, IonCardContent, IonItem, IonLabel
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
  @if (showForm()) {
    <form novalidate>

      <ion-card>
        <ion-card-content class="ion-no-padding">
          <ion-grid>
            <ion-row>
              @if(hasRole('admin')) {
                <ion-col size="12" size-md="6">
                  <bk-text-input [i18n]="bkeyI18n()" [value]="bkey()" [readOnly]="true" [copyable]="true" />
                </ion-col>
              }
              <ion-col size="12" size-md="6">
                <bk-text-input [i18n]="nameI18n()" [value]="name()" [readOnly]="true" [copyable]="true" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-text-input [i18n]="typeI18n()" [value]="type()" [readOnly]="true" [copyable]="true" />
              </ion-col>
            </ion-row>
            <ion-row>
              <ion-col size="12">
                <bk-text-input [i18n]="fullPathI18n()" [value]="fullPath()" [readOnly]="true" [copyable]="true" />
                <bk-error-note [errors]="fullPathErrors()" />
              </ion-col>
            </ion-row>
            <ion-row>
              <ion-col size="12">
                <!-- index: editable list of words, e.g. 'create edit new' -->
                <bk-text-input [i18n]="indexI18n()" [value]="index()" (valueChange)="onFieldChange('index', $event)"
                  [showHelper]="true" [readOnly]="isReadOnly()" />
              </ion-col>
            </ion-row>
            <ion-row>
              <ion-col size="6">
                <ion-item lines="none">
                  <ion-label>{{ size() | number }} bytes</ion-label>
                </ion-item>
              </ion-col>
              <ion-col size="6">
                <ion-item lines="none">
                  <ion-label>{{ updated() }}</ion-label>
                </ion-item>
              </ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>

      @if(hasRole('privileged')) {
        <bk-chips chipName="tag" [storedChips]="tags()" (storedChipsChange)="onFieldChange('tags', $event)" [allChips]="allTags()" [readOnly]="isReadOnly()" />
      }

      @if(hasRole('admin')) {
        <bk-notes-input [i18n]="notesI18n()" [value]="notes()" (valueChange)="onFieldChange('notes', $event)" [readOnly]="isReadOnly()" />
      }
    </form>
  }
`
})
export class IconEditForm {
  // inputs
  public readonly i18n = input.required<IconEditFormI18n>();
  public formData = model.required<IconModel>();
  public currentUser = input<UserModel>();
  public showForm = input(true);
  public allTags = input.required<string>();
  public tenants = input.required<string>();
  public readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // outputs
  public dirty = output<boolean>();
  public valid = output<boolean>();

  // validation
  private readonly validationResult = computed(() => iconValidations(this.formData(), this.tenants(), this.allTags()));
  protected fullPathErrors = computed(() => this.validationResult().getErrors('fullPath'));
  protected indexErrors = computed(() => this.validationResult().getErrors('index'));

  constructor() { effect(() => this.valid.emit(this.validationResult().isValid())); }

  // fields
  protected bkey = computed(() => this.formData().bkey ?? '');
  protected name = linkedSignal(() => this.formData().name ?? '');
  protected type = linkedSignal(() => this.formData().type ?? '');
  protected fullPath = linkedSignal(() => this.formData().fullPath ?? '');
  protected index = linkedSignal(() => this.formData().index ?? DEFAULT_INDEX);
  protected notes = linkedSignal(() => this.formData().notes ?? DEFAULT_NOTES);
  protected tags = linkedSignal(() => this.formData().tags ?? DEFAULT_TAGS);
  protected size = linkedSignal(() => this.formData().size ?? 0);
  protected updated = linkedSignal(() => this.formData().updated ?? '');

  protected bkeyI18n = computed(() => ({
    name: 'bkey',
    label: this.i18n().bkey_label(),
    placeholder: this.i18n().bkey_placeholder(),
    helper: this.i18n().bkey_helper()
  } as TextInputI18n));

  protected nameI18n = computed(() => ({
    name: 'name',
    label: this.i18n().name_label(),
    placeholder: this.i18n().name_placeholder(),
    helper: this.i18n().name_helper()
  } as TextInputI18n));

  protected typeI18n = computed(() => ({
    name: 'type',
    label: this.i18n().type_label(),
    placeholder: this.i18n().type_placeholder(),
    helper: this.i18n().type_helper()
  } as TextInputI18n));

  protected fullPathI18n = computed(() => ({
    name: 'fullPath',
    label: this.i18n().fullPath_label(),
    placeholder: this.i18n().fullPath_placeholder(),
    helper: this.i18n().fullPath_helper()
  } as TextInputI18n));

  protected indexI18n = computed(() => ({
    name: 'index',
    label: this.i18n().index_label(),
    placeholder: this.i18n().index_placeholder(),
    helper: this.i18n().index_helper()
  } as TextInputI18n));

  protected notesI18n = computed(() => ({
    name: 'notes',
    label: this.i18n().notes_label(),
    placeholder: this.i18n().notes_placeholder()
  } as NotesInputI18n));

  /******************************* actions *************************************** */
  protected onFieldChange(fieldName: string, fieldValue: string | string[] | number | boolean): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}
