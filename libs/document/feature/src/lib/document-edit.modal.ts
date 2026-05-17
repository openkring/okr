import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';
import { firstValueFrom } from 'rxjs';

import { CategoryListModel, DocumentModel, UserModel } from '@bk2/shared-models';
import { ChangeConfirmation, Header } from '@bk2/shared-ui';
import { coerceBoolean, safeStructuredClone } from '@bk2/shared-util-core';
import { getTitleLabel } from '@bk2/shared-util-angular';

import { DocumentService } from '@bk2/document-data-access';
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
    <bk-header [title]="headerTitle()" [isModal]="true" />
    @if(showConfirmation()) {
      <bk-change-confirmation [showCancel]=true (cancelClicked)="cancel()" (okClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if(formData(); as formData) {
        <bk-document-form
          [formData]="formData" (formDataChange)="onFormDataChange($event)" 
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
  private readonly documentService = inject(DocumentService);

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
  protected formData = linkedSignal(() => safeStructuredClone(this.document()));
  protected showForm = signal(true);

  // derived signalsa
  protected documentKey = computed(() => this.document()?.bkey ?? '');
  protected headerTitle = computed(() => getTitleLabel('document', this.document()?.bkey, this.isReadOnly()));

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
    const prior = await firstValueFrom(this.documentService.read(key));
    if (!prior) return;
    const modal = await this.modalController.create({
      component: DocumentEditModal,
      componentProps: {
        document: prior,
        currentUser: this.currentUser(),
        tags: this.tags(),
        types: this.types(),
        sources: this.sources(),
        readOnly: true
      }
    });
    await modal.present();
    await modal.onWillDismiss();
  }
}
