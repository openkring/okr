import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { AppStore } from '@bk2/shared-feature';
import { TranslatePipe } from '@bk2/shared-i18n';
import { SectionModel } from '@bk2/shared-models';
import { ChangeConfirmationComponent, HeaderComponent } from '@bk2/shared-ui';
import { coerceBoolean } from '@bk2/shared-util-core';

import { convertFormToSection, convertSectionToForm, SectionFormModel } from '@bk2/cms-section-util';
import { SectionFormComponent } from './section.form';

@Component({
    selector: 'bk-section-edit-modal',
    standalone: true,
    imports: [
      TranslatePipe, AsyncPipe,
      ChangeConfirmationComponent, SectionFormComponent, HeaderComponent,
      SectionFormComponent, HeaderComponent,
      IonContent
    ],
    template: `
      <bk-header title="{{ headerTitle() | translate | async }}" [isModal]="true" />
    @if(showConfirmation()) {
      <bk-change-confirmation [showCancel]=true (cancelClicked)="cancel()" (okClicked)="save()" />
      } 
      <ion-content no-padding>
        <bk-section-form
          [formData]="formData()"
          [currentUser]="appStore.currentUser()"
          [allTags]="tags()"
          [readOnly]="isReadOnly()"
          (formDataChange)="onFormDataChange($event)"
        />
      </ion-content>
  `
})
export class SectionEditModalComponent {
  private readonly modalController = inject(ModalController);
  protected appStore = inject(AppStore);

  // inputs
  public section = input.required<SectionModel>();
  public readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected formData = linkedSignal(() => convertSectionToForm(this.section()));

  // derived signals
  protected headerTitle = computed(() => this.section().name);
  protected readonly tags = computed(() => this.appStore.getTags('section'));
  protected formIsValid = signal(false);

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    this.formDirty.set(false);
    await this.modalController.dismiss(convertFormToSection(this.formData(), this.section()), 'confirm');  
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.formData.set(convertSectionToForm(this.section()));  // reset the form
  }

  protected onFormDataChange(formData: SectionFormModel): void {
    this.formData.set(formData);
  }
}
