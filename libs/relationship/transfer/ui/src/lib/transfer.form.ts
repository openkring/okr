import { Component, computed, input, linkedSignal, model, output, Signal } from '@angular/core';
import { IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonInput, IonItem, IonRow } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { DEFAULT_CURRENCY, DEFAULT_LABEL, DEFAULT_LOCALE, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_PRICE, DEFAULT_TAGS, DEFAULT_TRANSFER_STATE, DEFAULT_TRANSFER_TYPE, NAME_LENGTH } from '@bk2/shared-constants';
import { AvatarInfo, CategoryListModel, RoleName, TransferModel, UserModel } from '@bk2/shared-models';
import { CategorySelect, Chips, DateInput, DateInputI18n, NotesInput, NotesInputI18n, NumberInput, NumberInputI18n, TextInput, TextInputI18n } from '@bk2/shared-ui';
import { coerceBoolean, debugFormErrors, debugFormModel, getTodayStr, hasRole } from '@bk2/shared-util-core';

import { Avatars } from '@bk2/avatar-ui';
import { transferValidations } from '@bk2/relationship-transfer-util';

export interface TransferFormI18n {
  resourceNameLabel: Signal<string>;
  selectResource: Signal<string>;
  name_label: Signal<string>;
  name_placeholder: Signal<string>;
  name_helper: Signal<string>;
  label_label: Signal<string>;
  label_placeholder: Signal<string>;
  label_helper: Signal<string>;
  currency_label: Signal<string>;
  currency_placeholder: Signal<string>;
  currency_helper: Signal<string>;
  price_label: Signal<string>;
  price_placeholder: Signal<string>;
  price_helper: Signal<string>;
  notes_label: Signal<string>;
  notes_placeholder: Signal<string>;
  dateOfTransfer_label: Signal<string>;
  dateOfTransfer_placeholder: Signal<string>;
  dateOfTransfer_helper: Signal<string>;
}

