import { inject, Injectable } from "@angular/core";
import { ModalController } from "@ionic/angular/standalone";

import { AppStore } from "@bk2/shared-feature";
import { ModelType, OrgModel, PersonModel, ReservationModel, ResourceModel } from "@bk2/shared-models";

import { ReservationService } from "@bk2/relationship-reservation-data-access";
import { convertFormToNewReservation, isReservation, ReservationNewFormModel } from "@bk2/relationship-reservation-util";

import { ReservationEditModalComponent } from "./reservation-edit.modal";
import { ReservationNewModalComponent } from "./reservation-new.modal";

@Injectable({
    providedIn: 'root'
})
export class ReservationModalsService {
  private readonly modalController = inject(ModalController);
  private readonly appStore = inject(AppStore);
  private readonly reservationService = inject(ReservationService);
  
  private readonly tenantId = this.appStore.tenantId();
  
 /**
   * Show a modal to add a new reservation.
   * @param reserver person or org that makes the reservation
   * @param resource the resource to be reserved
   * @param modelType the type of the reserver (Person or Org)
   */
  public async add(reserver: PersonModel | OrgModel, modelType: ModelType, resource: ResourceModel): Promise<void> {
    const _modal = await this.modalController.create({
      component: ReservationNewModalComponent,
      cssClass: 'small-modal',
      componentProps: {
        reserver: reserver,
        resource: resource,
        modelType: modelType,
        currentUser: this.appStore.currentUser()
      }
    });
    _modal.present();
    const { data, role } = await _modal.onDidDismiss();
    if (role === 'confirm') {
      const _reservation = convertFormToNewReservation(data as ReservationNewFormModel, this.tenantId);
      await this.reservationService.create(_reservation, this.appStore.currentUser());
    }
  } 
  
  /**
   * Show a modal to edit an existing reservation.
   * @param reservation the reservation to edit
   */
  public async edit(reservation?: ReservationModel): Promise<void> {
    let _reservation = reservation;
    _reservation ??= new ReservationModel(this.tenantId);
    
    const _modal = await this.modalController.create({
      component: ReservationEditModalComponent,
      componentProps: {
        reservation: _reservation,
        currentUser: this.appStore.currentUser()
      }
    });
    _modal.present();
    const { data, role } = await _modal.onDidDismiss();
    if (role === 'confirm') {
      if (isReservation(data, this.tenantId)) {
        await (!data.bkey ? 
          this.reservationService.create(data, this.appStore.currentUser()) : 
          this.reservationService.update(data, this.appStore.currentUser()));
      }
    }
  }
}