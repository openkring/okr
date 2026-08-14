import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { IonContent, IonNote, ModalController } from '@ionic/angular/standalone';

import { AvatarInfo, CalEventModel, PersonModelName, ReservationApplyModel, ResourceModelName, RoleName } from '@okr/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { fill, getAvatarName, hasRole } from '@okr/shared-util-core';

import { CalEventEditModal } from '@okr/calevent-feature';
import { isCalEvent } from '@okr/calevent-util';

import { ReservationApplyForm } from '@okr/relationship-reservation-ui';
import { RelationshipToolbar } from '@okr/avatar-ui';
import { convertApplyToReservation, getNewReservationApply } from '@okr/relationship-reservation-util';
import { ReservationStore } from './reservation.store';

@Component({
  selector: 'okr-reservation-apply-modal',
  standalone: true,
  imports: [
    RelationshipToolbar, Header, ChangeConfirmation, ReservationApplyForm,
    IonContent, IonNote
  ],
  providers: [ReservationStore],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px;} }
    .validation-hint { display: block; padding: 10px 16px; }
  `],
  template: `
    <okr-header [i18n]="{ title: headerTitle() }" [isModal]="true" />
    @if(showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    } @else if(showValidationHint()) {
      <ion-note color="danger" class="validation-hint">
        {{ validationHint() }}
      </ion-note>
    }
    <ion-content>
      @if(currentUser(); as currentUser) {
        @if(reserverAvatar(); as reserver) {
          @if(resourceAvatar(); as resource) {
            <okr-relationship-toolbar
              relType="reservation"
              [subjectAvatar]="resource"
              [subjectDefaultIcon]="subjectDefaultIcon()"
              [objectAvatar]="reserver"
              [objectDefaultIcon]="objectDefaultIcon()"
              [relDesc1]="store.i18n.reldesc1()" [relDesc2]="store.i18n.reldesc2()"
              [currentUser]="currentUser"
              [readOnly]="true"
            />
          }
        }

        @if(formData(); as formData) {
          <okr-reservation-apply-form
            [i18n]="store.i18n"
            [formData]="formData"
            (formDataChange)="onFormDataChange($event)"
            [currentUser]="currentUser"
            [tenantId]="tenantId()"
            [reasons]="reasons()"
            [locale]="locale()"
            [periodicities]="periodicities()"
            (valid)="formValid.set($event)"
            (invalidFields)="invalidFields.set($event)"
          />
        }
      }
    </ion-content>
  `
})
export class ReservationApplyModal {
  private readonly modalController = inject(ModalController);
  protected readonly store = inject(ReservationStore);

  protected readonly currentUser = computed(() => this.store.currentUser());
  private resource = computed(() => this.store.defaultResource());
  protected readonly reasons = computed(() => this.store.appStore.getCategory('reservation_reason'));
  protected readonly periodicities = computed(() => this.store.appStore.getCategory('periodicity'));
  protected readonly locale = computed(() => this.store.appStore.appConfig().locale);
  // seeded once, as soon as currentUser and resource are both loaded. It must NOT be a linkedSignal:
  // defaultResource() is derived from live Firestore streams, so every re-emission would hand back a
  // new object reference (or transiently undefined) and wipe out what the user has entered so far.
  protected formData = signal<ReservationApplyModel | undefined>(undefined);

  // signals
  protected formValid = signal(false);
  protected invalidFields = signal<string[]>([]);
  protected calevent = signal<CalEventModel | undefined>(undefined);

  // derived signals
  protected readonly headerTitle = computed(() => this.store.getTitleLabel(false, undefined));
  protected showConfirmation = computed(() => this.formData()?.isConfirmed === true && this.formValid());
  // the user has accepted the contract and expects a save bar -> explain why it is still missing
  protected showValidationHint = computed(() => this.formData()?.isConfirmed === true && !this.formValid() && this.invalidFields().length > 0);
  protected validationHint = computed(() => fill(this.store.i18n.apply_invalid(), { fields: this.invalidFields().join(', ') }));
  protected readonly changeConfirmationI18n = computed(() => ({ cancel: this.store.i18n.cancel(), save: this.store.i18n.save()} as ChangeConfirmationI18n));
  protected readonly toolbarTitle = computed(() => this.store.i18n.reldesc1() + this.resourceName + this.store.i18n.reldesc1() + this.reserverName());
  protected reserverAvatar = computed<AvatarInfo | undefined>(() => this.formData()?.reserver);
  protected readonly reserverName = computed(() => this.reserverAvatar() ? getAvatarName(this.reserverAvatar(), this.currentUser()?.nameDisplay) : '');
  protected readonly resourceAvatar = computed<AvatarInfo | undefined>(() => this.formData()?.resource);
  protected readonly resourceName = computed(() => this.resourceAvatar()?.name2 ?? '');
  protected readonly defaultIcon = computed(() => this.store.appStore.getDefaultIcon(ResourceModelName, this.resourceAvatar()?.type, this.resourceAvatar()?.subType));
  protected readonly tenantId = computed(() => this.store.tenantId());
  protected readonly subjectDefaultIcon = computed(() => this.store.appStore.getDefaultIcon(ResourceModelName, this.resourceAvatar()?.type, this.resourceAvatar()?.subType));
  protected readonly objectDefaultIcon = computed(() => this.store.appStore.getDefaultIcon(PersonModelName));

  constructor() {
    effect(() => {
      const currentUser = this.currentUser();
      const resource = this.resource();
      if (!currentUser || !resource) return;          // still loading -> wait
      if (untracked(this.formData)) return;           // already seeded -> never clobber user input
      this.formData.set(getNewReservationApply(currentUser, resource));
    });
  }

 /******************************* actions *************************************** */
  public async save(): Promise<void> {
    const res = convertApplyToReservation(this.formData(), this.tenantId());
    if (res) {
        await this.modalController.dismiss(res, 'confirm');
    } else {
        this.modalController?.dismiss(null, 'cancel');
    }
  }

  public async cancel(): Promise<void> {
    this.modalController?.dismiss(null, 'cancel');  // the modal is destroyed -> no need to reset the form
  }

  protected onFormDataChange(formData: ReservationApplyModel): void {
    this.formData.set(formData);
  }

  protected hasRole(role: RoleName | undefined): boolean {
    return hasRole(role, this.currentUser());
  }

  async selectCalevent(): Promise<void> {
    const modal = await this.modalController.create({
      component: CalEventEditModal,
      cssClass: 'wide-modal',
      componentProps: {
            calevent: this.calevent() ?? new CalEventModel(this.tenantId()),
            currentUser: this.currentUser(),
            types: this.store.appStore.getCategory('calevent_type'),
            periodicities: this.periodicities(),
            tags: this.store.appStore.getTags('calevent'),
            tenantId: this.tenantId(),
            locale: this.store.appStore.appConfig().locale,
            readOnly: false
      }
    });
    modal.present();
    const { data, role } = await modal.onWillDismiss();
    if (role === 'confirm' && data) {
      if (isCalEvent(data, this.tenantId())) {
        this.calevent.set(data);
        this.formData.update((vm: ReservationApplyModel | undefined) => {
          if (!vm) return vm;
          return {
            ...vm,
            caleventKey: data.okey,
            startDate: data.startDate,
            endDate: data.endDate ?? data.startDate,
          };
        });
      }
    }
  }
}
