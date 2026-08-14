import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';
import { firstValueFrom } from 'rxjs';

import { CategoryListModel, DocumentModel, UserModel } from '@okr/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { coerceBoolean, safeStructuredClone } from '@okr/shared-util-core';
import { I18nService } from '@okr/shared-i18n';
import { DocumentService } from '@okr/content-document-data-access';
import { DOCUMENT_I18N_KEYS, DocumentI18n } from '@okr/content-document-util';

import { DocumentForm } from '@okr/content-document-ui';

@Component({
  selector: 'okr-document-edit-modal',
  standalone: true,
  imports: [
    Header, ChangeConfirmation,
    DocumentForm,
    IonContent
  ],
    styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    <okr-header [i18n]="{ title: headerTitle() }" [isModal]="true" />
    @if(showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if(formData(); as formData) {
        <okr-document-form
          [formData]="formData" (formDataChange)="onFormDataChange($event)"
          [i18n]="i18n"
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
  protected readonly i18n = inject(I18nService).translateAll(DOCUMENT_I18N_KEYS) as DocumentI18n;

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
  protected readonly changeConfirmationI18n = computed(() => ({ cancel: this.i18n.cancel(), save: this.i18n.save()} as ChangeConfirmationI18n));

  protected formData = linkedSignal(() => safeStructuredClone(this.document()));
  protected showForm = signal(true);

  // derived signals
  protected documentKey = computed(() => this.document()?.okey ?? '');
  protected headerTitle = computed(() => {
    if (this.isReadOnly()) return this.i18n.view();
    const key = this.document()?.okey;
    return (key && key.length > 0) ? this.i18n.update() : this.i18n.create();
  });

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
