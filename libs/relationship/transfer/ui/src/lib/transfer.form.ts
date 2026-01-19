import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input, linkedSignal, model, output } from '@angular/core';
import { IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonInput, IonItem, IonRow, ModalController } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';
import { Router } from '@angular/router';

import { DEFAULT_CURRENCY, DEFAULT_LABEL, DEFAULT_LOCALE, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_PRICE, DEFAULT_TAGS, DEFAULT_TRANSFER_STATE, DEFAULT_TRANSFER_TYPE, NAME_LENGTH } from '@bk2/shared-constants';
import { TranslatePipe } from '@bk2/shared-i18n';
import { AvatarInfo, CategoryListModel, RoleName, TransferModel, UserModel } from '@bk2/shared-models';
import { CategorySelectComponent, ChipsComponent, DateInputComponent, NotesInputComponent, NumberInputComponent, TextInputComponent } from '@bk2/shared-ui';
import { coerceBoolean, debugFormErrors, debugFormModel, die, getTodayStr, hasRole } from '@bk2/shared-util-core';

import { AvatarsComponent } from '@bk2/avatar-ui';
import { transferValidations } from '@bk2/relationship-transfer-util';

@Component({
  selector: 'bk-transfer-form',
  standalone: true,
  imports: [
    vestForms,
    TranslatePipe, AsyncPipe,
    DateInputComponent, TextInputComponent, NotesInputComponent, NumberInputComponent,
    AvatarsComponent, CategorySelectComponent, ChipsComponent,
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
                <ion-input [value]="resourceName()" (ionChange)="onResourceNameChange($event)" label="{{ '@input.resourceName.label' | translate | async }}" labelPlacement="floating" inputMode="text" type="text" [counter]="true" [maxlength]="nameLength" placeholder="ssssss" />
                <ion-button slot="end" fill="clear" (click)="selectResource.emit(true)">{{ '@general.operation.select.resource' | translate | async }}</ion-button>
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
                    <bk-text-input name="name" [value]="name()" (valueChange)="onFieldChange('name', $event)" [maxLength]="nameLength" [readOnly]="isReadOnly()" />
                  </ion-col>

                  <ion-col size="12" size-md="6">
                    <bk-cat-select [category]="types()!" [selectedItemName]="type()" (selectedItemNameChange)="onFieldChange('type', $event)" [withAll]="false" [readOnly]="isReadOnly()" />
                  </ion-col>

                  @if(type() === 'custom') {
                  <ion-col size="12" size-md="6">
                    <bk-text-input name="label" [value]="label()" (valueChange)="onFieldChange('label', $event)" [maxLength]="nameLength" [readOnly]="isReadOnly()" />
                  </ion-col>
                  }

                  <ion-col size="12" size-md="6">
                    <bk-cat-select [category]="states()!" [selectedItemName]="state()" (selectedItemNameChange)="onFieldChange('state', $event)" [withAll]="false" [readOnly]="isReadOnly()" />
                  </ion-col>

                  <ion-col size="12" size-md="6">
                    <bk-date-input name="dateOfTransfer" [storeDate]="dateOfTransfer()" (storeDateChange)="onFieldChange('dateOfTransfer', $event)" [locale]="locale()" [showHelper]="true" [readOnly]="isReadOnly()" />
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
                    <bk-number-input name="price" [value]="price()" (valueChange)="onFieldChange('price', $event)" [maxLength]="6" [readOnly]="isReadOnly()" />
                  </ion-col>

                  <ion-col size="12" size-md="6">
                    <bk-text-input name="currency" [value]="currency()" (valueChange)="onFieldChange('currency', $event)" [maxLength]="20" [readOnly]="isReadOnly()" />
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
            <bk-notes name="notes" [value]="notes()" (valueChange)="onFieldChange('notes', $event)" [readOnly]="isReadOnly()" />
          }
        }
      </form>
    }
  `,
})
export class TransferFormComponent {
  private readonly router = inject(Router);
  protected modalController = inject(ModalController);

  // inputs
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

  protected async showPerson(personKey: string): Promise<void> {
    if (this.modalController) this.modalController.dismiss(null, 'cancel');
    await this.router.navigateByUrl(`/person/${personKey}`);
  }
}
