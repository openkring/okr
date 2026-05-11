import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input, linkedSignal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonButton, IonButtons, IonContent, IonItem, IonInput, IonLabel,
  IonToggle, IonToolbar, ModalController,
} from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { EditorComponent, HeaderComponent } from '@bk2/shared-ui';
import { WebsiteContentModel } from '@bk2/shared-models';
import { deepEqual, safeStructuredClone } from '@bk2/shared-util-core';

@Component({
  selector: 'bk-aoc-website-edit-modal',
  standalone: true,
  imports: [
    AsyncPipe, FormsModule, TranslatePipe,
    HeaderComponent, EditorComponent,
    IonContent, IonToolbar, IonButtons, IonButton,
    IonItem, IonLabel, IonInput, IonToggle,
  ],
  template: `
    <bk-header title="@aoc.website.edit.title" [isModal]="true" />
    <ion-content class="ion-padding">
      <ion-item>
        <ion-label position="stacked">{{ '@aoc.website.key.label' | translate | async }}</ion-label>
        <ion-input [value]="formData().key" [readonly]="true" />
      </ion-item>

      <ion-item>
        <ion-label>{{ '@aoc.website.isHtml.label' | translate | async }}</ion-label>
        <ion-toggle [checked]="formData().isHtml" (ionChange)="onToggleHtml($event)" />
      </ion-item>

      <ion-item lines="none">
        <ion-label>{{ '@lang.de' | translate | async }}</ion-label>
      </ion-item>
      @if (formData().isHtml) {
        <bk-editor [(content)]="deContent" [readOnly]="false" />
      } @else {
        <ion-item>
          <ion-input [value]="formData().de" (ionInput)="onDeInput($event)" />
        </ion-item>
      }

      <ion-item lines="none">
        <ion-label>{{ '@lang.en' | translate | async }}</ion-label>
      </ion-item>
      @if (formData().isHtml) {
        <bk-editor [(content)]="enContent" [readOnly]="false" />
      } @else {
        <ion-item>
          <ion-input [value]="formData().en" (ionInput)="onEnInput($event)" />
        </ion-item>
      }

      <ion-toolbar>
        <ion-buttons slot="end">
          <ion-button (click)="cancel()">{{ '@general.operation.cancel' | translate | async }}</ion-button>
          <ion-button [disabled]="!isDirty()" (click)="save()" color="primary">
            {{ '@general.operation.save' | translate | async }}
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-content>
  `,
})
export class AocWebsiteEditModal {
  private readonly modalController = inject(ModalController);

  public item = input.required<WebsiteContentModel>();

  protected formData = linkedSignal(() => safeStructuredClone(this.item()) ?? {} as WebsiteContentModel);
  protected deContent = linkedSignal(() => this.formData().de ?? '');
  protected enContent = linkedSignal(() => this.formData().en ?? '');
  protected isDirty = computed(() => !deepEqual(this.formData(), safeStructuredClone(this.item())));

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
