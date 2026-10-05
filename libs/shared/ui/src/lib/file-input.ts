import { Component, computed, input, model } from '@angular/core';
import { IonItem, IonLabel, IonNote } from '@ionic/angular/standalone';

import { coerceBoolean } from '@okr/shared-util-core';

export interface FileInputI18n {
  name: string;
  label: string;
  helper?: string;
}

/**
 * Picks one or more local files. It only SELECTS — uploading is the caller's job, because
 * where a file goes (storage path, encryption, album) differs per feature (see the `images` skill).
 * The value is the list of picked files; with `multiple` false it holds at most one.
 *
 * Usage example:
 *  <okr-file-input [i18n]="fileI18n()" accept="application/pdf,image/*" [multiple]="false"
 *    [files]="files()" (filesChange)="onFiles($event)" [readOnly]="false" />
 */
@Component({
  selector: 'okr-file-input',
  standalone: true,
  imports: [IonItem, IonLabel, IonNote],
  styles: [`
    input[type=file] { padding: 8px 0; width: 100%; }
    ion-item.helper { --min-height: 0; }
    .file-name { font-size: 14px; color: var(--ion-color-medium); }
  `],
  template: `
    <ion-item lines="none">
      <ion-label position="stacked">{{ i18n().label }}</ion-label>
      <input type="file" [name]="i18n().name" [attr.accept]="accept()" [multiple]="isMultiple()"
        [disabled]="isReadOnly()" (change)="onChange($event)" />
    </ion-item>
    @if (isMultiple() && files().length > 1) {
      @for (file of files(); track $index) {
        <ion-item lines="none" class="helper">
          <ion-note class="file-name">{{ file.name }}</ion-note>
        </ion-item>
      }
    }
    @if (i18n().helper) {
      <ion-item lines="none" class="helper">
        <ion-note>{{ i18n().helper }}</ion-note>
      </ion-item>
    }
  `,
})
export class FileInput {
  // inputs
  public readonly i18n = input.required<FileInputI18n>();
  public files = model<File[]>([]); // the picked files, two-way bound
  /** the accept attribute of the file dialog, e.g. 'image/*' or DEFAULT_ACCEPT_ATTRIBUTE */
  public readonly accept = input('*/*');
  public readonly multiple = input(false);
  public readonly readOnly = input.required<boolean>();

  // coerced boolean inputs
  protected readonly isMultiple = computed(() => coerceBoolean(this.multiple()));
  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  protected onChange(event: Event): void {
    const picked = Array.from((event.target as HTMLInputElement).files ?? []);
    this.files.set(this.isMultiple() ? picked : picked.slice(0, 1));
  }
}
