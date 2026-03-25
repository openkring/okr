import { Component, computed, inject, input } from '@angular/core';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow, ModalController } from '@ionic/angular/standalone';
import { Capacitor } from '@capacitor/core';
import { Geolocation, Position } from '@capacitor/geolocation';
import {} from '@capacitor/google-maps';
 
import { ButtonSection, ViewPosition } from '@bk2/shared-models';
import { OptionalCardHeaderComponent, SpinnerComponent } from '@bk2/shared-ui';

import { MatrixChatService } from '@bk2/chat-data-access';
import { ReservationApplyModal } from '@bk2/relationship-reservation-feature';

import { ButtonWidgetComponent, EmergencyButtonWidget } from '@bk2/cms-section-ui';
import { AppStore } from '@bk2/shared-feature';
import { debugMessage } from '@bk2/shared-util-core';
import { bkTranslate } from '@bk2/shared-i18n';
import { isReservation } from '@bk2/relationship-reservation-util';
import { ReservationService } from '@bk2/relationship-reservation-data-access';
import { TaskService } from '@bk2/task-data-access';

type Coordinates = {
  latitude: number;
  longitude: number;
};

@Component({
  selector: 'bk-button-section',
  standalone: true,
  imports: [
    SpinnerComponent, ButtonWidgetComponent, EmergencyButtonWidget,
    OptionalCardHeaderComponent,
    IonCard, IonCardContent, IonGrid, IonRow, IonCol
  ],
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
                  <bk-emergency-button-widget [section]="section" [editMode]="editMode()" (send)="sendEmergencyMessage()" />
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
                    <bk-button-widget [section]="section" [editMode]="editMode()" (clicked)="onClick($event)" />
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
                    <bk-button-widget [section]="section" [editMode]="editMode()" (clicked)="onClick($event)" />
                  </ion-col>
                </ion-row>
              </ion-grid>
            }
            @case(VP.Top) {
              <ion-grid>
                <ion-row>
                  <ion-col size="12">
                    <bk-button-widget [section]="section" [editMode]="editMode()" (clicked)="onClick($event)" />
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
                    <bk-button-widget [section]="section" [editMode]="editMode()" (clicked)="onClick($event)" />
                  </ion-col>
                </ion-row>
              </ion-grid>
            }
            @default {  <!-- VP.None -->
              <bk-button-widget [section]="section" [editMode]="editMode()" (clicked)="onClick($event)" />
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
  private chatService = inject(MatrixChatService);
  private appStore = inject(AppStore);
  private modalController = inject(ModalController);
  private reservationService = inject(ReservationService);
  private taskService = inject(TaskService);

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

  protected async sendEmergencyMessage(): Promise<void> {
    if (!this.chatService.isInitialized) {
      console.warn('button-section.sendEmergencyMessage: Matrix client not initialized');
      return;
    }
    const currentUser = this.appStore.currentUser();
    const position = await this.getCurrentPosition();
    if (currentUser) {
      const name = currentUser.firstName + ' ' + currentUser.lastName;
      const message1 = bkTranslate('@chat.fields.needsHelp', { name });
      const message2 = bkTranslate('@chat.fields.needsHelpUnknownLocation', { name });
      const roomId = await this.chatService.getRoomByName('Notfall');
      try {
        if (position) {
          await this.chatService.sendLocation(roomId, message1, position.latitude, position.longitude);
        } else {
          await this.chatService.sendMessage(roomId, message2);
        }
      } catch (error) {
        console.error('button-section.sendEmergencyMessage: Failed to send:', error);
      }
    }
  }

  protected async onClick(modalType: string): Promise<void> {
    if (modalType === 'bhres') {  // boathouse reservation application
      const modal = await this.modalController.create({
          component: ReservationApplyModal,
        });
        modal.present();
        const { data, role } = await modal.onDidDismiss();
        if (role === 'confirm' && data) {
          if (isReservation(data, this.appStore.tenantId())) {
            const resId = await this.reservationService.create(data, this.appStore.currentUser());
            // tbd: add a task to responsible
            // tbd: add the reservation as calevent
          }
        }
    }
  }

  /**
   * This function asks the user for permission to access to current location (on iOS and Android, but not on web).
   * It then returns either the current position of the user or the default position if the user did not agree or geolocation is not supported.
   * @returns the current position of the user the default position
   */
  private async getCurrentPosition(): Promise<Coordinates | undefined> {
    if (Capacitor.isNativePlatform()) {
      const permissionStatus = await Geolocation.requestPermissions();
      if (permissionStatus.location !== 'granted') {
        throw new Error('Location permission denied');
      }
      const pos: Position =  await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      });
      return { 
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude
      };
    } else {
      if (!navigator.geolocation) {
        throw new Error('Geolocation not supported in this browser');
      }
      // Check permission status before requesting
      try {
        const permissionStatus = await navigator.permissions.query({ name: 'geolocation' });
        if (permissionStatus.state === 'denied') {
          throw new Error('User denied Geolocation');
        }
        debugMessage('ButtonSection.getCurrentPosition: geolocation accepted.', this.appStore.currentUser());
      } catch (error) {
        console.warn('ButtonSection: Permission query not supported or failed:', error);
      }
      const pos: Position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        });
      });
      return { 
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude
      };
    }
  }
}