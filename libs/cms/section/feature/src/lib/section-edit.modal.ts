import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { ENV } from '@bk2/shared-config';
import { AppStore } from '@bk2/shared-feature';
import { TranslatePipe } from '@bk2/shared-i18n';
import { ModelType, SectionModel } from '@bk2/shared-models';
import { ChangeConfirmationComponent, HeaderComponent } from '@bk2/shared-ui';

import { convertFormToSection, convertSectionToForm } from '@bk2/cms-section-util';
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
      <bk-header title="{{ title() | translate | async }}" [isModal]="true" />
      @if(formIsValid()) {
        <bk-change-confirmation (okClicked)="save()" />
      } 
      <ion-content>
        <bk-section-form [(vm)]="vm" [currentUser]="appStore.currentUser()" [sectionTags]="sectionTags()" (validChange)="formIsValid.set($event)" />
      </ion-content>
  `
})
export class SectionEditModalComponent {
  private readonly modalController = inject(ModalController);
  protected appStore = inject(AppStore);
  private readonly env = inject(ENV);

  public section = input.required<SectionModel>();
  protected vm = linkedSignal(() => convertSectionToForm(this.section()));
  protected title = computed(() => this.section().name);
  protected readonly sectionTags = computed(() => this.appStore.getTags(ModelType.Section));
  protected formIsValid = signal(false);

  /**
   * Save the changes to the section into the database.
   */
  public async save(): Promise<boolean> {
    return this.modalController.dismiss(convertFormToSection(this.section(), this.vm(), this.env.tenantId), 'confirm');
  }
}
