import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';
import { AsyncPipe } from '@angular/common';

import { ChangeConfirmationComponent, HeaderComponent } from '@bk2/shared/ui';
import { TranslatePipe } from '@bk2/shared/i18n';
import { LocationModel, ModelType, UserModel } from '@bk2/shared/models';
import { AppStore } from '@bk2/shared/feature';

import { LocationFormComponent } from '@bk2/location/ui';
import { convertFormToLocation, convertLocationToForm, getLocationTitle } from '@bk2/location/util';


@Component({
  selector: 'bk-location-edit-modal',
  imports: [
    HeaderComponent, ChangeConfirmationComponent, LocationFormComponent,
    TranslatePipe, AsyncPipe,
    IonContent
  ],
  template: `
    <bk-header title="{{ title() | translate | async }}" [isModal]="true" />
    @if(formIsValid()) {
        <bk-change-confirmation (okClicked)="save()" />
      } 
    <ion-content>
      <bk-location-form [(vm)]="vm" [currentUser]="currentUser()" [locationTags]="locationTags()" (validChange)="formIsValid.set($event)" />
    </ion-content>
  `
})
export class LocationEditModalComponent {
  private readonly modalController = inject(ModalController);
  protected readonly appStore = inject(AppStore);

  public location = input.required<LocationModel>();
  public currentUser = input<UserModel | undefined>();
  protected title = computed(() => getLocationTitle(this.location().bkey));
  protected vm = linkedSignal(() => convertLocationToForm(this.location()));
  protected locationTags = computed(() => this.appStore.getTags(ModelType.Location));

  protected formIsValid = signal(false);

  public save(): Promise<boolean> {
    return this.modalController.dismiss(convertFormToLocation(this.location(), this.vm(), this.appStore.tenantId()), 'confirm');
  }
}