@Component({
  selector: 'bk-transfer-form',
  standalone: true,
  imports: [
    vestForms,
    DateInput, TextInput, NotesInput, NumberInput, Avatars, CategorySelect, Chips,
    IonGrid, IonRow, IonCol, IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonItem, IonInput, IonButton
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    @if (showForm()) {
      <form scVestForm
        [formValue]="formData()"
        [suite]="suite"
        (dirtyChange)="dirty.emit($event)"
        (formValueChange)="onFormChange($event)"
      >
        @if(currentUser(); as currentUser) {
          <!-- subjects -->
          <bk-avatars
            (selectClicked)="selectSubject.emit(true)"
            name="subjects"
            [avatars]="subjects()"
            (avatarsChange)="onFieldChange('subjects', $event)"
            [currentUser]="currentUser"
            [readOnly]="readOnly()"
            title="@transfer.field.subjects"
            addLabel="@transfer.operation.addSubject.label"
          />

          <!-- objects -->
          <bk-avatars
            (selectClicked)="selectObject.emit(true)"
            name="objects"
            [avatars]="objects()"
            (avatarsChange)="onFieldChange('objects', $event)"
            [currentUser]="currentUser"
            [readOnly]="readOnly()"
            title="@transfer.field.objects"
            addLabel="@transfer.operation.addObject.label"
          />

          <ion-card>
            <ion-card-header>
              <ion-card-title>Resource</ion-card-title>
            </ion-card-header>
            <ion-card-content>
              <ion-item lines="none">
                <!-- we deliberately use ion-input here, because we do not want to interfere with the vest form update  -->
                <ion-input [value]="resourceName()" (ionChange)="onResourceNameChange($event)" [label]="i18n().resourceNameLabel()" labelPlacement="floating" inputMode="text" type="text" [counter]="true" [maxlength]="nameLength" placeholder="ssssss" />
                <ion-button slot="end" fill="clear" (click)="selectResource.emit(true)">{{ i18n().selectResource() }}</ion-button>
              </ion-item>
            </ion-card-content>
          </ion-card>

          <ion-card>
            <ion-card-header>
              <ion-card-title>Transfer</ion-card-title>
            </ion-card-header>
            <ion-card-content>
              <ion-grid>
                <ion-row>
                  <ion-col size="12">
                    <bk-text-input [i18n]="nameI18n()" [value]="name()" (valueChange)="onFieldChange('name', $event)" [maxLength]="nameLength" [readOnly]="isReadOnly()" />
                  </ion-col>

                  <ion-col size="12" size-md="6">
                    <bk-cat-select [category]="types()!" [selectedItemName]="type()" (selectedItemNameChange)="onFieldChange('type', $event)" [withAll]="false" [readOnly]="isReadOnly()" />
                  </ion-col>

                  @if(type() === 'custom') {
                  <ion-col size="12" size-md="6">
                    <bk-text-input [i18n]="labelI18n()" [value]="label()" (valueChange)="onFieldChange('label', $event)" [maxLength]="nameLength" [readOnly]="isReadOnly()" />
                  </ion-col>
                  }

                  <ion-col size="12" size-md="6">
                    <bk-cat-select [category]="states()!" [selectedItemName]="state()" (selectedItemNameChange)="onFieldChange('state', $event)" [withAll]="false" [readOnly]="isReadOnly()" />
                  </ion-col>

                  <ion-col size="12" size-md="6">
                    <bk-date-input [i18n]="dateOfTransferI18n()" [storeDate]="dateOfTransfer()" (storeDateChange)="onFieldChange('dateOfTransfer', $event)" [locale]="locale()" [readOnly]="isReadOnly()" />
                  </ion-col>
                </ion-row>
              </ion-grid>
            </ion-card-content>
          </ion-card>

          <ion-card>
            <ion-card-header>
              <ion-card-title>Gebühren</ion-card-title>
            </ion-card-header>
            <ion-card-content>
              <ion-grid>
                <ion-row>
                  <ion-col size="12" size-md="6">
                    <bk-number-input [i18n]="priceI18n()" [value]="price()" (valueChange)="onFieldChange('price', $event)" [maxLength]="6" [readOnly]="isReadOnly()" />
                  </ion-col>

                  <ion-col size="12" size-md="6">
                    <bk-text-input [i18n]="currencyI18n()" [value]="currency()" (valueChange)="onFieldChange('currency', $event)" [maxLength]="20" [readOnly]="isReadOnly()" />
                  </ion-col>

                  <ion-col size="12" size-md="6">
                    <bk-cat-select [category]="periodicities()!" [selectedItemName]="periodicity()" (selectedItemNameChange)="onFieldChange('periodicity', $event)" [withAll]="false" [readOnly]="isReadOnly()" />
                  </ion-col>
                </ion-row>
              </ion-grid>
            </ion-card-content>
          </ion-card>

          @if(hasRole('privileged') || hasRole('resourceAdmin')) {
            <bk-chips chipName="tag" [storedChips]="tags()" (storedChipsChange)="onFieldChange('tags', $event)" [allChips]="allTags()" [readOnly]="isReadOnly()" />
          } 
          
          @if(hasRole('admin')) {
            <bk-notes-input [i18n]="notesI18n()" [value]="notes()" (valueChange)="onFieldChange('notes', $event)" [readOnly]="isReadOnly()" />
          }
        }
      </form>
    }
  `,
})
export class TransferForm {
  // inputs
  public readonly i18n = input.required<TransferFormI18n>();
  public readonly formData = model.required<TransferModel>();
  public currentUser = input<UserModel | undefined>();
  public showForm = input(true);   // used for initializing the form and resetting vest validations
  public types = input.required<CategoryListModel>();
  public states = input.required<CategoryListModel>();
  public periodicities = input.required<CategoryListModel>()
  public allTags = input.required<string>();
  public tenantId = input.required<string>();
  public readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected readonly locale = input(DEFAULT_LOCALE);

 // signals
  public dirty = output<boolean>();
  public valid = output<boolean>();
  public selectSubject = output<boolean>();
  public selectObject = output<boolean>();
  public selectResource = output<boolean>();
  public showPersonOutput = output<string>();

  // validation and errors
  protected readonly suite = transferValidations;
  private readonly validationResult = computed(() => transferValidations(this.formData(), this.tenantId(), this.allTags()));
  protected nameErrors = computed(() => this.validationResult().getErrors('name'));

  // fields
  protected tags = linkedSignal(() => this.formData().tags ?? DEFAULT_TAGS);
  protected notes = linkedSignal(() => this.formData().notes ?? DEFAULT_NOTES);
  protected name = linkedSignal(() => this.formData().name ?? DEFAULT_NAME);

  protected subjects = linkedSignal(() => this.formData().subjects ?? []);
  protected objects = linkedSignal(() => this.formData().objects ?? []);

  protected dateOfTransfer = linkedSignal(() => this.formData().dateOfTransfer ?? getTodayStr());
  protected resourceName = computed(() => this.formData().resource?.name2 ?? DEFAULT_NAME);
  protected type = linkedSignal(() => this.formData().type ?? DEFAULT_TRANSFER_TYPE);
  protected state = linkedSignal(() => this.formData().state ?? DEFAULT_TRANSFER_STATE);
  protected label = linkedSignal(() => this.formData().label ?? DEFAULT_LABEL);
  protected price = linkedSignal(() => this.formData().price ?? DEFAULT_PRICE);
  protected currency = linkedSignal(() => this.formData().currency ?? DEFAULT_CURRENCY);
  protected periodicity = linkedSignal(() => this.formData().periodicity ?? 'yearly');

  protected nameI18n = computed(() => ({
    name:        'name',
    label:       this.i18n().name_label(),
    placeholder: this.i18n().name_placeholder(),
    helper:      this.i18n().name_helper(),
  } as TextInputI18n));

  protected labelI18n = computed(() => ({
    name:        'label',
    label:       this.i18n().label_label(),
    placeholder: this.i18n().label_placeholder(),
    helper:      this.i18n().label_helper(),
  } as TextInputI18n));

  protected currencyI18n = computed(() => ({
    name:        'currency',
    label:       this.i18n().currency_label(),
    placeholder: this.i18n().currency_placeholder(),
    helper:      this.i18n().currency_helper(),
  } as TextInputI18n));

  protected priceI18n = computed(() => ({
    name:        'price',
    label:       this.i18n().price_label(),
    placeholder: this.i18n().price_placeholder(),
    helper:      this.i18n().price_helper(),
  } as NumberInputI18n));

  protected notesI18n = computed(() => ({
    name:        'notes',
    label:       this.i18n().notes_label(),
    placeholder: this.i18n().notes_placeholder(),
  } as NotesInputI18n));

  protected dateOfTransferI18n = computed(() => ({
    name:        'dateOfTransfer',
    label:       this.i18n().dateOfTransfer_label(),
    placeholder: this.i18n().dateOfTransfer_placeholder(),
    helper:      this.i18n().dateOfTransfer_helper(),
  } as DateInputI18n));

  // passing constants to template
  protected nameLength = NAME_LENGTH;
  
  protected onResourceNameChange($event: Event): void {
    const resourceName = ($event.target as HTMLInputElement).value ?? '';
    this.formData.update(vm => ({ ...vm, resource: { ...vm.resource, name2: resourceName } }));
  }

  /******************************* actions *************************************** */
  protected onFieldChange(fieldName: string, fieldValue: string | string[] | number | AvatarInfo[] | AvatarInfo): void {
    this.dirty.emit(true);
    this.formData.update(vm => ({ ...vm, [fieldName]: fieldValue }));
  }

  protected onFormChange(value: TransferModel): void {
    this.formData.update(vm => ({ ...vm, ...value }));
    debugFormModel('TransferForm.onFormChange', this.formData(), this.currentUser());
    debugFormErrors('TransferForm.onFormChange', this.validationResult().errors, this.currentUser());
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }

  protected showPerson(personKey: string): void {
    this.showPersonOutput.emit(personKey);
  }
}
