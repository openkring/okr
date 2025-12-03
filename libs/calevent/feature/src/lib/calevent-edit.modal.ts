import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { AppStore } from '@bk2/shared-feature';
import { TranslatePipe } from '@bk2/shared-i18n';
import { CalEventModel } from '@bk2/shared-models';
import { ChangeConfirmationComponent, HeaderComponent } from '@bk2/shared-ui';
import { coerceBoolean, die } from '@bk2/shared-util-core';

import { CalEventFormComponent } from '@bk2/calevent-ui';
import { CalEventFormModel, convertCalEventToForm, convertFormToCalEvent } from '@bk2/calevent-util';

@Component({
  selector: 'bk-calevent-edit-modal',
  standalone: true,
  imports: [
    HeaderComponent, ChangeConfirmationComponent,
    CalEventFormComponent,
    TranslatePipe, AsyncPipe,
    IonContent
  ],
  template: `
    <bk-header title="{{ '@calEvent.operation.update.label' | translate | async }}" [isModal]="true" />
    @if(showConfirmation()) {
      <bk-change-confirmation [showCancel]=true (cancelClicked)="cancel()" (okClicked)="save()" />
    }
    <ion-content no-padding>
      <bk-calevent-form
        [formData]="formData()" 
        [currentUser]="currentUser()"
        [types]="types()"
        [periodicities]="periodicities()"
        [allTags]="tags()" 
        [locale]="locale()"
        [readOnly]="isReadOnly()"
        (formDataChange)="onFormDataChange($event)"
      />
    </ion-content>
  `
})
export class CalEventEditModalComponent {
  private readonly modalController = inject(ModalController);
  protected readonly appStore = inject(AppStore);

  // inputs
  public calevent = input.required<CalEventModel>();
  public readOnly = input<boolean>(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected formData = linkedSignal(() => convertCalEventToForm(this.calevent()));

  // derived signals
  protected currentUser = computed(() => this.appStore.currentUser() ?? die('CalEventEditModal: current user is required'));
  protected types = computed(() => this.appStore.getCategory('calevent_type'));
  protected periodicities = computed(() => this.appStore.getCategory('periodicity'));
  protected tags = computed(() => this.appStore.getTags('calevent'));
  protected locale = computed(() => this.appStore.appConfig().locale);

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    this.formDirty.set(false);
    await this.modalController.dismiss(convertFormToCalEvent(this.formData(), this.calevent()), 'confirm');
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.formData.set(convertCalEventToForm(this.calevent()));  // reset
  }

  protected onFormDataChange(formData: CalEventFormModel): void {
    this.formData.set(formData);
  }
}
