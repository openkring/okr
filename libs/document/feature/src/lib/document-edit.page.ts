import { Component, computed, effect, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, Platform } from '@ionic/angular/standalone';

import { RoleName } from '@bk2/shared-models';
import { ChangeConfirmationComponent, HeaderComponent } from '@bk2/shared-ui';
import { coerceBoolean, hasRole } from '@bk2/shared-util-core';

import { DocumentEditStore } from 'libs/document/feature/src/lib/document-edit.store';
import { DocumentFormComponent } from '@bk2/document-ui';
import { convertDocumentToForm, DocumentFormModel } from '@bk2/document-util';
import { getTitleLabel } from '@bk2/shared-util-angular';


@Component({
  selector: 'bk-document-edit-page',
  standalone: true,
  imports: [
    HeaderComponent, ChangeConfirmationComponent,
    DocumentFormComponent,
    IonContent
  ],
  providers: [DocumentEditStore],
    styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    <bk-header [title]="headerTitle()" />
    @if(showConfirmation()) {
      <bk-change-confirmation [showCancel]=true (cancelClicked)="cancel()" (okClicked)="save()" />
    }
    <ion-content no-padding>
      @if(document(); as document) {
        @if(formData(); as formData) {
          <bk-document-form
            [formData]="formData" 
            [currentUser]="currentUser()"
            [types]="types()"
            [sources]="sources()"
            [allTags]="tags()"
            [readOnly]="isReadOnly()"
            formDataChange)="onFormDataChange($event)"
          />
        }
      }
    </ion-content>
  `
})
export class DocumentEditPageComponent {
  private readonly documentEditStore = inject(DocumentEditStore);

  // inputs
  public documentKey = input.required<string>();
  public readOnly = input<boolean>(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  
  // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected formData = linkedSignal(() => convertDocumentToForm(this.document()));

  // derived signals
  protected headerTitle = computed(() => getTitleLabel('document', this.document()?.bkey, this.isReadOnly()));
  protected currentUser = computed(() => this.documentEditStore.currentUser());
  protected document = computed(() => this.documentEditStore.document());
  protected tags = computed(() => this.documentEditStore.getTags());
  protected types = computed(() => this.documentEditStore.appStore.getCategory('document_type'));
  protected sources = computed(() => this.documentEditStore.appStore.getCategory('document_source'));

  constructor() {
    effect(() => {
      this.documentEditStore.setDocumentKey(this.documentKey());
    });
  }

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    this.formDirty.set(false);
    await this.documentEditStore.save(this.formData());
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.formData.set(convertDocumentToForm(this.document()));  // reset form
  }

  protected onFormDataChange(formData: DocumentFormModel): void {
    this.formData.set(formData);
  }

  /******************************* helpers *************************************** */
  protected hasRole(role: RoleName | undefined): boolean {
    return hasRole(role, this.currentUser());
  }
}
