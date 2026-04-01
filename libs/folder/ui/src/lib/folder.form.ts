import { Component, computed, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { FolderModel, UserModel } from '@bk2/shared-models';
import { ChipsComponent, NotesInputComponent, TextInputComponent } from '@bk2/shared-ui';
import { coerceBoolean } from '@bk2/shared-util-core';
import { DEFAULT_NOTES, DEFAULT_TAGS } from '@bk2/shared-constants';

import { folderValidations } from '@bk2/folder-util';

@Component({
  selector: 'bk-folder-form',
  standalone: true,
  imports: [
    vestForms,
    FormsModule,
    TextInputComponent, NotesInputComponent, ChipsComponent,
    IonGrid, IonRow, IonCol, IonCard, IonCardContent
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    @if (showForm()) {
      <form scVestForm
        [formValue]="formData()"
        [suite]="suite"
        (dirtyChange)="dirty.emit($event)"
        (validChange)="valid.emit($event)"
        (formValueChange)="onFormChange($event)">

        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              <ion-row>
                <ion-col size="12">
                  <bk-text-input name="name" [value]="name()" (valueChange)="onFieldChange('name', $event)"
                    label="@folder.field.name.label" [maxLength]="50" [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12">
                  <bk-text-input name="title" [value]="title()" (valueChange)="onFieldChange('title', $event)"
                    label="@folder.field.title.label" [maxLength]="50" [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12">
                  <bk-notes name="description" [value]="description()" (valueChange)="onFieldChange('description', $event)"
                    label="@folder.field.description.label" [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12">
                  <bk-chips chipName="tag" [storedChips]="tags()" (storedChipsChange)="onFieldChange('tags', $event)" [allChips]="allTags()" [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>
      </form>
    }
  `
})
export class FolderFormComponent {
  // inputs
  public readonly formData = input.required<FolderModel>();
  public readonly currentUser = input<UserModel | undefined>();
  public readonly allTags = input(DEFAULT_TAGS);
  public readonly readOnly = input(true);
  public readonly showForm = input(true);

  // outputs
  public readonly formDataChange = output<FolderModel>();
  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();

  // computed field accessors
  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected readonly name = computed(() => this.formData()?.name ?? '');
  protected readonly title = computed(() => this.formData()?.title ?? '');
  protected readonly description = computed(() => this.formData()?.description ?? DEFAULT_NOTES);
  protected readonly tags = computed(() => this.formData()?.tags ?? DEFAULT_TAGS);

  protected readonly suite = folderValidations;

  protected onFormChange(formData: FolderModel): void {
    this.formDataChange.emit(formData);
  }

  protected onFieldChange(fieldName: string, fieldValue: string | string[]): void {
    this.dirty.emit(true);
    this.formDataChange.emit({ ...this.formData(), [fieldName]: fieldValue });
  }
}
