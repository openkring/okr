import { Component, computed, effect, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent } from '@ionic/angular/standalone';

import { DocumentModel } from '@bk2/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@bk2/shared-ui';
import { coerceBoolean, safeStructuredClone } from '@bk2/shared-util-core';

import { DocumentForm } from '@bk2/document-ui';
import { DocumentStore } from './document.store';


@Component({
  selector: 'bk-document-edit-page',
  standalone: true,
  imports: [
    Header, ChangeConfirmation,
    DocumentForm,
    IonContent
  ],
  providers: [DocumentStore],
    styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    <bk-header [i18n]="{ title: headerTitle() }" />
    @if(showConfirmation()) {
      <bk-change-confirmation [i18n]="changeConfirmationI18n()" [showCancel]=true (cancelClicked)="cancel()" (okClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if(formData(); as formData) {
        <bk-document-form
          [formData]="formData"
          (formDataChange)="onFormDataChange($event)"
          [i18n]="store.i18n"
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
export class DocumentEditPage {
  protected readonly store = inject(DocumentStore);

  // inputs
  public documentKey = input.required<string>();
  public readOnly = input<boolean>(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  
  // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected readonly changeConfirmationI18n = computed(() => ({ok: this.store.i18n.ok(), cancel: this.store.i18n.cancel(), confirmation: this.store.i18n.save()} as ChangeConfirmationI18n));
  protected document = linkedSignal(() => this.store.document() ?? new DocumentModel(this.store.tenantId()));
  protected formData = linkedSignal(() => safeStructuredClone(this.document()));
  protected showForm = signal(true);

  // derived signals
  protected headerTitle = computed(() => this.store.getTitleLabel(this.isReadOnly(), this.document()?.bkey));
  protected currentUser = computed(() => this.store.currentUser());
  protected tags = computed(() => this.store.getTags());
  protected types = computed(() => this.store.getTypes());
  protected sources = computed(() => this.store.getSources());

  constructor() {
    effect(() => {
      this.store.setDocumentKey(this.documentKey());
    }); 
  }

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    await this.store.save(this.document());
    this.store.appNavigationService.back();
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
