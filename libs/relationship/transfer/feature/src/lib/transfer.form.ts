import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input, linkedSignal, model, output, signal } from '@angular/core';
import { IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonInput, IonItem, IonRow, ModalController } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { PeriodicityTypes, TransferStates, TransferTypes } from '@bk2/shared-categories';
import { NAME_LENGTH } from '@bk2/shared-constants';
import { AppStore, PersonSelectModalComponent, ResourceSelectModalComponent } from '@bk2/shared-feature';
import { TranslatePipe } from '@bk2/shared-i18n';
import { AvatarInfo, DefaultResourceInfo, ModelType, Periodicity, ResourceInfo, RoleName, TransferState, TransferType, UserModel } from '@bk2/shared-models';
import { AvatarsComponent, CategoryComponent, ChipsComponent, DateInputComponent, NotesInputComponent, NumberInputComponent, TextInputComponent } from '@bk2/shared-ui';
import { debugFormErrors, getTodayStr, hasRole, isPerson, isResource } from '@bk2/shared-util-core';

import { TransferFormModel, transferFormModelShape, transferFormValidations } from '@bk2/relationship-transfer-util';

@Component({
  selector: 'bk-transfer-form',
  standalone: true,
  imports: [vestForms, TranslatePipe, AsyncPipe, CategoryComponent, DateInputComponent, TextInputComponent, ChipsComponent, NotesInputComponent, NumberInputComponent, AvatarsComponent, IonGrid, IonRow, IonCol, IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonItem, IonInput, IonButton],
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
                <bk-cat name="type" [value]="type()" [categories]="transferTypes" (changed)="onChange('type', $event)" />
              </ion-col>

              @if(type() === transferType.Custom) {
              <ion-col size="12" size-md="6">
                <bk-text-input name="label" [value]="label()" [maxLength]="nameLength" [readOnly]="readOnly()" (changed)="onChange('label', $event)" />
              </ion-col>
              }

              <ion-col size="12" size-md="6">
                <bk-cat name="state" [value]="state()" [categories]="transferStates" (changed)="onChange('state', $event)" />
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
                <bk-cat name="periodicity" [value]="periodicity()" [categories]="periodicities" (changed)="onChange('periodicity', $event)" />
              </ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>

      @if(hasRole('privileged')) {
      <bk-chips chipName="tag" [storedChips]="tags()" [allChips]="transferTags()" [readOnly]="readOnly()" (changed)="onChange('tags', $event)" />
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
  public currentUser = input<UserModel | undefined>();
  public transferTags = input.required<string>();

  public readOnly = computed(() => !hasRole('resourceAdmin', this.currentUser()));
  protected tags = computed(() => this.vm().tags ?? '');
  protected notes = computed(() => this.vm().notes ?? '');
  protected name = computed(() => this.vm().name ?? '');

  protected subjects = linkedSignal(() => this.vm().subjects ?? []);
  protected objects = linkedSignal(() => this.vm().objects ?? []);

  protected dateOfTransfer = computed(() => this.vm().dateOfTransfer ?? getTodayStr());
  protected resourceName = computed(() => this.vm().resource?.name ?? '');
  protected type = computed(() => this.vm().type ?? TransferType.Purchase);
  protected state = computed(() => this.vm().state ?? TransferState.Initial);
  protected label = computed(() => this.vm().label ?? '');
  protected price = computed(() => this.vm().price ?? 0);
  protected currency = computed(() => this.vm().currency ?? 'CHF');
  protected periodicity = computed(() => this.vm().periodicity ?? Periodicity.Yearly);
  protected readonly locale = computed(() => this.appStore.appConfig().locale);

  public validChange = output<boolean>();
  protected dirtyChange = signal(false);

  protected readonly suite = transferFormValidations;
  protected readonly shape = transferFormModelShape;
  private readonly validationResult = computed(() => transferFormValidations(this.vm()));
  protected nameErrors = computed(() => this.validationResult().getErrors('name'));

  protected periodicities = PeriodicityTypes;
  protected transferStates = TransferStates;
  protected transferType = TransferType;
  protected transferTypes = TransferTypes;
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
    const _modal = await this.modalController.create({
      component: PersonSelectModalComponent,
      cssClass: 'list-modal',
      componentProps: {
        selectedTag: '',
        currentUser: this.appStore.currentUser(),
      },
    });
    _modal.present();
    const { data, role } = await _modal.onWillDismiss();
    if (role === 'confirm') {
      if (isPerson(data, this.appStore.env.tenantId)) {
        if (name === 'subjects') {
          const subjects = this.subjects();
          subjects.push({
            key: data.bkey,
            name1: data.firstName,
            name2: data.lastName,
            label: '',
            modelType: ModelType.Person,
          });
          this.onChange(name, subjects);
        } else {
          const objects = this.objects();
          objects.push({
            key: data.bkey,
            name1: data.firstName,
            name2: data.lastName,
            label: '',
            modelType: ModelType.Person,
          });
          this.onChange(name, objects);
        }
      }
    }
  }

  protected async selectResource(): Promise<void> {
    const _modal = await this.modalController.create({
      component: ResourceSelectModalComponent,
      cssClass: 'list-modal',
      componentProps: {
        selectedTag: '',
        currentUser: this.currentUser(),
      },
    });
    _modal.present();
    const { data, role } = await _modal.onWillDismiss();
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
