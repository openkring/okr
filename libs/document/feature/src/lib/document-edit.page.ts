import { Component, computed, effect, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent } from '@ionic/angular/standalone';

import { DocumentModel } from '@bk2/shared-models';
import { ChangeConfirmationComponent, HeaderComponent } from '@bk2/shared-ui';
import { coerceBoolean, safeStructuredClone } from '@bk2/shared-util-core';
import { getTitleLabel } from '@bk2/shared-util-angular';

import { DocumentFormComponent } from '@bk2/document-ui';
import { DocumentStore } from './document.store';


@Component({
  selector: 'bk-document-edit-page',
  standalone: true,
  imports: [
    HeaderComponent, ChangeConfirmationComponent,
    DocumentFormComponent,
    IonContent
  ],
  providers: [DocumentStore],
    styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    <bk-header [title]="headerTitle()" />
    @if(showConfirmation()) {
      <bk-change-confirmation [showCancel]=true (cancelClicked)="cancel()" (okClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if(formData(); as formData) {
        <bk-document-form
          [formData]="formData"
          (formDataChange)="onFormDataChange($event)" 
          [currentUser]="currentUser()"
          [types]="types()"
          [sources]="sources()"
          [showForm]="showForm()"
          [allTags]="tags()"
          [readOnly]="isReadOnly()"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
        />
      }
    </ion-content>
  `
})
export class DocumentEditPageComponent {
  private readonly documentStore = inject(DocumentStore);

  // inputs
  public documentKey = input.required<string>();
  public readOnly = input<boolean>(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  
  // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected document = linkedSignal(() => this.documentStore.document() ?? new DocumentModel(this.documentStore.tenantId()));
  protected formData = linkedSignal(() => safeStructuredClone(this.document()));
  protected showForm = signal(true);

  // derived signals
  protected headerTitle = computed(() => getTitleLabel('document', this.document()?.bkey, this.isReadOnly()));
  protected currentUser = computed(() => this.documentStore.currentUser());
  protected tags = computed(() => this.documentStore.getTags());
  protected types = computed(() => this.documentStore.getTypes());
  protected sources = computed(() => this.documentStore.getSources());

  constructor() {
    effect(() => {
      this.documentStore.setDocumentKey(this.documentKey());
    }); 
  }

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    await this.documentStore.save(this.document());
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.formData.set(safeStructuredClone(this.document()));  // reset the form
    // This destroys and recreates the <form scVestForm> → Vest fully resets
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }

  protected onFormDataChange(formData: DocumentModel): void {
    this.formData.set(formData);
  }
}
