import { Component, computed, inject, input, linkedSignal, OnInit, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';
import { AsyncPipe } from '@angular/common';

import { TranslatePipe } from '@bk2/shared/i18n';
import { ChangeConfirmationComponent, HeaderComponent } from '@bk2/shared/ui';
import { RoleName } from '@bk2/shared/config';
import { hasRole } from '@bk2/shared/util';
import { ModelType, OrgModel, PersonModel, ResourceModel, UserModel} from '@bk2/shared/models';
import { AppStore } from '@bk2/shared/feature';

import { convertReserverAndResourceToNewForm } from '@bk2/reservation/util';
import { ReservationNewFormComponent } from './reservation-new.form';

@Component({
  selector: 'bk-reservation-new-modal',
  imports: [
    TranslatePipe, AsyncPipe,
    HeaderComponent, ReservationNewFormComponent,
    ChangeConfirmationComponent,
    IonContent
  ],
  template: `
    <bk-header title="{{ '@reservation.operation.create.label' | translate | async }}" [isModal]="true" />
    @if(formIsValid()) {
      <bk-change-confirmation (okClicked)="save()" />
    }
    <ion-content>
      <bk-reservation-new-form [(vm)]="vm" [currentUser]="currentUser()" [reservationTags]="reservationTags()" (validChange)="onValidChange($event)" />
    </ion-content>
  `
})
export class ReservationNewModalComponent implements OnInit {
  private readonly modalController = inject(ModalController);
  private readonly appStore = inject(AppStore);

  public reserver = input.required<PersonModel | OrgModel>();
  public resource = input.required<ResourceModel>(); 
  public currentUser = input<UserModel | undefined>();
  public modelType = input.required<ModelType>();

  public vm = linkedSignal(() => convertReserverAndResourceToNewForm(this.reserver(), this.resource(), this.currentUser(), this.modelType()));
  protected reservationTags = computed(() => this.appStore.getTags(ModelType.Reservation));

  protected formIsValid = signal(false);

  ngOnInit() {
    // as we prepared everything with defaultMember and defaultOrg, we already have a valid form, so we need to signal this here.
    this.onValidChange(true);
  }

  public async save(): Promise<boolean> {
    return this.modalController.dismiss(this.vm(), 'confirm');
  }

  protected hasRole(role: RoleName | undefined): boolean {
    return hasRole(role, this.currentUser());
  }

  protected onValidChange(valid: boolean): void {
    this.formIsValid.set(valid);
  }
}
