import { Component, computed, inject, input, linkedSignal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonButton, IonButtons, IonContent, IonItem, IonInput, IonLabel, IonToggle, IonToolbar, ModalController, IonTextarea } from '@ionic/angular/standalone';
import { signalStore, withProps } from '@ngrx/signals';

import { I18nService } from '@bk2/shared-i18n';
import { BkEditor, ButtonCopyI18n, Header } from '@bk2/shared-ui';
import { WebsiteContentModel } from '@bk2/shared-models';
import { deepEqual, safeStructuredClone } from '@bk2/shared-util-core';

const AocWebsiteEditStore = signalStore(
  withProps(() => ({ i18nService: inject(I18nService) })),
  withProps((store) => ({
    i18n: store.i18nService.translateAll({
      key_label:    '@aoc.website.key.label',
      is_html_label: '@aoc.website.isHtml.label',
      cancel:       '@general.operation.cancel',
      save:         '@general.operation.save',
      copy_conf:    '@shared/ui.copy.conf',
    }),
  })),
);

@Component({
  selector: 'bk-aoc-website-edit-modal',
  standalone: true,
  providers: [AocWebsiteEditStore],
  imports: [
    FormsModule,
    Header, BkEditor,
    IonContent, IonToolbar, IonButtons, IonButton,
    IonItem, IonLabel, IonInput, IonToggle, IonTextarea
  ],
  template: `
    <bk-header [i18n]="{ title: '@aoc.website.edit.title' }" [isModal]="true" />
    <ion-content class="ion-padding">
      <ion-item>
        <ion-label position="stacked">{{ store.i18n.key_label() }}</ion-label>
        <ion-input [value]="formData().key" [readonly]="true" />
      </ion-item>

      <ion-item>
        <ion-toggle [checked]="formData().isHtml" (ionChange)="onToggleHtml($event)" />
        <ion-label>{{ store.i18n.is_html_label() }}</ion-label>
      </ion-item>


      @if (formData().isHtml) {
        <ion-item lines="none">
          <ion-label>DE:</ion-label>
        </ion-item>
        <bk-editor [(content)]="deContent" [readOnly]="false" [buttonCopyI18n]="buttonCopyI18n()" />
      } @else {
        <ion-item>
          <ion-textarea [value]="formData().de" label="DE" (ionInput)="onDeInput($event)" />
        </ion-item>
      }

      @if (formData().isHtml) {
        <ion-item lines="none">
          <ion-label>EN:</ion-label>
        </ion-item>
        <bk-editor [(content)]="enContent" [readOnly]="false" [buttonCopyI18n]="buttonCopyI18n()" />
      } @else {
        <ion-item>
          <ion-textarea [value]="formData().en" label="EN" (ionInput)="onEnInput($event)" />
        </ion-item>
      }

      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button (click)="cancel()">{{ store.i18n.cancel() }}</ion-button>
        </ion-buttons>
        <ion-buttons slot="end">
          <ion-button [disabled]="!isDirty()" (click)="save()" color="primary">
            {{ store.i18n.save() }}
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-content>
  `,
})
export class AocWebsiteEditModal {
  protected readonly store = inject(AocWebsiteEditStore);
  private readonly modalController = inject(ModalController);
  protected readonly buttonCopyI18n = computed(() => ({ copy_conf: this.store.i18n.copy_conf() } as ButtonCopyI18n));

  public item = input.required<WebsiteContentModel>();

  protected formData = linkedSignal(() => safeStructuredClone(this.item()) ?? {} as WebsiteContentModel);
  protected deContent = linkedSignal(() => this.formData().de ?? '');
  protected enContent = linkedSignal(() => this.formData().en ?? '');
  protected isDirty = computed(() =>
    !deepEqual(this.formData(), safeStructuredClone(this.item())) ||
    this.deContent() !== (this.item().de ?? '') ||
    this.enContent() !== (this.item().en ?? '')
  );

  protected onToggleHtml(event: Event): void {
    this.formData.update(d => ({ ...d, isHtml: (event as CustomEvent).detail.checked }));
  }

  protected onDeInput(event: Event): void {
    this.formData.update(d => ({ ...d, de: (event as CustomEvent).detail.value ?? '' }));
  }

  protected onEnInput(event: Event): void {
    this.formData.update(d => ({ ...d, en: (event as CustomEvent).detail.value ?? '' }));
  }

  protected async save(): Promise<void> {
    const data: WebsiteContentModel = { ...this.formData(), de: this.deContent(), en: this.enContent() };
    await this.modalController.dismiss(data, 'confirm');
  }

  protected cancel(): void {
    this.modalController.dismiss(null, 'cancel');
  }
}
