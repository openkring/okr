import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonTitle, IonToolbar, ModalController } from '@ionic/angular/standalone';
import { firstValueFrom } from 'rxjs';

import { AppStore } from '@bk2/shared-feature';
import { TranslatePipe } from '@bk2/shared-i18n';
import { SectionModel } from '@bk2/shared-models';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { ChangeConfirmationComponent, HeaderComponent, SpinnerComponent } from '@bk2/shared-ui';
import { AppNavigationService } from '@bk2/shared-util-angular';

import { SectionService } from '@bk2/cms-section-data-access';
import { convertFormToSection, convertSectionToForm, SectionFormModel } from '@bk2/cms-section-util';

import { PreviewModalComponent } from './section-preview.modal';
import { SectionFormComponent } from './section.form';

@Component({
  selector: 'bk-section-page',
  standalone: true,
  imports: [TranslatePipe, AsyncPipe, SvgIconPipe, ChangeConfirmationComponent, SectionFormComponent, SpinnerComponent, HeaderComponent, IonContent, IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon],
  template: `
    @if(vm()) {
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
    @if(formIsValid()) {
    <bk-change-confirmation [showCancel]="true" (okClicked)="save()" (cancelClicked)="cancel()" />
    }
    <ion-content>
      <div style="width: 100%">
        <bk-section-form [(vm)]="vm" [currentUser]="appStore.currentUser()" [sectionTags]="sectionTags()" (validChange)="formIsValid.set($event)" />
      </div>
    </ion-content>
    } @else {
    <bk-header title="" />
    <ion-content>
      <bk-spinner />
    </ion-content>
    }
  `,
})
export class SectionPageComponent {
  private readonly modalController = inject(ModalController);
  public sectionService = inject(SectionService);
  private readonly appNavigationService = inject(AppNavigationService);
  protected appStore = inject(AppStore);

  public id = input.required<string>();

  private readonly sectionRef = rxResource({
    params: () => this.id(),
    stream: () => this.sectionService.read(this.id()),
  });
  public section = computed(() => this.sectionRef.value());
  public vm = linkedSignal(() => convertSectionToForm(this.section() ?? new SectionModel(this.appStore.tenantId())));
  protected sectionTags = computed(() => this.appStore.getTags('section'));
  protected formIsValid = signal(false);

  /**
   * Save the changes to the section into the database.
   */
  public async save(): Promise<void> {
    const originalSection = await firstValueFrom(this.sectionService.read(this.id()));
    const section = convertFormToSection(originalSection, this.vm(), this.appStore.tenantId());
    await this.sectionService.update(section, this.appStore.currentUser());
    this.formIsValid.set(false);
    this.appNavigationService.back();
  }

  public async cancel(): Promise<void> {
    this.appNavigationService.back();
  }

  public async previewSection(): Promise<void> {
    const originalSection = await firstValueFrom(this.sectionService.read(this.id()));
    const modal = await this.modalController.create({
      component: PreviewModalComponent,
      cssClass: 'full-modal',
      componentProps: {
        section: convertFormToSection(originalSection, this.vm() as SectionFormModel, this.appStore.tenantId()),
      },
    });
    modal.present();
    await modal.onWillDismiss();
  }
}
