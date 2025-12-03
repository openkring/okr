import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonAccordionGroup, IonCard, IonCardContent, IonContent, ModalController } from '@ionic/angular/standalone';

import { AppStore } from '@bk2/shared-feature';
import { TranslatePipe } from '@bk2/shared-i18n';
import { ReservationModel, ReservationModelName, RoleName } from '@bk2/shared-models';
import { ChangeConfirmationComponent, HeaderComponent, RelationshipToolbarComponent } from '@bk2/shared-ui';
import { hasRole } from '@bk2/shared-util-core';

import { CommentsAccordionComponent } from '@bk2/comment-feature';
import { ReservationFormComponent } from '@bk2/relationship-reservation-ui';
import { convertFormToReservation, convertReservationToForm, getReserverName, ReservationFormModel } from '@bk2/relationship-reservation-util';
import { getTitleLabel } from '@bk2/shared-util-angular';

@Component({
  selector: 'bk-reservation-edit-modal',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe,
    CommentsAccordionComponent, RelationshipToolbarComponent, HeaderComponent,
    ChangeConfirmationComponent, ReservationFormComponent,
    IonContent, IonAccordionGroup, IonCard, IonCardContent
  ],
  styles: [` @media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    <bk-header title="{{ headerTitle() | translate | async }}" [isModal]="true" />
    @if(showConfirmation()) {
      <bk-change-confirmation [showCancel]=true (cancelClicked)="cancel()" (okClicked)="save()" />
    }
    <ion-content>
      <bk-relationship-toolbar title="@reservation.reldesc" [titleArguments]="titleArguments()" icon="reservation" relLabel="Reservation" />
      <bk-reservation-form
        [formData]="formData()"
        [currentUser]="currentUser()"
        [allTags]="tags()"
        [reasons]="reasons()"
        [states]="states()"
        [readOnly]="readOnly()"
        [periodicities]="periodicities()"
        (formDataChange)="onFormDataChange($event)"
      />

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
export class ReservationEditModalComponent {
  private readonly modalController = inject(ModalController);
  private readonly appStore = inject(AppStore);

  // inputs
  public reservation = input.required<ReservationModel>();

  // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected formData = linkedSignal(() => convertReservationToForm(this.reservation()));

  protected readonly parentKey = computed(() => `${ReservationModelName}.${this.reservationKey()}`);
  public currentUser = computed(() => this.appStore.currentUser());
  protected tags = computed(() => this.appStore.getTags('reservation'));
  protected reasons = computed(() => this.appStore.getCategory('reservation_reason'));
  protected states = computed(() => this.appStore.getCategory('reservation_state'));
  protected periodicities = computed(() => this.appStore.getCategory('periodicity'));
  protected readOnly = computed(() => !hasRole('resourceAdmin', this.currentUser()));
  
  // derived signals
  protected readonly headerTitle = computed(() => getTitleLabel('reservation', this.reservation()?.bkey, this.readOnly()));
  protected readonly reservationKey = computed(() => this.reservation().bkey ?? '');
  protected readonly name = computed(() => getReserverName(this.reservation()) ?? '');
  private readonly subjectIcon = computed(() => this.formData().reserverModelType === 'person' ? 'person' : 'org');
  private readonly subjectUrl = computed(() => this.formData().reserverModelType === 'person' ? `/person/${this.formData().reserverKey}` : `/org/${this.formData().reserverKey}`);
  private readonly objectUrl = computed(() => `/resource/${this.formData().resourceKey}`);
  private readonly objectName = computed(() => this.formData().resourceName ?? '');

  protected titleArguments = computed(() => ({
    relationship: 'reservation',
    objectName: this.name(),
    objectIcon: this.subjectIcon(),
    objectUrl: this.subjectUrl(),
    subjectName: this.objectName(),
    subjectIcon: 'resource',
    subjectUrl: this.objectUrl()
  }));

 /******************************* actions *************************************** */
  public async save(): Promise<void> {
    this.formDirty.set(false);
    await this.modalController.dismiss(convertFormToReservation(this.formData(), this.reservation()), 'confirm');
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.formData.set(convertReservationToForm(this.reservation()));  // reset the form
  }

  protected onFormDataChange(formData: ReservationFormModel): void {
    this.formData.set(formData);
  }

  protected hasRole(role: RoleName | undefined): boolean {
    return hasRole(role, this.currentUser());
  }
}
