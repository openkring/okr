import { Component, computed, inject, model, output } from '@angular/core';
import { IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonIcon, IonItem, IonLabel, IonRow, ToastController } from '@ionic/angular/standalone';

import { Image, ImageAction, SectionProperties } from '@bk2/shared/models';
import { SvgIconPipe } from '@bk2/shared/pipes';
import { ImageComponent, SpinnerComponent } from '@bk2/shared/ui';
import { ViewPositions } from '@bk2/shared/categories';
import { deleteFileFromStorage, TranslatePipe } from '@bk2/shared/i18n';

import { AsyncPipe } from '@angular/common';

import { newImage, SectionFormModel } from '@bk2/cms/section/util';
import { SectionModalsService } from './section-modals.service';
import { DocumentModalsService } from '@bk2/document/feature';

/**
 * Pick one single image from the local file system or from the camera.
 * The image is then uploaded to Firebase storage and the user needs to insert some metadata about the image.
 * The image can be removed and replaced.
 */
@Component({
  selector: 'bk-single-image',
  imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe,
    IonRow, IonCol, IonButton, IonIcon, IonItem, IonLabel,
    IonCard, IonCardHeader, IonCardTitle, IonCardContent,
    SpinnerComponent, ImageComponent
  ],
  template: `
    @if(vm(); as vm) {
      <ion-row>
        <ion-col size="12">
          <ion-card>
            <ion-card-header>
              <ion-card-title>{{ '@content.section.forms.imageConfig.title' | translate | async }}</ion-card-title>
            </ion-card-header>
            <ion-card-content>
              <ion-item lines="none">
                <ion-button (click)="addImage()" fill="clear">
                  <ion-icon slot="start" src="{{'add-circle' | svgIcon }}" />
                  {{ '@content.section.operation.addImage.label' | translate | async }}
                </ion-button>
              </ion-item>
              @if(image(); as image) {
                @if(image.url!.length > 0) {
                  <ion-item lines="none">
                    <bk-img [image]="patchImage(image)" (click)="editImage(image)" />
                    <ion-label (click)="editImage(image)">{{image.imageLabel}}</ion-label>
                    <ion-icon src="{{'close_cancel_circle' | svgIcon }}" slot="end" (click)="removeImage(image)" />
                  </ion-item>
                }
              } @else {
                <bk-spinner />
              }
            </ion-card-content>
          </ion-card>
        </ion-col>
      </ion-row>
    }
  `
})
export class SingleImageComponent {
  private readonly toastController = inject(ToastController);
  private readonly sectionModalsService = inject(SectionModalsService);
  private readonly documentModalsService = inject(DocumentModalsService);

  public vm = model.required<SectionFormModel>();
  protected image = computed(() => this.vm().properties?.image ?? newImage());

  public changedProperties = output<SectionProperties>();

  protected VPS = ViewPositions;

  // call modal with input form to select an image and add metadata
  protected async addImage() {
    const _sectionKey = this.vm().bkey;
    if (_sectionKey) {
      const _image = await this.documentModalsService.pickAndUploadImage(_sectionKey);
      if (_image) {
        this.saveAndNotify(_image);    
      }
    }
  }

  patchImage(image: Image): Image {
    image.isThumbnail = true;
    image.width = 80;
    image.height = 80;
    image.fill = false;
    image.isThumbnail = true;
    image.imageAction = ImageAction.None;
    return image;
  }

  protected async editImage(image: Image) {
    const _image = await this.sectionModalsService.editImage(image);
    if (_image) {
      this.saveAndNotify(_image);
    }
  }

  protected removeImage(image: Image) {
    if (!image?.url) return;
    deleteFileFromStorage(this.toastController, image.url);
    image.url = '';
    image.actionUrl = '';
    this.saveAndNotify(image);
  }

  private saveAndNotify(image: Image) {
    const _properties = this.vm().properties;
    console.log(image);
    if (_properties) {
      _properties.image = image;
    }
    this.changedProperties.emit({
      image
    });
  }
}
