import { Component, computed, effect, inject, input, model, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonCard, IonCardContent, IonCol, IonGrid, IonIcon, IonItem, IonRow, ToastController } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { CategoryListModel, RoleName, UserModel } from '@bk2/shared-models';
import { CategorySelectComponent, ChipsComponent, DateInputComponent, NotesInputComponent, TextInputComponent } from '@bk2/shared-ui';
import { coerceBoolean, debugFormErrors, fileName, hasRole } from '@bk2/shared-util-core';
import { DEFAULT_DATE, DEFAULT_NOTES, DEFAULT_TAGS } from '@bk2/shared-constants';
import { DOCUMENT_FORM_SHAPE, DocumentFormModel, documentFormValidations } from '@bk2/document-util';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { Router } from '@angular/router';
import { copyToClipboard, showToast } from '@bk2/shared-util-angular';

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
    <form scVestForm
    [formShape]="shape"
    [formValue]="formData()"
    [suite]="suite" 
    (dirtyChange)="dirty.emit($event)"
    (formValueChange)="onFormChange($event)">

    <ion-card>
      <ion-card-content class="ion-no-padding">
        <ion-grid>
          <ion-row> 
            <ion-col size="12">
              @if(hasRole('admin')) {
                <ion-item lines="none">
                  <ion-icon src="{{ 'download' | svgIcon }}" slot="start" (click)="download()" />
                  <ion-icon src="{{ 'copy' | svgIcon }}" slot="start" (click)="copy(fullPath())" />
                  <bk-text-input name="fullPath" [value]="fullPath()" [maxLength]=300 [readOnly]="true" />                                        
                </ion-item>
              } @else {
                <bk-text-input name="fileName" [value]="fileName()" [maxLength]=50 [readOnly]="true" [copyable]="true" />                                        
              }
            </ion-col>
            <ion-col size="12">
              <bk-text-input name="title" [value]="title()" [autofocus]="true" [maxLength]=50 [readOnly]="isReadOnly()" (changed)="onFieldChange('title', $event)" />                                        
            </ion-col>

            <ion-col size="12">
              <bk-text-input name="altText" [value]="altText()" [maxLength]=100 [readOnly]="isReadOnly()" (changed)="onFieldChange('altText', $event)" />                                        
            </ion-col>
          </ion-row>

          <ion-row>
            <ion-col size="12" size-md="6">
              <bk-cat-select [category]="types()!" [selectedItemName]="type()" [withAll]="false" [readOnly]="isReadOnly()" (changed)="onFieldChange('type', $event)" />
            </ion-col>

            <ion-col size="12" size-md="6">
              <bk-cat-select [category]="sources()!" [selectedItemName]="source()" [withAll]="false" [readOnly]="isReadOnly()" (changed)="onFieldChange('source', $event)" />
            </ion-col>
          </ion-row>

          <ion-row> 
            @if (hasRole('admin')) {
              <ion-col size="12">
                <bk-text-input name="url" [value]="url()" [autofocus]="true" [maxLength]=300 [readOnly]="isReadOnly()" [copyable]="true" (changed)="onFieldChange('url', $event)" />                                        
              </ion-col>
            }

            <ion-col size="12">
              <bk-text-input name="mimeType" [value]="mimeType()" [maxLength]=50 [readOnly]="isReadOnly()" (changed)="onFieldChange('mimeType', $event)" />                                        
            </ion-col>

            <ion-col size="12" size-md="6">
              <bk-text-input name="authorKey" [value]="authorKey()" [maxLength]=50 [readOnly]="isReadOnly()" (changed)="onFieldChange('authorKey', $event)" />                                        
            </ion-col>

            <ion-col size="12" size-md="6">
              <bk-text-input name="authorName" [value]="authorName()" [maxLength]=50 [readOnly]="isReadOnly()" (changed)="onFieldChange('authorName', $event)" />                                        
            </ion-col>
          </ion-row>

          <ion-row>
            <ion-col size="12" size-md="6"> 
              <bk-date-input name="dateOfDocCreation" [storeDate]="dateOfDocCreation()" [readOnly]="isReadOnly()" (changed)="onFieldChange('dateOfDocCreation', $event)" />
            </ion-col>

            <ion-col size="12" size-md="6">
              <bk-date-input name="dateOfDocLastUpdate"  [storeDate]="dateOfDocLastUpdate()" [readOnly]="isReadOnly()" (changed)="onFieldChange('dateOfDocLastUpdate', $event)" />
            </ion-col>
          </ion-row>

          @if(hasRole('privileged') || !isReadOnly()) {
            <ion-row>
              <ion-col size="12">
                <bk-text-input name="locationKey" [value]="locationKey()" [autofocus]="true" [maxLength]=20 [readOnly]="isReadOnly()" [copyable]="true" (changed)="onFieldChange('locationKey', $event)" />                                        
              </ion-col>

              <ion-col size="12">
                <bk-text-input name="hash" [value]="hash()" [maxLength]=100 [readOnly]="isReadOnly()" [copyable]="true" (changed)="onFieldChange('hash', $event)" />                                        
              </ion-col>

              <ion-col size="12">
                <ion-item lines="none">
                  <ion-icon src="{{'link' | svgIcon }}" slot="start" (click)="showPriorVersion()" />
                  <bk-text-input name="priorVersionKey" [value]="priorVersionKey()" [maxLength]=20 [readOnly]="isReadOnly()" [showHelper]=true (changed)="onFieldChange('priorVersionKey', $event)" />
                </ion-item>                                    
              </ion-col>

              <ion-col size="12">
                <bk-text-input name="version" [value]="version()" [maxLength]=20 [readOnly]="isReadOnly()" [showHelper]=true (changed)="onFieldChange('version', $event)" />                                        
              </ion-col>
            </ion-row>
          }
        </ion-grid>
      </ion-card-content>
    </ion-card>

    <bk-chips chipName="tag" [storedChips]="tags()" [allChips]="allTags()" [readOnly]="isReadOnly()" (changed)="onFieldChange('tags', $event)" />
    <bk-notes name="description" [value]="description()" [readOnly]="isReadOnly()" (changed)="onFieldChange('description', $event)" />
  </form>
  `
})
export class DocumentFormComponent {  
  private router = inject(Router);
  private toastController = inject(ToastController);

  // inputs  
  public formData = model.required<DocumentFormModel>();
  public currentUser = input<UserModel | undefined>();
  public readonly allTags = input.required<string>();
  public readonly types = input.required<CategoryListModel>();
  public readonly sources = input.required<CategoryListModel>();
  public readonly readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  
 // signals
  public dirty = output<boolean>();
  public valid = output<boolean>();

  // validations and errors
  protected readonly suite = documentFormValidations;
  protected readonly shape = DOCUMENT_FORM_SHAPE;
  private readonly validationResult = computed(() => documentFormValidations(this.formData()));

  // fields
  protected fullPath = computed(() => this.formData().fullPath ?? '');
  protected fileName = computed(() => fileName(this.fullPath()));
  protected title = computed(() => this.formData().title ?? '');
  protected altText = computed(() => this.formData().altText ?? '');
  protected type = computed(() => this.formData().type ?? '');
  protected source = computed(() => this.formData().source ?? '');
  protected url = computed(() => this.formData().url ?? '');
  protected mimeType = computed(() => this.formData().mimeType ?? '');
  protected authorKey = computed(() => this.formData().authorKey ?? '');
  protected authorName = computed(() => this.formData().authorName ?? '');
  protected dateOfDocCreation = computed(() => this.formData().dateOfDocCreation ?? DEFAULT_DATE);
  protected dateOfDocLastUpdate = computed(() => this.formData().dateOfDocLastUpdate ?? DEFAULT_DATE);
  protected locationKey = computed(() => this.formData().locationKey ?? '');
  protected hash = computed(() => this.formData().hash ?? '');
  protected priorVersionKey = computed(() => this.formData().priorVersionKey ?? '');
  protected version = computed(() => this.formData().version ?? '');
  protected description = computed(() => this.formData().description ?? DEFAULT_NOTES);
  protected tags = computed(() => this.formData().tags ?? DEFAULT_TAGS);

  constructor() {
    effect(() => {
      this.valid.emit(this.validationResult().isValid());
    });
  }

  /******************************* actions *************************************** */
  protected onFormChange(value: DocumentFormModel): void {
    this.formData.update((vm) => ({...vm, ...value}));
    debugFormErrors('DocumentForm.onFormChange', this.validationResult().errors, this.currentUser());
  }

  protected onFieldChange(fieldName: string, fieldValue: string | string[] | number): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
    debugFormErrors('DocumentForm.onFieldChange', this.validationResult().errors, this.currentUser());
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
