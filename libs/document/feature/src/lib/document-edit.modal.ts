import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { CategoryListModel, DocumentModel, UserModel } from '@bk2/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@bk2/shared-ui';
import { coerceBoolean, safeStructuredClone } from '@bk2/shared-util-core';

import { DocumentForm } from '@bk2/document-ui';
import { DocumentStore } from './document.store';


@Component({
  selector: 'bk-document-edit-modal',
  standalone: true,
  imports: [
    Header, ChangeConfirmation,
    DocumentForm,
    IonContent
  ],
  providers: [DocumentStore],
    styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    <bk-header [i18n]="{ title: headerTitle() }" [isModal]="true" />
    @if(showConfirmation()) {
      <bk-change-confirmation [i18n]="changeConfirmationI18n()" [showCancel]=true (cancelClicked)="cancel()" (okClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if(formData(); as formData) {
        <bk-document-form
          [formData]="formData" (formDataChange)="onFormDataChange($event)"
          [i18n]="store.i18n"
          [currentUser]="currentUser()"
          [types]="types()"
          [sources]="sources()"
          [showForm]="showForm()"
          [allTags]="tags()"
          [readOnly]="isReadOnly()"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
          (priorVersionClicked)="openPriorVersion($event)"
        />
      }
    </ion-content>
  `
})
export class DocumentEditModal {
  private readonly modalController = inject(ModalController);
  protected readonly store = inject(DocumentStore);

  // inputs
  public document = input.required<DocumentModel>();
  public currentUser = input<UserModel | undefined>();
  public tags = input.required<string>();
  public types = input.required<CategoryListModel>();
  public sources = input.required<CategoryListModel>();
  public readOnly = input<boolean>(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  
  // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected readonly changeConfirmationI18n = computed(() => ({ok: this.store.i18n.ok(), cancel: this.store.i18n.cancel(), confirmation: this.store.i18n.save()} as ChangeConfirmationI18n));
  protected formData = linkedSignal(() => safeStructuredClone(this.document()));
  protected showForm = signal(true);

  // derived signalsa
  protected documentKey = computed(() => this.document()?.bkey ?? '');
  protected headerTitle = computed(() => this.store.getTitleLabel(this.isReadOnly(), this.document()?.bkey));

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    await this.modalController.dismiss(this.formData(), 'confirm');
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
  
  protected async openPriorVersion(key: string): Promise<void> {
    await this.store.openPriorVersion(key, this.tags(), this.types(), this.sources());
  }
}
