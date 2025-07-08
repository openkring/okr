import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonAccordionGroup, IonContent, ModalController } from '@ionic/angular/standalone';
import { AsyncPipe } from '@angular/common';

import { TranslatePipe } from '@bk2/shared/i18n';
import { ChangeConfirmationComponent, HeaderComponent, RelationshipToolbarComponent } from '@bk2/shared/ui';
import { hasRole } from '@bk2/shared/util-core';
import { ModelType, ReservationCollection, ReservationModel, UserModel, RoleName } from '@bk2/shared/models';
import { AppStore } from '@bk2/shared/feature';

import { CommentsAccordionComponent } from '@bk2/comment/feature';
import { ReservationFormComponent } from '@bk2/relationship/reservation/ui';
import { convertFormToReservation, convertReservationToForm, getReserverName } from '@bk2/relationship/reservation/util';

@Component({
  selector: 'bk-reservation-edit-modal',
  imports: [
    TranslatePipe, AsyncPipe,
    CommentsAccordionComponent, RelationshipToolbarComponent, HeaderComponent,
    ChangeConfirmationComponent, ReservationFormComponent,
    IonContent, IonAccordionGroup
  ],
  template: `
    <bk-header title="{{ modalTitle() | translate | async }}" [isModal]="true" />
    @if(formIsValid()) {
      <bk-change-confirmation (okClicked)="save()" />
    }
    <ion-content>
      <bk-relationship-toolbar title="@reservation.reldesc" [titleArguments]="titleArguments()" icon="reservation" relLabel="Reservation" />
      <bk-reservation-form [(vm)]="vm" [currentUser]="currentUser()" [reservationTags]="reservationTags()"  (validChange)="formIsValid.set($event)" />

      @if(hasRole('privileged') || hasRole('resourceAdmin')) {
        <ion-accordion-group value="comments">
          <bk-comments-accordion [collectionName]="reservationCollection" [parentKey]="reservationKey()" />
        </ion-accordion-group>
      }
    </ion-content>
  `
})
export class ReservationEditModalComponent {
  private readonly modalController = inject(ModalController);
  private readonly appStore = inject(AppStore);

  public reservation = input.required<ReservationModel>();
  public currentUser = input<UserModel | undefined>();

  public vm = linkedSignal(() => convertReservationToForm(this.reservation()));
  protected reservationTags = computed(() => this.appStore.getTags(ModelType.Reservation));

  protected readonly reservationKey = computed(() => this.reservation().bkey ?? '');
  protected readonly name = computed(() => getReserverName(this.reservation()) ?? '');
  private readonly subjectIcon = computed(() => this.vm().reserverModelType === ModelType.Person ? 'person' : 'org');
  private readonly subjectUrl = computed(() => this.vm().reserverModelType === ModelType.Person ? `/person/${this.vm().reserverKey}` : `/org/${this.vm().reserverKey}`);
  private readonly objectUrl = computed(() => `/resource/${this.vm().resourceKey}`);
  private readonly objectName = computed(() => this.vm().resourceName ?? '');
  protected readonly modalTitle = computed(() => `@reservation.operation.${hasRole('resourceAdmin', this.currentUser()) ? 'update' : 'view'}.label`);

  protected titleArguments = computed(() => ({
    relationship: 'reservation',
    objectName: this.name(),
    objectIcon: this.subjectIcon(),
    objectUrl: this.subjectUrl(),
    subjectName: this.objectName(),
    subjectIcon: 'resource',
    subjectUrl: this.objectUrl()
  }));

  protected formIsValid = signal(false);
  public reservationCollection = ReservationCollection;

  public async save(): Promise<boolean> {
    return this.modalController.dismiss(convertFormToReservation(this.reservation(), this.vm(), this.appStore.tenantId()), 'confirm');
  }

  protected hasRole(role: RoleName | undefined): boolean {
    return hasRole(role, this.currentUser());
  }
}
