import { Component, computed, inject, input } from '@angular/core';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow, ModalController } from '@ionic/angular/standalone';
import {} from '@capacitor/google-maps';

import { ButtonSection, ViewPosition } from '@bk2/shared-models';
import { OptionalCardHeader, Spinner } from '@bk2/shared-ui';

import { ReservationApplyModal } from '@bk2/relationship-reservation-feature';
import { isReservation } from '@bk2/relationship-reservation-util';
import { ReservationService } from '@bk2/relationship-reservation-data-access';

import { ButtonWidget, EmergencyButtonWidget } from '@bk2/cms-section-ui';
import { SectionStore } from './section.store';



@Component({
  selector: 'bk-button-section',
  standalone: true,
  imports: [
    Spinner, ButtonWidget, EmergencyButtonWidget, OptionalCardHeader,
    IonCard, IonCardContent, IonGrid, IonRow, IonCol
  ],
  providers: [SectionStore],
  styles: [`
    ion-card-content { padding: 0px; }
    ion-card { padding: 0px; margin: 0px; border: 0px; box-shadow: none !important;}
  `],
  template: `
    @if(section(); as section) {
      <ion-card>
        <bk-optional-card-header [title]="title()" [subTitle]="subTitle()" />
        <ion-card-content>
          <!-- we need to handle the emergency-button differently because of a different button style and action -->
          @if(name() === 'emergency-button') {
            <ion-grid>
              <ion-row>
                <ion-col size="12">
                  <bk-emergency-button-widget [section]="section" [editMode]="editMode()" (send)="store.sendEmergencyMessage()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12">
                  <div [innerHTML]="content()"></div>
                </ion-col>
              </ion-row>
            </ion-grid>
          } @else {
          @switch(position()) {
            @case(VP.Left) {
              <ion-grid>
                <ion-row>
                  <ion-col [size]="colSizeButton()">
                    <bk-button-widget [section]="section" [i18n]="store.i18n" [editMode]="editMode()" (clicked)="onClick($event)" />
                  </ion-col>
                  <ion-col [size]="colSizeText()">
                    <div [innerHTML]="content()"></div>
                  </ion-col>
                </ion-row>
              </ion-grid>
            }
            @case(VP.Right) {
              <ion-grid>
                <ion-row>
                  <ion-col [size]="colSizeText()">
                    <div [innerHTML]="content()"></div>
                  </ion-col>
                  <ion-col [size]="colSizeButton()">
                    <bk-button-widget [section]="section" [i18n]="store.i18n" [editMode]="editMode()" (clicked)="onClick($event)" />
                  </ion-col>
                </ion-row>
              </ion-grid>
            }
            @case(VP.Top) {
              <ion-grid>
                <ion-row>
                  <ion-col size="12">
                    <bk-button-widget [section]="section" [i18n]="store.i18n" [editMode]="editMode()" (clicked)="onClick($event)" />
                  </ion-col>
                </ion-row>
                <ion-row>
                  <ion-col size="12">
                    <div [innerHTML]="content()"></div>
                  </ion-col>
                </ion-row>
              </ion-grid>
            }
            @case(VP.Bottom) {
              <ion-grid>
                <ion-row>
                  <ion-col size="12">
                  <div [innerHTML]="content()"></div>
                  </ion-col>
                </ion-row>
                <ion-row>
                  <ion-col size="12">
                    <bk-button-widget [section]="section" [i18n]="store.i18n" [editMode]="editMode()" (clicked)="onClick($event)" />
                  </ion-col>
                </ion-row>
              </ion-grid>
            }
            @default {  <!-- VP.None -->
              <bk-button-widget [section]="section" [i18n]="store.i18n" [editMode]="editMode()" (clicked)="onClick($event)" />
            }
          }
        }
        </ion-card-content>
      </ion-card>
    } @else {
      <bk-spinner />
    }
  `
})
export class ButtonSectionComponent {
  protected readonly store = inject(SectionStore);
  private modalController = inject(ModalController);
  private reservationService = inject(ReservationService);

  // inputs
  public section = input<ButtonSection>();
  public editMode = input<boolean>(false);

  // computed
  protected name = computed(() => this.section()?.name ?? '');
  protected content = computed(() => this.section()?.content?.htmlContent ?? '<p></p>');
  protected colSizeButton = computed(() => this.section()?.content?.colSize ?? 6);
  protected position = computed(() => this.section()?.content?.position ?? ViewPosition.None);
  protected colSizeText = computed(() => 12 - this.colSizeButton());
  protected readonly title = computed(() => this.section()?.title);
  protected readonly subTitle = computed(() => this.section()?.subTitle);

  public VP = ViewPosition;

  protected async onClick(modalType: string): Promise<void> {
    if (modalType === 'bhres') {  // boathouse reservation application
      const modal = await this.modalController.create({
        component: ReservationApplyModal,
      });
      modal.present();
      const { data, role } = await modal.onDidDismiss();
      if (role === 'confirm' && data) {
        if (isReservation(data, this.store.tenantId())) {
          const resId = await this.reservationService.create(data, this.store.currentUser());
          // tbd: add a task to responsible
          // tbd: add the reservation as calevent
        }
      }
    }
  }
}