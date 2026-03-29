import { Component, computed, input, linkedSignal, model, output } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { IonCard, IonCardContent, IonCol, IonGrid, IonItem, IonLabel, IonRow } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { iconValidations } from '@bk2/icon-util';
import { IconModel, RoleName, UserModel } from '@bk2/shared-models';
import { ChipsComponent, ErrorNoteComponent, NotesInputComponent, TextInputComponent } from '@bk2/shared-ui';
import { coerceBoolean, hasRole } from '@bk2/shared-util-core';
import { DEFAULT_INDEX, DEFAULT_NOTES, DEFAULT_TAGS } from '@bk2/shared-constants';

@Component({
  selector: 'bk-icon-edit-form',
  standalone: true,
  imports: [
    vestForms, DecimalPipe,
    TextInputComponent, NotesInputComponent, ChipsComponent, ErrorNoteComponent,
    IonGrid, IonRow, IonCol, IonCard, IonCardContent, IonItem, IonLabel
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
  @if (showForm()) {
    <form scVestForm
      [formValue]="formData()"
      [suite]="suite"
      (dirtyChange)="dirty.emit($event)"
      (validChange)="valid.emit($event)"
      (formValueChange)="onFormChange($event)">

      <ion-card>
        <ion-card-content class="ion-no-padding">
          <ion-grid>
            <ion-row>
              @if(hasRole('admin')) {
                <ion-col size="12" size-md="6">
                  <bk-text-input name="bkey" [value]="bkey()" label="bkey" [readOnly]="true" [copyable]="true" />
                </ion-col>
              }
              <ion-col size="12" size-md="6">
                <bk-text-input name="name" [value]="name()" label="@icon.field.name.label" [readOnly]="true" [copyable]="true" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-text-input name="type" [value]="type()" label="@icon.field.type.label" [readOnly]="true" [copyable]="true" />
              </ion-col>
            </ion-row>
            <ion-row>
              <ion-col size="12">
                <bk-text-input name="fullPath" [value]="fullPath()" label="@icon.field.fullPath.label" [readOnly]="true" [copyable]="true" />
                <bk-error-note [errors]="fullPathErrors()" />
              </ion-col>
            </ion-row>
            <ion-row>
              <ion-col size="12">
                <!-- index: editable list of words, e.g. 'create edit new' -->
                <bk-text-input name="index" [value]="index()" (valueChange)="onFieldChange('index', $event)"
                  label="@icon.field.index.label" [showHelper]="true" [readOnly]="isReadOnly()" />
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
        <bk-notes [value]="notes()" (valueChange)="onFieldChange('notes', $event)" [readOnly]="isReadOnly()" />
      }
    </form>
  }
`
})
export class IconEditFormComponent {
  // inputs
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
  protected readonly suite = iconValidations;
  private readonly validationResult = computed(() => iconValidations(this.formData(), this.tenants(), this.allTags()));
  protected fullPathErrors = computed(() => this.validationResult().getErrors('fullPath'));
  protected indexErrors = computed(() => this.validationResult().getErrors('index'));

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

  /******************************* actions *************************************** */
  protected onFieldChange(fieldName: string, fieldValue: string | string[] | number | boolean): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }

  protected onFormChange(value: IconModel): void {
    this.formData.update((vm) => ({ ...vm, ...value }));
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}
