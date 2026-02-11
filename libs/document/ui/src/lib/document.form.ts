import { Component, computed, inject, input, linkedSignal, model, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonCard, IonCardContent, IonCol, IonGrid, IonIcon, IonItem, IonRow, ToastController } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';
import { Router } from '@angular/router';

import { CategoryListModel, DocumentModel, RoleName, UserModel } from '@bk2/shared-models';
import { CategorySelectComponent, ChipsComponent, DateInputComponent, NotesInputComponent, TextInputComponent } from '@bk2/shared-ui';
import { coerceBoolean, debugFormErrors, debugFormModel, fileName, hasRole } from '@bk2/shared-util-core';
import { DEFAULT_DATE, DEFAULT_NOTES, DEFAULT_TAGS } from '@bk2/shared-constants';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { copyToClipboard, showToast } from '@bk2/shared-util-angular';
import { ENV } from '@bk2/shared-config';

import { documentValidations } from '@bk2/document-util';

@Component({
  selector: 'bk-document-form',
  standalone: true,
  imports: [
    vestForms,
    FormsModule,
    SvgIconPipe,
    TextInputComponent, DateInputComponent, CategorySelectComponent, ChipsComponent, NotesInputComponent,
    IonGrid, IonRow, IonCol, IonCard, IonCardContent, IonIcon, IonItem
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
              @if(hasRole('admin')) {
                <ion-col size="12" size-md="6">
                  <bk-text-input name="bkey" [value]="bkey()" label="bkey" [readOnly]="true" [copyable]="true" />
                </ion-col>
              }
              <ion-col size="12">
                @if(hasRole('admin')) {
                  <ion-item lines="none">
                    <ion-icon src="{{ 'download' | svgIcon }}" slot="start" (click)="download()" />
                    <ion-icon src="{{ 'copy' | svgIcon }}" slot="start" (click)="copy(fullPath())" />
                    <bk-text-input name="fullPath" [value]="fullPath()" (valueChange)="onFieldChange('fullPath', $event)" [maxLength]=300 [readOnly]="true" />                                        
                  </ion-item>
                } @else {
                  <bk-text-input name="fileName" [value]="fileName()" (valueChange)="onFieldChange('fileName', $event)" [maxLength]=50 [readOnly]="true" [copyable]="true" />                                        
                }
              </ion-col>
              <ion-col size="12">
                <bk-text-input name="title" [value]="title()" (valueChange)="onFieldChange('title', $event)" [autofocus]="true" [maxLength]=50 [readOnly]="isReadOnly()" />                                        
              </ion-col>

              <ion-col size="12">
                <bk-text-input name="altText" [value]="altText()" (valueChange)="onFieldChange('altText', $event)" [maxLength]=100 [readOnly]="isReadOnly()" />                                        
              </ion-col>
            </ion-row>

            <ion-row>
              <ion-col size="12" size-md="6">
                <bk-cat-select [category]="types()!" [selectedItemName]="type()" (selectedItemNameChange)="onFieldChange('type', $event)" [withAll]="false" [readOnly]="isReadOnly()" />
              </ion-col>

              <ion-col size="12" size-md="6">
                <bk-cat-select [category]="sources()!" [selectedItemName]="source()" (selectedItemNameChange)="onFieldChange('source', $event)" [withAll]="false" [readOnly]="isReadOnly()" />
              </ion-col>
            </ion-row>

            <ion-row> 
              @if (hasRole('admin')) {
                <ion-col size="12">
                  <bk-text-input name="url" [value]="url()" (valueChange)="onFieldChange('url', $event)" [autofocus]="true" [maxLength]=300 [readOnly]="isReadOnly()" [copyable]="true" />                                        
                </ion-col>
              }

              <ion-col size="12">
                <bk-text-input name="mimeType" [value]="mimeType()" (valueChange)="onFieldChange('mimeType', $event)" [maxLength]=50 [readOnly]="isReadOnly()" />                                        
              </ion-col>

              <ion-col size="12" size-md="6">
                <bk-text-input name="authorKey" [value]="authorKey()" (valueChange)="onFieldChange('authorKey', $event)" [maxLength]=50 [readOnly]="isReadOnly()" />                                        
              </ion-col>

              <ion-col size="12" size-md="6">
                <bk-text-input name="authorName" [value]="authorName()" (valueChange)="onFieldChange('authorName', $event)" [maxLength]=50 [readOnly]="isReadOnly()" />                                        
              </ion-col>
            </ion-row>

            <ion-row>
              <ion-col size="12" size-md="6"> 
                <bk-date-input name="dateOfDocCreation" [storeDate]="dateOfDocCreation()" (storeDateChange)="onFieldChange('dateOfDocCreation', $event)" [readOnly]="isReadOnly()" />
              </ion-col>

              <ion-col size="12" size-md="6">
                <bk-date-input name="dateOfDocLastUpdate"  [storeDate]="dateOfDocLastUpdate()" (storeDateChange)="onFieldChange('dateOfDocLastUpdate', $event)" [readOnly]="isReadOnly()" />
              </ion-col>
            </ion-row>

            @if(hasRole('privileged') || !isReadOnly()) {
              <ion-row>
                <ion-col size="12">
                  <bk-text-input name="locationKey" [value]="locationKey()" (valueChange)="onFieldChange('locationKey', $event)" [autofocus]="true" [maxLength]=20 [readOnly]="isReadOnly()" [copyable]="true" />                                        
                </ion-col>

                <ion-col size="12">
                  <bk-text-input name="hash" [value]="hash()" (valueChange)="onFieldChange('hash', $event)" [maxLength]=100 [readOnly]="isReadOnly()" [copyable]="true" />                                        
                </ion-col>

                <ion-col size="12">
                  <ion-item lines="none">
                    <ion-icon src="{{'link' | svgIcon }}" slot="start" (click)="showPriorVersion()" />
                    <bk-text-input name="priorVersionKey" [value]="priorVersionKey()" (valueChange)="onFieldChange('priorVersionKey', $event)" [maxLength]=20 [readOnly]="isReadOnly()" [showHelper]=true />                                        
                  </ion-item>                                    
                </ion-col>

                <ion-col size="12">
                  <bk-text-input name="version" [value]="version()" (valueChange)="onFieldChange('version', $event)" [maxLength]=20 [readOnly]="isReadOnly()" [showHelper]=true />                                        
                </ion-col>
              </ion-row>
            }
          </ion-grid>
        </ion-card-content>
      </ion-card>

      @if(hasRole('privileged') || hasRole('contentAdmin')) {
        <bk-chips chipName="tag" [storedChips]="tags()" (storedChipsChange)="onFieldChange('tags', $event)" [allChips]="allTags()" [readOnly]="isReadOnly()" />
      }
      @if(hasRole('admin')) {
        <bk-notes name="description" [value]="description()" (valueChange)="onFieldChange('description', $event)" [readOnly]="isReadOnly()" />
      }
    </form>
  }
  `
})
export class DocumentFormComponent {  
  private router = inject(Router);
  private toastController = inject(ToastController);
  private env = inject(ENV);

  // inputs  
  public readonly formData = model.required<DocumentModel>();
  public readonly currentUser = input<UserModel | undefined>();
  public showForm = input(true);   // used for initializing the form and resetting vest validations
  public readonly allTags = input.required<string>();
  public readonly types = input.required<CategoryListModel>();
  public readonly sources = input.required<CategoryListModel>();
  public readonly readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  
 // signals
  public dirty = output<boolean>();
  public valid = output<boolean>();

  // validations and errors
  protected readonly suite = documentValidations;
  private readonly validationResult = computed(() => documentValidations(this.formData(), this.env.tenantId, this.allTags()));

  // fields
  protected fullPath = linkedSignal(() => this.formData().fullPath ?? '');
  protected fileName = linkedSignal(() => fileName(this.fullPath()));
  protected title = linkedSignal(() => this.formData().title ?? '');
  protected altText = linkedSignal(() => this.formData().altText ?? '');
  protected type = linkedSignal(() => this.formData().type ?? '');
  protected source = linkedSignal(() => this.formData().source ?? '');
  protected url = linkedSignal(() => this.formData().url ?? '');
  protected mimeType = linkedSignal(() => this.formData().mimeType ?? '');
  protected authorKey = linkedSignal(() => this.formData().authorKey ?? '');
  protected authorName = linkedSignal(() => this.formData().authorName ?? '');
  protected dateOfDocCreation = linkedSignal(() => this.formData().dateOfDocCreation ?? DEFAULT_DATE);
  protected dateOfDocLastUpdate = linkedSignal(() => this.formData().dateOfDocLastUpdate ?? DEFAULT_DATE);
  protected locationKey = linkedSignal(() => this.formData().locationKey ?? '');
  protected hash = linkedSignal(() => this.formData().hash ?? '');
  protected priorVersionKey = linkedSignal(() => this.formData().priorVersionKey ?? '');
  protected version = linkedSignal(() => this.formData().version ?? '');
  protected description = linkedSignal(() => this.formData().description ?? DEFAULT_NOTES);
  protected tags = linkedSignal(() => this.formData().tags ?? DEFAULT_TAGS);
  protected bkey = computed(() => this.formData().bkey ?? '');

  /******************************* actions *************************************** */
  protected onFieldChange(fieldName: string, fieldValue: string | string[] | number): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }

  protected onFormChange(value: DocumentModel): void {
    this.formData.update((vm) => ({...vm, ...value}));
    debugFormModel('DocumentForm.onFormChange', this.formData(), this.currentUser());
    debugFormErrors('DocumentForm.onFormChange', this.validationResult().errors, this.currentUser());
  }

  protected download(): void {
    window.open(this.url(), '_blank');    
  }

  protected async showPriorVersion(): Promise<void> {
    if (this.priorVersionKey()) {
      await this.router.navigateByUrl(`/document/${this.priorVersionKey()}`);
    }
  }

  protected copy(value: string): void {
      copyToClipboard(value);
      showToast(this.toastController, '@general.operation.copy.conf');  
  }

  /******************************* helpers *************************************** */
  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}
