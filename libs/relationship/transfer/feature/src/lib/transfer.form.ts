import { AsyncPipe } from '@angular/common';
import { Component, computed, effect, inject, input, linkedSignal, model, output } from '@angular/core';
import { IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonInput, IonItem, IonRow, ModalController } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { DEFAULT_CURRENCY, DEFAULT_LABEL, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_PRICE, DEFAULT_TAGS, DEFAULT_TRANSFER_STATE, DEFAULT_TRANSFER_TYPE, NAME_LENGTH } from '@bk2/shared-constants';
import { AppStore, PersonSelectModalComponent, ResourceSelectModalComponent } from '@bk2/shared-feature';
import { TranslatePipe } from '@bk2/shared-i18n';
import { AvatarInfo, DefaultResourceInfo, ResourceInfo, RoleName } from '@bk2/shared-models';
import { CategorySelectComponent, ChipsComponent, DateInputComponent, NotesInputComponent, NumberInputComponent, TextInputComponent } from '@bk2/shared-ui';
import { coerceBoolean, debugFormErrors, die, getTodayStr, hasRole, isPerson, isResource } from '@bk2/shared-util-core';

import { TRANSFER_FORM_SHAPE, TransferFormModel, transferFormValidations } from '@bk2/relationship-transfer-util';
import { AvatarsComponent } from '@bk2/avatar-ui';

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
    <form scVestForm
      [formShape]="shape"
      [formValue]="formData()"
      [suite]="suite"
      (dirtyChange)="dirty.emit($event)"
      (formValueChange)="onFormChange($event)"
    >
      <!-- subjects -->
      <bk-avatars
        (changed)="onFieldChange('subjects', $event)" 
        (selectClicked)="selectPerson('subjects')"
        [avatars]="subjects()"
        [currentUser]="currentUser()"
        [readOnly]="readOnly()"
        title="@transfer.field.subjects"
        addLabel="@transfer.operation.addSubject.label"
      />

      <!-- objects -->
      <bk-avatars
        (changed)="onFieldChange('objects', $event)"
        (selectClicked)="selectPerson('objects')"
        [avatars]="objects()"
        [currentUser]="currentUser()"
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
            <ion-button slot="end" fill="clear" (click)="selectResource()">{{ '@general.operation.select.resource' | translate | async }}</ion-button>
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
                <bk-text-input name="name" [value]="name()" [maxLength]="nameLength" [readOnly]="isReadOnly()" (changed)="onFieldChange('name', $event)" />
              </ion-col>

              <ion-col size="12" size-md="6">
                <bk-cat-select [category]="types()!" selectedItemName="type()" [withAll]="false" [readOnly]="isReadOnly()" (changed)="onFieldChange('type', $event)" />
              </ion-col>

              @if(type() === 'custom') {
              <ion-col size="12" size-md="6">
                <bk-text-input name="label" [value]="label()" [maxLength]="nameLength" [readOnly]="isReadOnly()" (changed)="onFieldChange('label', $event)" />
              </ion-col>
              }

              <ion-col size="12" size-md="6">
                <bk-cat-select [category]="states()!" selectedItemName="state()" [withAll]="false" [readOnly]="isReadOnly()" (changed)="onFieldChange('state', $event)" />
              </ion-col>

              <ion-col size="12" size-md="6">
                <bk-date-input name="dateOfTransfer" [storeDate]="dateOfTransfer()" [locale]="locale()" [showHelper]="true" [readOnly]="isReadOnly()" (changed)="onFieldChange('dateOfTransfer', $event)" />
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
                <bk-number-input name="price" [value]="price()" [maxLength]="6" [readOnly]="isReadOnly()" (changed)="onFieldChange('price', $event)" />
              </ion-col>

              <ion-col size="12" size-md="6">
                <bk-text-input name="currency" [value]="currency()" [maxLength]="20" [readOnly]="isReadOnly()" (changed)="onFieldChange('currency', $event)" />
              </ion-col>

              <ion-col size="12" size-md="6">
                <bk-cat-select [category]="periodicities()!" selectedItemName="periodicity()" [withAll]="false" [readOnly]="isReadOnly()" (changed)="onFieldChange('periodicity', $event)" />
              </ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>

      @if(hasRole('privileged')) {
      <bk-chips chipName="tag" [storedChips]="tags()" [allChips]="allTags()" [readOnly]="isReadOnly()" (changed)="onFieldChange('tags', $event)" />
      } @if(hasRole('admin')) {
      <bk-notes name="notes" [value]="notes()" [readOnly]="isReadOnly()" (changed)="onFieldChange('notes', $event)" />
      }
    </form>
  `,
})
export class TransferFormComponent {
  protected modalController = inject(ModalController);
  private readonly appStore = inject(AppStore);

  // inputs
  public formData = model.required<TransferFormModel>();
  public readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

 // signals
  public dirty = output<boolean>();
  public valid = output<boolean>();

  // validation and errors
  protected readonly suite = transferFormValidations;
  protected readonly shape = TRANSFER_FORM_SHAPE;
  private readonly validationResult = computed(() => transferFormValidations(this.formData()));
  protected nameErrors = computed(() => this.validationResult().getErrors('name'));

  // fields
  protected readonly currentUser = computed(() => this.appStore.currentUser() ?? die('TransferForm: current user is required'));
  protected readonly allTags = computed(() => this.appStore.getTags('transfer'));
  protected readonly types = computed(() => this.appStore.getCategory('transfer_type'));
  protected readonly states = computed(() => this.appStore.getCategory('transfer_state'));
  protected readonly periodicities = computed(() => this.appStore.getCategory('periodicity'));

  protected tags = computed(() => this.formData().tags ?? DEFAULT_TAGS);
  protected notes = computed(() => this.formData().notes ?? DEFAULT_NOTES);
  protected name = computed(() => this.formData().name ?? DEFAULT_NAME);

  protected subjects = linkedSignal(() => this.formData().subjects ?? []);
  protected objects = linkedSignal(() => this.formData().objects ?? []);

  protected dateOfTransfer = computed(() => this.formData().dateOfTransfer ?? getTodayStr());
  protected resourceName = computed(() => this.formData().resource?.name ?? DEFAULT_NAME);
  protected type = computed(() => this.formData().type ?? DEFAULT_TRANSFER_TYPE);
  protected state = computed(() => this.formData().state ?? DEFAULT_TRANSFER_STATE);
  protected label = computed(() => this.formData().label ?? DEFAULT_LABEL);
  protected price = computed(() => this.formData().price ?? DEFAULT_PRICE);
  protected currency = computed(() => this.formData().currency ?? DEFAULT_CURRENCY);
  protected periodicity = computed(() => this.formData().periodicity ?? 'yearly');
  protected readonly locale = computed(() => this.appStore.appConfig().locale);

  // passing constants to template
  protected nameLength = NAME_LENGTH;

  constructor() {
    effect(() => {
      this.valid.emit(this.validationResult().isValid());
    });
  }

  protected onResourceNameChange($event: Event): void {
    const resource = DefaultResourceInfo;
    resource.name = ($event.target as HTMLInputElement).value ?? '';
    this.formData.update(vm => ({ ...vm, resource }));
  }

  protected onFormChange(value: TransferFormModel): void {
    this.formData.update(vm => ({ ...vm, ...value }));
    debugFormErrors('TransferForm.onFormChange', this.validationResult().errors, this.currentUser());
  }

  protected onFieldChange(fieldName: string, fieldValue: string | string[] | number | AvatarInfo[] | ResourceInfo): void {
    this.formData.update(vm => ({ ...vm, [fieldName]: fieldValue }));
    debugFormErrors('TransferForm.onFieldChange', this.validationResult().errors, this.currentUser());
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }

  public async selectPerson(name: string): Promise<void> {
    const modal = await this.modalController.create({
      component: PersonSelectModalComponent,
      cssClass: 'list-modal',
      componentProps: {
        selectedTag: '',
        currentUser: this.appStore.currentUser(),
      },
    });
    modal.present();
    const { data, role } = await modal.onWillDismiss();
    if (role === 'confirm') {
      if (isPerson(data, this.appStore.env.tenantId)) {
        if (name === 'subjects') {
          const subjects = this.subjects();
          subjects.push({
            key: data.bkey,
            name1: data.firstName,
            name2: data.lastName,
            label: DEFAULT_LABEL,
            modelType: 'person',
          });
          this.onFieldChange(name, subjects);
        } else {
          const objects = this.objects();
          objects.push({
            key: data.bkey,
            name1: data.firstName,
            name2: data.lastName,
            label: DEFAULT_LABEL,
            modelType: 'person',
          });
          this.onFieldChange(name, objects);
        }
      }
    }
  }

  protected async selectResource(): Promise<void> {
    const modal = await this.modalController.create({
      component: ResourceSelectModalComponent,
      cssClass: 'list-modal',
      componentProps: {
        selectedTag: '',
        currentUser: this.currentUser(),
      },
    });
    modal.present();
    const { data, role } = await modal.onWillDismiss();
    if (role === 'confirm') {
      if (isResource(data, this.appStore.env.tenantId)) {
        const resource = {
          key: data.bkey,
          name: data.name,
          type: data.type,
          subType: data.subType,
        };
        this.onFieldChange('resource', resource);
      }
    }
  }
}
