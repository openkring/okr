import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input, linkedSignal, model, output, signal } from '@angular/core';
import { IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonInput, IonItem, IonRow, ModalController } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { DEFAULT_CURRENCY, DEFAULT_LABEL, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_PRICE, DEFAULT_TAGS, DEFAULT_TRANSFER_STATE, DEFAULT_TRANSFER_TYPE, NAME_LENGTH } from '@bk2/shared-constants';
import { AppStore, PersonSelectModalComponent, ResourceSelectModalComponent } from '@bk2/shared-feature';
import { TranslatePipe } from '@bk2/shared-i18n';
import { AvatarInfo, DefaultResourceInfo, ResourceInfo, RoleName, UserModel } from '@bk2/shared-models';
import { AvatarsComponent, CategorySelectComponent, ChipsComponent, DateInputComponent, NotesInputComponent, NumberInputComponent, TextInputComponent } from '@bk2/shared-ui';
import { debugFormErrors, getTodayStr, hasRole, isPerson, isResource } from '@bk2/shared-util-core';

import { TransferFormModel, transferFormModelShape, transferFormValidations } from '@bk2/relationship-transfer-util';

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
  template: `
    <form scVestForm [formShape]="shape" [formValue]="vm()" [suite]="suite" (dirtyChange)="dirtyChange.set($event)" (formValueChange)="onValueChange($event)">
      <!-- subjects -->
      <bk-avatars (changed)="onChange('subjects', $event)" (selectClicked)="selectPerson('subjects')" [avatars]="subjects()" title="@transfer.field.subjects" addLabel="@transfer.operation.addSubject.label" />

      <!-- objects -->
      <bk-avatars (changed)="onChange('objects', $event)" (selectClicked)="selectPerson('objects')" [avatars]="objects()" title="@transfer.field.objects" addLabel="@transfer.operation.addObject.label" />

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
                <bk-text-input name="name" [value]="name()" [maxLength]="nameLength" [readOnly]="readOnly()" (changed)="onChange('name', $event)" />
              </ion-col>

              <ion-col size="12" size-md="6">
                <bk-cat-select [category]="types()!" selectedItemName="type()" [withAll]="false" (changed)="onChange('type', $event)" />
              </ion-col>

              @if(type() === 'custom') {
              <ion-col size="12" size-md="6">
                <bk-text-input name="label" [value]="label()" [maxLength]="nameLength" [readOnly]="readOnly()" (changed)="onChange('label', $event)" />
              </ion-col>
              }

              <ion-col size="12" size-md="6">
                <bk-cat-select [category]="states()!" selectedItemName="state()" [withAll]="false" (changed)="onChange('state', $event)" />
              </ion-col>

              <ion-col size="12" size-md="6">
                <bk-date-input name="dateOfTransfer" [storeDate]="dateOfTransfer()" [locale]="locale()" [showHelper]="true" [readOnly]="readOnly()" (changed)="onChange('dateOfTransfer', $event)" />
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
                <bk-number-input name="price" [value]="price()" [maxLength]="6" [readOnly]="readOnly()" (changed)="onChange('price', $event)" />
              </ion-col>

              <ion-col size="12" size-md="6">
                <bk-text-input name="currency" [value]="currency()" [maxLength]="20" [readOnly]="readOnly()" (changed)="onChange('currency', $event)" />
              </ion-col>

              <ion-col size="12" size-md="6">
                <bk-cat-select [category]="periodicities()!" selectedItemName="periodicity()" [withAll]="false" (changed)="onChange('periodicity', $event)" />
              </ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>

      @if(hasRole('privileged')) {
      <bk-chips chipName="tag" [storedChips]="tags()" [allChips]="allTags()" [readOnly]="readOnly()" (changed)="onChange('tags', $event)" />
      } @if(hasRole('admin')) {
      <bk-notes name="notes" [value]="notes()" (changed)="onChange('notes', $event)" />
      }
    </form>
  `,
})
export class TransferFormComponent {
  protected modalController = inject(ModalController);
  private readonly appStore = inject(AppStore);

  public vm = model.required<TransferFormModel>();

  protected readonly currentUser = computed(() => this.appStore.currentUser());
  protected readonly allTags = computed(() => this.appStore.getTags('transfer'));
  protected readonly types = computed(() => this.appStore.getCategory('transfer_type'));
  protected readonly states = computed(() => this.appStore.getCategory('transfer_state'));
  protected readonly periodicities = computed(() => this.appStore.getCategory('periodicity'));

  public readOnly = computed(() => !hasRole('resourceAdmin', this.currentUser()));
  protected tags = computed(() => this.vm().tags ?? DEFAULT_TAGS);
  protected notes = computed(() => this.vm().notes ?? DEFAULT_NOTES);
  protected name = computed(() => this.vm().name ?? DEFAULT_NAME);

  protected subjects = linkedSignal(() => this.vm().subjects ?? []);
  protected objects = linkedSignal(() => this.vm().objects ?? []);

  protected dateOfTransfer = computed(() => this.vm().dateOfTransfer ?? getTodayStr());
  protected resourceName = computed(() => this.vm().resource?.name ?? DEFAULT_NAME);
  protected type = computed(() => this.vm().type ?? DEFAULT_TRANSFER_TYPE);
  protected state = computed(() => this.vm().state ?? DEFAULT_TRANSFER_STATE);
  protected label = computed(() => this.vm().label ?? DEFAULT_LABEL);
  protected price = computed(() => this.vm().price ?? DEFAULT_PRICE);
  protected currency = computed(() => this.vm().currency ?? DEFAULT_CURRENCY);
  protected periodicity = computed(() => this.vm().periodicity ?? 'yearly');
  protected readonly locale = computed(() => this.appStore.appConfig().locale);

  public validChange = output<boolean>();
  protected dirtyChange = signal(false);

  protected readonly suite = transferFormValidations;
  protected readonly shape = transferFormModelShape;
  private readonly validationResult = computed(() => transferFormValidations(this.vm()));
  protected nameErrors = computed(() => this.validationResult().getErrors('name'));

  protected nameLength = NAME_LENGTH;

  protected onResourceNameChange($event: Event): void {
    const resource = DefaultResourceInfo;
    resource.name = ($event.target as HTMLInputElement).value ?? '';
    this.vm.update(vm => ({ ...vm, resource }));
    this.dirtyChange.set(true); // it seems, that vest is not updating dirty by itself for this change
    this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
  }

  protected onValueChange(value: TransferFormModel): void {
    this.vm.update(_vm => ({ ..._vm, ...value }));
    this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
  }

  protected onChange(fieldName: string, $event: string | string[] | number | AvatarInfo[] | ResourceInfo): void {
    this.vm.update(vm => ({ ...vm, [fieldName]: $event }));
    debugFormErrors('TransferForm', this.validationResult().errors, this.currentUser());
    this.dirtyChange.set(true); // it seems, that vest is not updating dirty by itself for this change
    this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
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
          this.onChange(name, subjects);
        } else {
          const objects = this.objects();
          objects.push({
            key: data.bkey,
            name1: data.firstName,
            name2: data.lastName,
            label: DEFAULT_LABEL,
            modelType: 'person',
          });
          this.onChange(name, objects);
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
        this.onChange('resource', resource);
      }
    }
  }
}
