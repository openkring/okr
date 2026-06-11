import { Component, computed, effect, inject, input } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonAccordion, IonAvatar, IonButton, IonIcon, IonImg, IonItem, IonLabel, IonList } from '@ionic/angular/standalone';

import { ReservationModel, RoleName } from '@bk2/shared-models';
import { DurationPipe, getSvgIconUrl, SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyList } from '@bk2/shared-ui';
import { coerceBoolean, getCategoryIcon, hasRole, isOngoing } from '@bk2/shared-util-core';
import { createActionSheetButton, createActionSheetOptions } from '@bk2/shared-util-angular';

import { ReservationStore } from './reservation.store';

@Component({
  selector: 'bk-reservations-accordion',
  standalone: true,
  imports: [
    SvgIconPipe, DurationPipe,
    EmptyList,
    IonAccordion, IonItem, IonLabel, IonButton, IonIcon, IonAvatar, IonImg, IonList
  ],
  providers: [ReservationStore],
  styles: [`ion-avatar { width: 30px; height: 30px; }`],
  template: `
  <ion-accordion toggle-icon-slot="start" value="reservations">
    <ion-item slot="header" [color]="color()">
      <ion-label>{{ accordionTitle() }}</ion-label>
      @if(!isReadOnly()) {
        <ion-button fill="clear" (click)="add()" size="default">
          <ion-icon color="secondary" slot="icon-only" src="{{'add-circle' | svgIcon }}" />
        </ion-button>
      }
    </ion-item>
    <div slot="content">
      @if(reservations().length === 0) {
        <bk-empty-list [message]="store.i18n.empty()" />
      } @else {
        <ion-list lines="inset">
          @for(reservation of reservations(); track $index) {
            <ion-item (click)="showActions(reservation)">
                <ion-avatar slot="start">
                  <ion-img [src]="getIcon(reservation)" alt="resource avatar" />
                </ion-avatar>

              <ion-label>{{reservation.resource?.name2}}</ion-label>  
              <ion-label>{{ reservation.startDate | duration:reservation.endDate }}</ion-label>
            </ion-item>
          }
        </ion-list>
      }
    </div>
  </ion-accordion>
  `,
})
export class ReservationsAccordion {
  protected readonly store = inject(ReservationStore);
  private actionSheetController = inject(ActionSheetController);
  
  // inputs
  public listId = input.required<string>();
  public color = input('light');
  public title = input<string | undefined>();
  public readOnly = input(true); 

  // coerced boolean inputs
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // derived fields
  protected reservations = computed(() => this.store.filteredReservations());
  private currentUser = computed(() => this.store.currentUser());
  protected accordionTitle = computed(() => this.title() ?? this.store.i18n.reservations());

  private imgixBaseUrl = this.store.appStore.env.services.imgixBaseUrl;
  protected readonly resourceTypes = computed(() => this.store.getResourceTypes());
  private readonly rboatTypes = computed(() => this.store.getRboatTypes());

  constructor() {
    effect(() => {
      this.store.setListId(this.listId());
    });
  }

  /******************************* actions *************************************** */
  protected async add(): Promise<void> {
    await this.store.add(this.isReadOnly());
  }

  /**
   * Displays an ActionSheet with all possible actions on a Reservation. Only actions are shown, that the user has permission for.
   * After user selected an action this action is executed.
   * @param reservation 
   */
  protected async showActions(reservation: ReservationModel): Promise<void> {
    const actionSheetOptions = createActionSheetOptions(this.store.i18n.as_title());
    this.addActionSheetButtons(actionSheetOptions, reservation);
    await this.executeActions(actionSheetOptions, reservation);
  }

  /**
   * Fills the ActionSheet with all possible actions, considering the user permissions.
   * @param reservation 
   */
   private addActionSheetButtons(actionSheetOptions: ActionSheetOptions, reservation: ReservationModel): void {
      if (hasRole('registered', this.currentUser())) {
        actionSheetOptions.buttons.push(createActionSheetButton('view', this.store.i18n.view(), this.imgixBaseUrl, 'eye-on'));
        actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), this.imgixBaseUrl, 'cancel'));
      }
      if (!this.isReadOnly()) {
        actionSheetOptions.buttons.push(createActionSheetButton('edit', this.store.i18n.update(), this.imgixBaseUrl, 'edit'));
        if (isOngoing(reservation.endDate)) {
          actionSheetOptions.buttons.push(createActionSheetButton('endres', this.store.i18n.end(), this.imgixBaseUrl, 'stop-circle'));
        }
      }
      if (hasRole('admin', this.currentUser())) {
        actionSheetOptions.buttons.push(createActionSheetButton('delete', this.store.i18n.delete(), this.imgixBaseUrl, 'trash'));
      }
      if (actionSheetOptions.buttons.length === 1) { // only cancel button
        actionSheetOptions.buttons = [];
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
      if (!data) return;
      switch (data.action) {
        case 'delete':
          await this.store.delete(reservation, this.isReadOnly());
          break;
        case 'edit':
          await this.store.edit(reservation, this.isReadOnly());
          break;
        case 'view':
          await this.store.edit(reservation, true);
          break;
        case 'endres':
          await this.store.end(reservation, this.isReadOnly());
          break;
      }
    }
  }

  /******************************* helpers *************************************** */
  protected hasRole(role?: RoleName): boolean {
    return hasRole(role, this.store.currentUser());
  }

  protected isOngoing(reservation: ReservationModel): boolean {
    return isOngoing(reservation.endDate);
  }

  protected getIcon(reservation: ReservationModel): string {
    const resource = this.store.getResource(reservation.resource?.key || '');
    let iconName = '';
    if (!resource) {
      iconName = 'resource';
    } else {
      if (resource.type === 'rboat') {
        iconName = getCategoryIcon(this.rboatTypes(), resource.subType);
      } else {
        iconName = getCategoryIcon(this.resourceTypes(), resource.type);
      }
    }
    return getSvgIconUrl(this.imgixBaseUrl, iconName);
  }
}
