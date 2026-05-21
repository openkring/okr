import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonAccordionGroup, IonCard, IonCardContent, IonContent, ModalController } from '@ionic/angular/standalone';

import { AvatarInfo, CalEventModel, CategoryListModel, PersonModelName, ReservationModel, ReservationModelName, ResourceModelName, RoleName, UserModel } from '@bk2/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@bk2/shared-ui';
import { coerceBoolean, getAvatarName, hasRole, safeStructuredClone } from '@bk2/shared-util-core';

import { CommentsAccordion } from '@bk2/comment-feature';
import { ReservationForm } from '@bk2/relationship-reservation-ui';
import { RelationshipToolbar } from '@bk2/avatar-ui';
import { ReservationStore } from './reservation.store';

@Component({
  selector: 'bk-reservation-edit-modal',
  standalone: true,
  imports: [
    CommentsAccordion, RelationshipToolbar, Header, ChangeConfirmation, ReservationForm,
    IonContent, IonAccordionGroup, IonCard, IonCardContent
],
  styles: [` @media (width <= 600px) { ion-card { margin: 5px;} }`],
  providers: [ReservationStore],
  template: `
    <bk-header [i18n]="{ title: headerTitle() }" [isModal]="true" />
    @if(showConfirmation()) {
      <bk-change-confirmation [showCancel]=true [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (okClicked)="save()" />
    }
    <ion-content>
      @if(currentUser(); as currentUser) {
        @if(reserverAvatar(); as reserver) {
          @if(resourceAvatar(); as resource) {
            <bk-relationship-toolbar
              relType="reservation"
              [subjectAvatar]="resource"
              [subjectDefaultIcon]="subjectDefaultIcon()"
              [objectAvatar]="reserver"
              [objectDefaultIcon]="objectDefaultIcon()"
              [currentUser]="currentUser"
            />
          }
        }

        @if(formData(); as formData) {
          <bk-reservation-form
            [formData]="formData"
            (formDataChange)="onFormDataChange($event)"
            [currentUser]="currentUser"
            [allTags]="tags()"
            [tenantId]="tenantId()"
            [reasons]="reasons()"
            [states]="states()"
            [locale]="locale()"
            [readOnly]="isReadOnly()"
            [isSelectable]="isSelectable()"
            [periodicities]="periodicities()"
            (selectReserver)="selectReserver()"
            (selectResource)="selectResource()"
            (dirty)="formDirty.set($event)"
            (valid)="formValid.set($event)"
          />
        }
      }

      @if(hasRole('privileged') || hasRole('resourceAdmin')) {
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-accordion-group value="comments">
              <bk-comments-accordion [parentKey]="parentKey()" />
            </ion-accordion-group>
          </ion-card-content>
        </ion-card>
      }
    </ion-content>
  `
})
export class ReservationEditModal {
  private readonly modalController = inject(ModalController);
  protected readonly store = inject(ReservationStore);

  // inputs
  public reservation = input.required<ReservationModel>();
  public currentUser = input.required<UserModel>();
  public tags = input.required<string>();
  public reasons = input.required<CategoryListModel>();
  public states = input.required<CategoryListModel>();
  public periodicities = input.required<CategoryListModel>();
  public isSelectable = input<boolean>(false);
  public locale = input.required<string>();
  public readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected formData = linkedSignal(() => safeStructuredClone(this.reservation()));
  protected showForm = signal(true);
  protected calevent = signal<CalEventModel | undefined>(undefined);

  protected readonly parentKey = computed(() => `${ReservationModelName}.${this.reservationKey()}`);
  
  // derived signals
  protected readonly headerTitle = computed(() => this.store.getTitleLabel(this.readOnly(), this.reservation()?.bkey));
  protected readonly changeConfirmationI18n = computed(() => ({
    ok: this.store.i18n.changeConfirmation_ok(),
    cancel: this.store.i18n.changeConfirmation_cancel(),
    confirmation: this.store.i18n.changeConfirmation_confirmation(),
  } as ChangeConfirmationI18n));
  protected readonly reservationKey = computed(() => this.reservation().bkey ?? '');
  protected reserverAvatar = computed<AvatarInfo | undefined>(() => this.formData()?.reserver);
  protected readonly reserverName = computed(() => this.reserverAvatar() ? getAvatarName(this.reserverAvatar(), this.currentUser()?.nameDisplay) : '');
  protected readonly resourceAvatar = computed<AvatarInfo | undefined>(() => this.reservation().resource);
  protected readonly resourceName = computed(() => this.resourceAvatar()?.name2 ?? '');
  protected readonly defaultIcon = computed(() => this.store.appStore.getDefaultIcon(ResourceModelName, this.resourceAvatar()?.type, this.resourceAvatar()?.subType));
  protected readonly tenantId = computed(() => this.store.tenantId());
  protected readonly subjectDefaultIcon = computed(() => this.store.appStore.getDefaultIcon(ResourceModelName, this.resourceAvatar()?.type, this.resourceAvatar()?.subType));
  protected readonly objectDefaultIcon = computed(() => this.store.appStore.getDefaultIcon(PersonModelName));

 /******************************* actions *************************************** */
  public async save(): Promise<void> {
    await this.modalController.dismiss(this.formData(), 'confirm');
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.formData.set(safeStructuredClone(this.reservation()));  // reset the form
    // This destroys and recreates the <form scVestForm> → Vest fully resets
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }

  protected onFormDataChange(formData: ReservationModel): void {
    this.formData.set(formData);
  }

  protected hasRole(role: RoleName | undefined): boolean {
    return hasRole(role, this.currentUser());
  }

  protected async selectReserver(): Promise<void> {
    const person = await this.store.selectPerson();
    if (!person) return;

    this.formDirty.set(true);
    this.formData.update((vm) => {
      if (!vm) return vm;
      return {
        ...vm,
        reserverKey: person.bkey,
        reserverName: person.firstName,
        reserverName2: person.lastName,
        reserverModelType: 'person',
        reserverType: person.gender,
        reserver: {
          key: person.bkey ?? '',
          name1: person.firstName,
          name2: person.lastName,
          modelType: 'person',
          type: person.gender,
          subType: '',
          label: `${person.firstName} ${person.lastName}`.trim(),
        } as AvatarInfo
      };
    });
  }

  async selectCalevent(): Promise<void> {
    const calevent = await this.store.selectCalevent(this.readOnly(), this.periodicities(), this.calevent());
    if (!calevent) return;
    this.calevent.set(calevent);
    this.formData.update((vm: ReservationModel | undefined) => {
      if (!vm) return vm;
      return {
        ...vm,
        caleventKey: calevent.bkey,
        startDate: calevent.startDate,
        endDate: calevent.endDate ?? calevent.startDate,
      };
    });
  }

  protected async selectResource(): Promise<void> {
    const resource = await this.store.selectResource();
    if (!resource) return;
    this.formData.update((vm) => {
      if (!vm) return vm;
      return {
        ...vm,
        resourceKey: resource.bkey,
        resourceName: resource.name,
        resourceModelType: 'resource',
        resourceType: resource.type,
        resourceSubType: resource.subType,
      };
    });      
  }
}
