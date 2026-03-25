import { Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { AvatarInfo, CalEventModel, PersonModelName, ReservationApplyModel, ResourceModelName, RoleName } from '@bk2/shared-models';
import { ChangeConfirmationComponent, HeaderComponent } from '@bk2/shared-ui';
import { getAvatarName, hasRole, safeStructuredClone } from '@bk2/shared-util-core';
import { getTitleLabel } from '@bk2/shared-util-angular';
import { AppStore } from '@bk2/shared-feature';

import { CalEventEditModalComponent } from '@bk2/calevent-feature';
import { isCalEvent } from '@bk2/calevent-util';

import { ReservationApplyForm } from '@bk2/relationship-reservation-ui';
import { RelationshipToolbarComponent } from '@bk2/avatar-ui';
import { convertApplyToReservation, getNewReservationApply } from '@bk2/relationship-reservation-util';

@Component({
  selector: 'bk-reservation-apply-modal',
  standalone: true,
  imports: [
    RelationshipToolbarComponent, HeaderComponent,
    ChangeConfirmationComponent, ReservationApplyForm,
    IonContent
],
  styles: [` @media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    <bk-header [title]="headerTitle()" [isModal]="true" [showCloseButton]="false" />
    @if(showConfirmation()) {
      <bk-change-confirmation [showCancel]=true (cancelClicked)="cancel()" (okClicked)="save()" />
    }
    <ion-content>
      @if(currentUser(); as currentUser) {
        @if(reserverAvatar(); as reserver) {
          @if(resourceAvatar(); as resource) {
            <bk-relationship-toolbar
              relType="reservation"
              title="@reservation.reldesc"
              [subjectAvatar]="resource"
              [subjectDefaultIcon]="subjectDefaultIcon()"
              [objectAvatar]="reserver"
              [objectDefaultIcon]="objectDefaultIcon()"
              [currentUser]="currentUser"
              [readOnly]="true"
              icon="reservation"
              relLabel="Reservation"
            />
          }
        }

        @if(formData(); as formData) {
          <bk-reservation-apply-form
            [formData]="formData"
            (formDataChange)="onFormDataChange($event)"
            [currentUser]="currentUser"
            [tenantId]="tenantId()"
            [reasons]="reasons()"
            [locale]="locale()"
            [periodicities]="periodicities()"
            (valid)="formValid.set($event)"
          />
        }
      }
    </ion-content>
  `
})
export class ReservationApplyModal {
  private readonly modalController = inject(ModalController);
  private readonly appstore = inject(AppStore);

  protected readonly currentUser = computed(() => this.appstore.currentUser());
  private resource = computed(() => this.appstore.defaultResource());
  protected readonly reasons = computed(() => this.appstore.getCategory('reservation_reason'));
  protected readonly periodicities = computed(() => this.appstore.getCategory('periodicity'));
  protected readonly locale = computed(() => this.appstore.appConfig().locale);
  protected formData = linkedSignal(() => getNewReservationApply(this.currentUser(), this.resource()));

  // signals
  protected formValid = signal(false);
  protected showConfirmation = computed(() => this.formData()?.isConfirmed === true && this.formValid());
  protected calevent = signal<CalEventModel | undefined>(undefined);

  // derived signals
  protected readonly headerTitle = computed(() => getTitleLabel('reservation', undefined, false));
  protected reserverAvatar = computed<AvatarInfo | undefined>(() => this.formData()?.reserver);
  protected readonly reserverName = computed(() => this.reserverAvatar() ? getAvatarName(this.reserverAvatar(), this.currentUser()?.nameDisplay) : '');
  protected readonly resourceAvatar = computed<AvatarInfo | undefined>(() => this.formData()?.resource);
  protected readonly defaultIcon = computed(() => this.appstore.getDefaultIcon(ResourceModelName, this.resourceAvatar()?.type, this.resourceAvatar()?.subType));
  protected readonly tenantId = computed(() => this.appstore.tenantId());
  protected readonly subjectDefaultIcon = computed(() => this.appstore.getDefaultIcon(ResourceModelName, this.resourceAvatar()?.type, this.resourceAvatar()?.subType));
  protected readonly objectDefaultIcon = computed(() => this.appstore.getDefaultIcon(PersonModelName));

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
    this.formData.set(getNewReservationApply(this.currentUser(), this.resource()));  // reset the form
    this.modalController?.dismiss(null, 'cancel');
  }

  protected onFormDataChange(formData: ReservationApplyModel): void {
    this.formData.set(formData);
  }

  protected hasRole(role: RoleName | undefined): boolean {
    return hasRole(role, this.currentUser());
  }

  async selectCalevent(): Promise<void> {
    const modal = await this.modalController.create({
      component: CalEventEditModalComponent,
      cssClass: 'wide-modal',
      componentProps: {
            calevent: this.calevent() ?? new CalEventModel(this.tenantId()),
            currentUser: this.currentUser(),
            types: this.appstore.getCategory('calevent_type'),
            periodicities: this.periodicities(),
            tags: this.appstore.getTags('calevent'),
            tenantId: this.tenantId(),
            locale: this.appstore.appConfig().locale,
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
            caleventKey: data.bkey,
            startDate: data.startDate,
            endDate: data.endDate ?? data.startDate,
          };
        });
      }
    }
  }
}
