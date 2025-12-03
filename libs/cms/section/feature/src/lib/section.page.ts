import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonTitle, IonToolbar, ModalController } from '@ionic/angular/standalone';

import { AppStore } from '@bk2/shared-feature';
import { TranslatePipe } from '@bk2/shared-i18n';
import { SectionModel } from '@bk2/shared-models';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { ChangeConfirmationComponent } from '@bk2/shared-ui';
import { AppNavigationService } from '@bk2/shared-util-angular';

import { SectionService } from '@bk2/cms-section-data-access';
import { convertFormToSection, convertSectionToForm, SectionFormModel } from '@bk2/cms-section-util';

import { PreviewModalComponent } from './section-preview.modal';
import { SectionFormComponent } from './section.form';

@Component({
  selector: 'bk-section-page',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe, 
    ChangeConfirmationComponent, SectionFormComponent, 
    IonContent, IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon
  ],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-title>{{ '@content.section.operation.update.label' | translate | async }}</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="previewSection()">
            <ion-icon slot="icon-only" src="{{ 'eye-on' | svgIcon }}" />
          </ion-button>
          <ion-button color="light" (click)="cancel()">
            <ion-icon slot="icon-only" src="{{ 'close_cancel_circle' | svgIcon }}" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    @if(showConfirmation()) {
      <bk-change-confirmation [showCancel]=true (cancelClicked)="cancelChange()" (okClicked)="save()" />
    }
    <ion-content no-padding>
      <div style="width: 100%">
        <bk-section-form
          [formData]="formData()"
          [currentUser]="appStore.currentUser()"
          [allTags]="tags()"
          (formDataChange)="onFormDataChange($event)"
        />
      </div>
    </ion-content>
  `,
})
export class SectionPageComponent {
  private readonly modalController = inject(ModalController);
  public sectionService = inject(SectionService);
  private readonly appNavigationService = inject(AppNavigationService);
  protected appStore = inject(AppStore);

  // inputs
  public id = input.required<string>();

 // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  public formData = linkedSignal(() => convertSectionToForm(this.originalSection() ?? new SectionModel(this.appStore.tenantId())));

  private readonly sectionRef = rxResource({
    params: () => this.id(),
    stream: () => this.sectionService.read(this.id()),
  });
  public originalSection = computed(() => this.sectionRef.value());
  protected tags = computed(() => this.appStore.getTags('section'));

  /******************************* actions *************************************** */
  /**
   * Save the changes to the section into the database.
   */
  public async save(): Promise<void> {
    this.formDirty.set(false);
    const newSection = convertFormToSection(this.formData(), this.originalSection());
    await this.sectionService.update(newSection, this.appStore.currentUser());
  }

  public async cancelChange(): Promise<void> {
    this.formDirty.set(false);
    this.formData.set(convertSectionToForm(this.originalSection() ?? new SectionModel(this.appStore.tenantId())));  // reset the form
  }

  protected onFormDataChange(formData: SectionFormModel): void {
    this.formData.set(formData);
  }

  public async cancel(): Promise<void> {
    this.appNavigationService.back();
  }

  public async previewSection(): Promise<void> {
    const modal = await this.modalController.create({
      component: PreviewModalComponent,
      cssClass: 'full-modal',
      componentProps: {
        section: convertFormToSection(this.formData(), this.originalSection()),
      },
    });
    modal.present();
    await modal.onWillDismiss();
  }
}
