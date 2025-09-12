import { AsyncPipe } from '@angular/common';
import { Component, inject, model, signal } from '@angular/core';
import { IonCol, IonContent, IonGrid, IonItem, IonLabel, IonRow, ModalController } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { Image } from '@bk2/shared-models';
import { ChangeConfirmationComponent, HeaderComponent, ImageComponent } from '@bk2/shared-ui';

import { ImageConfigFormComponent } from '@bk2/document-ui';

/**
 * This modal requests a user to select an image file and provide some metadata about the image.
 */
@Component({
  selector: 'bk-image-edit-modal',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe,
    IonContent, IonLabel, IonItem, IonGrid, IonRow, IonCol,
    HeaderComponent, ImageComponent,
    ImageConfigFormComponent, ChangeConfirmationComponent
],
  template: `
      <bk-header title="{{ '@content.section.forms.imageConfig.editImage' | translate | async }}" [isModal]="true" />
      @if(validChange()) {
        <bk-change-confirmation (okClicked)="save()" />
      } 
      <ion-content>
        <ion-grid>
          <ion-row>
            <ion-col size="12">
              <bk-img [image]="image()" /> 
            </ion-col>
          </ion-row>
          <ion-row>
            <ion-col size="12">
              <ion-item lines="none">
                <ion-label> {{ '@content.section.forms.imageConfig.imageChangeNok' | translate | async}}</ion-label>
              </ion-item>
            </ion-col>
          </ion-row>
          <ion-row>
            <ion-col size="3">
              <ion-item lines="none">
                <ion-label>{{ 'url' }}</ion-label>
              </ion-item>
            </ion-col>
            <ion-col size="9">
              <ion-item lines="none">
                <ion-label>{{ image().url}}</ion-label>
              </ion-item>
            </ion-col>
          </ion-row>
          <ion-row>
            <ion-col size="3">
              <ion-item lines="none">
                <ion-label>{{ 'downloadUrl' }}</ion-label>
              </ion-item>
            </ion-col>
            <ion-col size="9">
              <ion-item lines="none">
                <ion-label>{{ image().actionUrl}}</ion-label>
              </ion-item>
            </ion-col>
          </ion-row>
          <ion-row>
            <bk-image-config-form [(vm)]="image" (validChange)="validChange.set($event)" />
          </ion-row>
        </ion-grid>
      </ion-content>
  `
})
export class ImageEditModalComponent {
  private readonly modalController = inject(ModalController);
  public image = model.required<Image>();
  protected validChange = signal(false);

  protected save() {
    this.modalController.dismiss(this.image(), 'confirm');
  }
}
