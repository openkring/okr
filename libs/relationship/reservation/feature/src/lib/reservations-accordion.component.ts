import { Component, computed, effect, inject, input } from '@angular/core';
import { IonAccordion, IonButton, IonIcon, IonImg, IonItem, IonItemOption, IonItemOptions, IonItemSliding, IonLabel, IonList, IonThumbnail } from '@ionic/angular/standalone';
import { AsyncPipe } from '@angular/common';

import { TranslatePipe } from '@bk2/shared/i18n';
import { ModelType, OrgModel, PersonModel, ReservationModel, ResourceModel, RoleName } from '@bk2/shared/models';

import { ReservationsAccordionStore } from './reservations-accordion.store';
import { EmptyListComponent } from '@bk2/shared/ui';
import { DurationPipe, SvgIconPipe } from '@bk2/shared/pipes';
import { getAvatarKey, hasRole, isOngoing } from '@bk2/shared/util-core';

import { AvatarPipe } from '@bk2/avatar/ui';

@Component({
  selector: 'bk-reservations-accordion',
  imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe, AvatarPipe, DurationPipe,
    EmptyListComponent,
    IonAccordion, IonItem, IonLabel, IonButton, IonIcon, IonThumbnail, IonImg,
    IonList, IonItemSliding, IonItemOptions, IonItemOption
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
            <ion-item-sliding #slidingItem>
              <ion-item (click)="edit(undefined, reservation)">
                <ion-thumbnail slot="start">
                  <ion-img [src]="getAvatarKey(reservation) | avatar | async" alt="resource avatar" />
                </ion-thumbnail>
                <ion-label>{{reservation.resourceName}}</ion-label>  
                <ion-label>{{ reservation.startDate | duration:reservation.endDate }}</ion-label>
              </ion-item>
              @if(hasRole('resourceAdmin')) {
                <ion-item-options side="end">
                  @if(hasRole('admin')) {
                    <ion-item-option color="danger" (click)="delete(slidingItem, reservation)">
                      <ion-icon slot="icon-only" src="{{'trash_delete' | svgIcon }}" />
                    </ion-item-option>
                  }
                  @if(isOngoing(reservation)) {
                  <ion-item-option color="warning" (click)="end(slidingItem, reservation)">
                    <ion-icon slot="icon-only" src="{{'stop-circle' | svgIcon }}" />
                  </ion-item-option>
                } 
                  <ion-item-option color="primary" (click)="edit(slidingItem, reservation)">
                    <ion-icon slot="icon-only" src="{{'create_edit' | svgIcon }}" />
                  </ion-item-option>
                </ion-item-options>
              }
            </ion-item-sliding> 
          }
        </ion-list>
      }
    </div>
  </ion-accordion>
  `,
})
export class ReservationsAccordionComponent {
  private readonly reservationsStore = inject(ReservationsAccordionStore);
  public color = input('light');
  public title = input('@reservation.plural');

  public reserver = input.required<PersonModel | OrgModel>();
  public reserverModelType = input<ModelType>(ModelType.Person);
  public defaultResource = input<ResourceModel>();
  protected reservations = computed(() => this.reservationsStore.reservations());

  protected modelType = ModelType;

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
    const _resource = this.defaultResource();
    if (_resource) {
      await this.reservationsStore.add(this.reserver(), this.reserverModelType(), _resource);
    }
  }

  protected async edit(slidingItem?: IonItemSliding, reservation?: ReservationModel): Promise<void> {
    if (slidingItem) slidingItem.close();
    if (reservation) await this.reservationsStore.edit(reservation);
  }

  public async delete(slidingItem?: IonItemSliding, reservation?: ReservationModel): Promise<void> {
    if (slidingItem) slidingItem.close();
    if (reservation) await this.reservationsStore.delete(reservation);
  }

  public async end(slidingItem?: IonItemSliding, reservation?: ReservationModel): Promise<void> {
    if (slidingItem) slidingItem.close();
    if (reservation) await this.reservationsStore.end(reservation);
  }

  /******************************* helpers *************************************** */
  protected hasRole(role?: RoleName): boolean {
    return hasRole(role, this.reservationsStore.currentUser());
  }

  protected isOngoing(reservation: ReservationModel): boolean {
    return isOngoing(reservation.endDate);
  }
}
