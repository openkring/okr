import { AsyncPipe } from '@angular/common';
import { Component, computed, effect, inject, input } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonAccordion, IonButton, IonIcon, IonImg, IonItem, IonLabel, IonList, IonThumbnail } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { ModelType, OrgModel, PersonModel, ReservationModel, ResourceModel, RoleName } from '@bk2/shared-models';
import { DurationPipe, SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyListComponent } from '@bk2/shared-ui';
import { getAvatarKey, hasRole, isOngoing } from '@bk2/shared-util-core';

import { AvatarPipe } from '@bk2/avatar-ui';

import { ReservationsAccordionStore } from './reservations-accordion.store';
import { createActionSheetButton, createActionSheetOptions } from '@bk2/shared-util-angular';

@Component({
  selector: 'bk-reservations-accordion',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe, AvatarPipe, DurationPipe,
    EmptyListComponent,
    IonAccordion, IonItem, IonLabel, IonButton, IonIcon, IonThumbnail, IonImg, IonList
  ],
  providers: [ReservationsAccordionStore],
  styles: [`
    ion-thumbnail { width: 30px; height: 30px; }
  `],
  template: `
  <ion-accordion toggle-icon-slot="start" value="reservations">
    <ion-item slot="header" [color]="color()">
      <ion-label>{{ title() | translate | async }}</ion-label>
      @if(hasRole('resourceAdmin')) {
        <ion-button fill="clear" (click)="add()" size="default">
          <ion-icon color="secondary" slot="icon-only" src="{{'add-circle' | svgIcon }}" />
        </ion-button>
      }
    </ion-item>
    <div slot="content">
      @if(reservations().length === 0) {
        <bk-empty-list message="@reservation.field.empty" />
      } @else {
        <ion-list lines="inset">
          @for(reservation of reservations(); track $index) {
            <ion-item (click)="showActions(reservation)">
              <ion-thumbnail slot="start">
                <ion-img [src]="getAvatarKey(reservation) | avatar | async" alt="resource avatar" />
              </ion-thumbnail>
              <ion-label>{{reservation.resourceName}}</ion-label>  
              <ion-label>{{ reservation.startDate | duration:reservation.endDate }}</ion-label>
            </ion-item>
          }
        </ion-list>
      }
    </div>
  </ion-accordion>
  `,
})
export class ReservationsAccordionComponent {
  private readonly reservationsStore = inject(ReservationsAccordionStore);
    private actionSheetController = inject(ActionSheetController);
  
  public color = input('light');
  public title = input('@reservation.plural');

  public reserver = input.required<PersonModel | OrgModel>();
  public reserverModelType = input<ModelType>(ModelType.Person);
  public defaultResource = input<ResourceModel>();
  protected reservations = computed(() => this.reservationsStore.reservations());

  protected modelType = ModelType;
  private imgixBaseUrl = this.reservationsStore.appStore.env.services.imgixBaseUrl;

  constructor() {
    effect(() => this.reservationsStore.setReserver(this.reserver(), this.reserverModelType()));
  }

  /******************************* getters *************************************** */
  // 20.0:key for a rowing boat, 20.4:key for a locker
  protected getAvatarKey(reservation: ReservationModel): string {
    return getAvatarKey(reservation.resourceModelType, reservation.resourceKey, reservation.resourceType, reservation.resourceSubType);
  }

  /******************************* actions *************************************** */
  protected async add(): Promise<void> {
    const resource = this.defaultResource();
    if (resource) {
      await this.reservationsStore.add(this.reserver(), this.reserverModelType(), resource);
    }
  }

  /**
   * Displays an ActionSheet with all possible actions on a Reservation. Only actions are shown, that the user has permission for.
   * After user selected an action this action is executed.
   * @param reservation 
   */
  protected async showActions(reservation: ReservationModel): Promise<void> {
    const actionSheetOptions = createActionSheetOptions('@actionsheet.label.choose');
    this.addActionSheetButtons(actionSheetOptions, reservation);
    await this.executeActions(actionSheetOptions, reservation);
  }

  /**
   * Fills the ActionSheet with all possible actions, considering the user permissions.
   * @param reservation 
   */
  private addActionSheetButtons(actionSheetOptions: ActionSheetOptions, reservation: ReservationModel): void {
    if (hasRole('resourceAdmin', this.reservationsStore.appStore.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('edit', this.imgixBaseUrl, 'create_edit'));
      if (isOngoing(reservation.endDate)) {
        actionSheetOptions.buttons.push(createActionSheetButton('endres', this.imgixBaseUrl, 'stop-circle'));
      }
      actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.imgixBaseUrl, 'close_cancel'));
    }
    if (hasRole('admin', this.reservationsStore.appStore.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('delete', this.imgixBaseUrl, 'trash_delete'));
    }
  }

  /**
   * Displays the ActionSheet, waits for the user to select an action and executes the selected action.
   * @param actionSheetOptions 
   * @param reservation 
   */
  private async executeActions(actionSheetOptions: ActionSheetOptions, reservation: ReservationModel): Promise<void> {
    if (actionSheetOptions.buttons.length > 0) {
      const actionSheet = await this.actionSheetController.create(actionSheetOptions);
      await actionSheet.present();
      const { data } = await actionSheet.onDidDismiss();
      switch (data.action) {
        case 'delete':
          await this.reservationsStore.delete(reservation);
          break;
        case 'edit':
          await this.reservationsStore.edit(reservation);
          break;
        case 'endres':
          await this.reservationsStore.end(reservation);
          break;
      }
    }
  }

  /******************************* helpers *************************************** */
  protected hasRole(role?: RoleName): boolean {
    return hasRole(role, this.reservationsStore.currentUser());
  }

  protected isOngoing(reservation: ReservationModel): boolean {
    return isOngoing(reservation.endDate);
  }
}
