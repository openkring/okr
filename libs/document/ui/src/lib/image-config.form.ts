import { Component, computed, effect, input, model, output, signal } from '@angular/core';
import { IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { Image, UserModel } from '@bk2/shared-models';
import { ErrorNoteComponent, TextInputComponent } from '@bk2/shared-ui';
import { coerceBoolean, debugFormErrors } from '@bk2/shared-util-core';

import { imageConfigFormModelShape, imageConfigValidations } from '@bk2/document-util';

@Component({
  selector: 'bk-image-config-form',
  standalone: true,
  imports: [
    vestForms,
    TextInputComponent, ErrorNoteComponent,
    IonGrid, IonRow, IonCol
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
  <form scVestForm
    [formShape]="shape"
    [formValue]="formData()"
    [suite]="suite" 
    (dirtyChange)="dirty.emit($event)"
    (formValueChange)="onFormChange($event)">

    <ion-grid>
      <ion-row>
        <ion-col size="12" size-md="6">
          <bk-text-input name="imageLabel" [value]="imageLabel()" [showHelper]=true [readOnly]="isReadOnly()" (changed)="onFieldChange('imageLabel', $event)" />
          <bk-error-note [errors]="imageLabelErrors()" />                                                                      
        </ion-col>

        <ion-col size="12" size-md="6">
          <bk-text-input name="imageOverlay" [value]="imageOverlay()" [showHelper]=true [readOnly]="isReadOnly()" (changed)="onFieldChange('imageOverlay', $event)" />
          <bk-error-note [errors]="imageOverlayErrors()" />                                      
        </ion-col>

        <ion-col size="12" size-md="6">
          <bk-text-input name="altText" [value]="altText()" [showHelper]=true [readOnly]="isReadOnly()" (changed)="onFieldChange('altText', $event)" />
          <bk-error-note [errors]="altTextErrors()" />   
        </ion-col>
      </ion-row>
    </ion-grid>
  </form>
`
})
export class ImageConfigFormComponent {
  // inputs
  public readonly formData = model.required<Image>();
  public currentUser = input<UserModel | undefined>();
  public readonly readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // signals
  public dirty = output<boolean>();
  public valid = output<boolean>();

  // validation and errors
  protected readonly suite = imageConfigValidations;
  protected readonly shape = imageConfigFormModelShape;
  private readonly validationResult = computed(() => imageConfigValidations(this.formData()));
  protected imageLabelErrors = computed(() => this.validationResult().getErrors('imageLabelErrors'));
  protected imageOverlayErrors = computed(() => this.validationResult().getErrors('imageOverlayErrors'));
  protected altTextErrors = computed(() => this.validationResult().getErrors('altText'));

  //fields
  protected imageLabel = computed(() => this.formData().imageLabel ?? 'image label');
  protected imageOverlay = computed(() => this.formData().imageOverlay ?? 'overlay text');
  protected altText = computed(() => this.formData().altText ?? 'alt text'); 
  
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

  constructor() {
    effect(() => {
      this.valid.emit(this.validationResult().isValid());
    });
  }

  protected onFormChange(value: Image): void {
    this.formData.update((vm) => ({...vm, ...value}));
    debugFormErrors('ImageConfigForm.onFormChange', this.validationResult().errors, this.currentUser());
  }

  protected onFieldChange(fieldName: string, $event: string | string[] | number): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: $event }));
    debugFormErrors('ImageConfigForm.onFieldChange', this.validationResult().errors, this.currentUser());
  }
}
