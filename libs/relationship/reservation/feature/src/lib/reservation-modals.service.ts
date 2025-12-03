import { inject, Injectable } from "@angular/core";
import { ModalController } from "@ionic/angular/standalone";

import { AppStore } from "@bk2/shared-feature";
import { OrgModel, PersonModel, ReservationModel, ResourceModel } from "@bk2/shared-models";

import { ReservationService } from "@bk2/relationship-reservation-data-access";
import { convertFormToNewReservation, isReservation, ReservationFormModel } from "@bk2/relationship-reservation-util";

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
  public async add(reserver: PersonModel | OrgModel, modelType: 'person' | 'org', resource: ResourceModel): Promise<void> {
    const modal = await this.modalController.create({
      component: ReservationNewModalComponent,
      cssClass: 'small-modal',
      componentProps: {
        reserver: reserver,
        resource: resource,
        modelType: modelType
      }
    });
    modal.present();
    const { data, role } = await modal.onDidDismiss();
    if (role === 'confirm') {
      const reservation = convertFormToNewReservation(data as ReservationFormModel, this.tenantId);
      await this.reservationService.create(reservation, this.appStore.currentUser());
    }
  } 
  
  /**
   * Show a modal to edit an existing reservation.
   * @param reservation the reservation to edit
   */
  public async edit(reservation?: ReservationModel): Promise<void> {
    reservation ??= new ReservationModel(this.tenantId);
    
    const modal = await this.modalController.create({
      component: ReservationEditModalComponent,
      componentProps: {
        reservation: reservation,
        currentUser: this.appStore.currentUser()
      }
    });
    modal.present();
    const { data, role } = await modal.onDidDismiss();
    if (role === 'confirm') {
      if (isReservation(data, this.tenantId)) {
        await (!data.bkey ? 
          this.reservationService.create(data, this.appStore.currentUser()) : 
          this.reservationService.update(data, this.appStore.currentUser()));
      }
    }
  }
}