import { AsyncPipe } from '@angular/common';
import { Component, computed, effect, inject, input } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonAccordion, IonAvatar, IonButton, IonIcon, IonImg, IonItem, IonLabel, IonList } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { OrgModel, PersonModel, ReservationModel, ResourceModel, RoleName } from '@bk2/shared-models';
import { DurationPipe, SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyListComponent } from '@bk2/shared-ui';
import { coerceBoolean, getAvatarKey, getCategoryIcon, hasRole, isOngoing } from '@bk2/shared-util-core';

import { createActionSheetButton, createActionSheetOptions } from '@bk2/shared-util-angular';

import { ReservationStore } from './reservation.store';

@Component({
  selector: 'bk-reservations-accordion',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe, DurationPipe,
    EmptyListComponent,
    IonAccordion, IonItem, IonLabel, IonButton, IonIcon, IonAvatar, IonImg, IonList
  ],
  providers: [ReservationStore],
  styles: [`ion-avatar { width: 30px; height: 30px; }`],
  template: `
  <ion-accordion toggle-icon-slot="start" value="reservations">
    <ion-item slot="header" [color]="color()">
      <ion-label>{{ title() | translate | async }}</ion-label>
      @if(!isReadOnly()) {
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
                <ion-avatar slot="start">
                  <ion-img src="{{ getIcon(reservation) | svgIcon }}" alt="resource avatar" />
                </ion-avatar>

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
  private readonly reservationsStore = inject(ReservationStore);
  private actionSheetController = inject(ActionSheetController);
  
  // inputs
  public reserver = input<PersonModel | OrgModel>();
  public resource = input<ResourceModel>();
  public reserverModelType = input<'person' | 'org'>('person');
  public color = input('light');
  public title = input('@reservation.plural');
  public readOnly = input(true);

  // coerced boolean inputs
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // derived fields
  protected reservations = computed(() => this.reservationsStore.reservations());
  private currentUser = computed(() => this.reservationsStore.currentUser());

  private imgixBaseUrl = computed(() => this.reservationsStore.imgixBaseUrl());
  protected readonly resourceTypes = computed(() => this.reservationsStore.getResourceTypes());
  private readonly rboatTypes = computed(() => this.reservationsStore.getRboatTypes());

  constructor() {
    effect(() => {
      const reserver = this.reserver();
      if (reserver) {
        this.reservationsStore.setReserver(reserver, this.reserverModelType());
      }
      const resource = this.resource();
      if (resource) {
        this.reservationsStore.setResource(resource);
      }
    });
  }

  /******************************* getters *************************************** */
  // 20.0:key for a rowing boat, 20.4:key for a locker
  protected getAvatarKey(reservation: ReservationModel): string {
    return getAvatarKey(reservation.resourceModelType, reservation.resourceKey, reservation.resourceType, reservation.resourceSubType);
  }

  /******************************* actions *************************************** */
  protected async add(): Promise<void> {
    await this.reservationsStore.add(this.isReadOnly());
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
      if (hasRole('registered', this.currentUser())) {
        actionSheetOptions.buttons.push(createActionSheetButton('view', this.imgixBaseUrl(), 'eye-on'));
        actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.imgixBaseUrl(), 'close_cancel'));
      }
      if (!this.isReadOnly()) {
        actionSheetOptions.buttons.push(createActionSheetButton('edit', this.imgixBaseUrl(), 'create_edit'));
        if (isOngoing(reservation.endDate)) {
          actionSheetOptions.buttons.push(createActionSheetButton('endres', this.imgixBaseUrl(), 'stop-circle'));
        }
      }
      if (hasRole('admin', this.currentUser())) {
        actionSheetOptions.buttons.push(createActionSheetButton('delete', this.imgixBaseUrl(), 'trash_delete'));
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
          await this.reservationsStore.delete(reservation, this.isReadOnly());
          break;
        case 'edit':
          await this.reservationsStore.edit(reservation, this.isReadOnly());
          break;
        case 'view':
          await this.reservationsStore.edit(reservation, true);
          break;
        case 'endres':
          await this.reservationsStore.end(reservation, this.isReadOnly());
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

  protected getIcon(reservation: ReservationModel): string {
    if (reservation.resourceType === 'rboat') {
      return getCategoryIcon(this.rboatTypes(), reservation.resourceSubType);
    } else {
      return getCategoryIcon(this.resourceTypes(), reservation.resourceType);
    }
  }
}
