import { Component, computed, inject, input } from '@angular/core';
import { IonButton, IonCard, IonCardContent, IonCol, IonGrid, IonItem, IonNote, IonRow } from '@ionic/angular';

import { ENV } from '@okr/shared-config';
import { ErrorNote, ImgDirective } from '@okr/shared-ui';
import { settingsImageName, settingsImagePreviewUrl } from '@okr/tenant-util';

import { SettingsFormBase } from './settings-form.base';
import { SettingsPublicNote } from './settings-public-note';

/**
 * Settings group «Bilder»: the background of the sign-in page and the image of the page «Not found». The value is the
 * storage path the upload returned; the form never types or shows it. The upload is the parent's (`onUpload`), as the
 * save is the modal's: this form only sets the value, saving stays with the change confirmation. A file uploaded and
 * not saved afterwards stays in storage unused.
 */
@Component({
  selector: 'okr-settings-images-form',
  standalone: true,
  imports: [ErrorNote, ImgDirective, SettingsPublicNote, IonButton, IonCard, IonCardContent, IonCol, IonGrid, IonItem, IonNote, IonRow],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px;} }
    .preview { margin: 8px 16px; max-width: 320px; }
    .preview img { width: 100%; max-height: 180px; object-fit: cover; border-radius: 4px; }
    .none { margin: 8px 16px; font-style: italic; opacity: 0.7; }
    .buttons { margin: 0 8px; }
  `],
  template: `
    @if (showForm()) {
      <form novalidate>
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <okr-settings-public-note [text]="publicNote()" />
            <ion-grid>
              <ion-row>
                @for (field of imageFields; track field) {
                  <ion-col size="12" size-md="6">
                    <div class="ion-padding-horizontal">{{ fields()[field].label }}</div>
                    @if (previews()[field]) {
                      <div class="preview">
                        <img okrImg [src]="previews()[field]" [alt]="fields()[field].label" />
                      </div>
                    }
                    @if (names()[field]) {
                      <div class="ion-padding-horizontal">
                        <ion-note>{{ names()[field] }}</ion-note>
                      </div>
                    } @else {
                      <div class="none">{{ text('image_none') }}</div>
                    }
                    <div class="buttons">
                      <ion-button fill="outline" size="small" [disabled]="isBusy()" (click)="upload(field)">
                        {{ values()[field] ? text('image_replace') : text('image_upload') }}
                      </ion-button>
                      @if (values()[field] && !isReadOnly()) {
                        <ion-button fill="clear" size="small" [disabled]="isBusy()" (click)="onFieldChange(field, '')">{{ text('image_remove') }}</ion-button>
                      }
                    </div>
                    @if (uploadingField() === field) {
                      <div class="ion-padding-horizontal" role="status"><ion-note>{{ text('image_uploading') }}</ion-note></div>
                    }
                    <okr-error-note [errors]="errors()[field]" />
                    @if (helperVisibility.showHelpers()) {
                      <ion-item lines="none" [button]="false">
                        <ion-note class="ion-text-wrap">{{ fields()[field].helper }}</ion-note>
                      </ion-item>
                    }
                  </ion-col>
                }
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>
      </form>
    }
  `,
})
export class SettingsImagesForm extends SettingsFormBase {
  private readonly env = inject(ENV);

  /** Picks a file and uploads it; answers the storage path, or undefined when cancelled or failed (the value then stays). */
  public readonly onUpload = input.required<(field: string) => Promise<string | undefined>>();

  protected readonly imageFields = ['welcomeBannerUrl', 'notfoundBannerUrl'] as const;

  /** the field being uploaded (`working`): a second upload, at the same time or for the other image, would race the file picker */
  protected readonly uploadingField = this.working;
  protected readonly isBusy = computed(() => this.working() !== '' || this.isReadOnly());

  protected readonly previews = computed(() => {
    const base = this.env.services.imgixBaseUrl;
    return Object.fromEntries(this.imageFields.map((field) => [field, settingsImagePreviewUrl(this.values()[field], base)]));
  });
  protected readonly names = computed(() => Object.fromEntries(this.imageFields.map((field) => [field, settingsImageName(this.values()[field])])));

  protected async upload(field: string): Promise<void> {
    const path = await this.runExclusive(field, () => this.onUpload()(field));
    if (path) this.onFieldChange(field, path);
  }

  protected get group(): 'images' { return 'images'; }
}
