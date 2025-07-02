import { Component, computed, input, model, output, signal } from '@angular/core';
import { IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { ErrorNoteComponent, TextInputComponent } from '@bk2/shared/ui';
import { Image, UserModel } from '@bk2/shared/models';
import { imageConfigFormModelShape, imageConfigValidations } from '@bk2/document/util';
import { debugFormErrors } from '@bk2/shared/util-core';

@Component({
  selector: 'bk-image-config-form',
  imports: [
    vestForms,
    TextInputComponent, ErrorNoteComponent,
    IonGrid, IonRow, IonCol
],
  template: `
  <form scVestForm
    [formShape]="shape"
    [formValue]="vm()"
    [suite]="suite" 
    (dirtyChange)="dirtyChange.set($event)"
    (formValueChange)="onValueChange($event)">

    <ion-grid>
      <ion-row>
        <ion-col size="12" size-md="6">
          <bk-text-input name="imageLabel" [value]="imageLabel()" [showHelper]=true (changed)="onChange('imageLabel', $event)" />
          <bk-error-note [errors]="imageLabelErrors()" />                                                                      
        </ion-col>

        <ion-col size="12" size-md="6">
          <bk-text-input name="imageOverlay" [value]="imageOverlay()" [showHelper]=true (changed)="onChange('imageOverlay', $event)" />
          <bk-error-note [errors]="imageOverlayErrors()" />                                      
        </ion-col>

        <ion-col size="12" size-md="6">
          <bk-text-input name="altText" [value]="altText()" [showHelper]=true (changed)="onChange('altText', $event)" />
          <bk-error-note [errors]="altTextErrors()" />   
        </ion-col>
      </ion-row>
    </ion-grid>
  </form>
`
})
export class ImageConfigFormComponent {
  public readonly vm = model.required<Image>();
  public currentUser = input<UserModel | undefined>();

  protected imageLabel = computed(() => this.vm().imageLabel ?? 'image label');
  protected imageOverlay = computed(() => this.vm().imageOverlay ?? 'overlay text');
  protected altText = computed(() => this.vm().altText ?? 'alt text'); 
  
  /**
    imageType?: number,     // ImageType: the type of the image, default is ImageType.Image
    url: string,          // the url of the image, a relative path to the file in Firebase storage; this is used as a basis to construct the imgix url
    actionUrl: string,    // the url used with the action
    fill: boolean,       // if true, the image fills the whole container, default is true
    hasPriority: boolean, // if true, the image is loaded first, default is true
    imgIxParams?: string,
    width?: number,       // the width of the image in pixels, default is 160
    height?: number,      // the height of the image in pixels, default is 90
    sizes: string,       // the sizes attribute for the img tag, default is '(max-width: 1240px) 50vw, 300px'
    borderRadius: number,
    imageAction: number, // ImageAction: defines the action to start when clicking on an image, default is ImageAction.None
    zoomFactor: number, // default: 2
    isThumbnail: boolean, // if true, images are displayed as a thumbnail, default: false
    slot: Slot    // default is none
   */

  public validChange = output<boolean>();
  protected dirtyChange = signal(false);

  protected readonly suite = imageConfigValidations;
  protected readonly shape = imageConfigFormModelShape;
  private readonly validationResult = computed(() => imageConfigValidations(this.vm()));
  protected imageLabelErrors = computed(() => this.validationResult().getErrors('imageLabelErrors'));
  protected imageOverlayErrors = computed(() => this.validationResult().getErrors('imageOverlayErrors'));
  protected altTextErrors = computed(() => this.validationResult().getErrors('altText'));

  protected onValueChange(value: Image): void {
    this.vm.update((_vm) => ({..._vm, ...value}));
    this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
  }

  protected onChange(fieldName: string, $event: string | string[] | number): void {
    this.vm.update((vm) => ({ ...vm, [fieldName]: $event }));
    debugFormErrors('ImageConfigForm', this.validationResult().errors, this.currentUser());
    this.dirtyChange.set(true); // it seems, that vest is not updating dirty by itself for this change
    this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
  }
}
