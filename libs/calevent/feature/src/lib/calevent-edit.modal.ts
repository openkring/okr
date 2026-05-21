import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController, IonCardContent, IonCard, IonAccordionGroup } from '@ionic/angular/standalone';

import { CalEventModel, CalEventModelName, CategoryListModel, UserModel } from '@bk2/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@bk2/shared-ui';
import { coerceBoolean, safeStructuredClone } from '@bk2/shared-util-core';
import { CalendarSelectModal } from '@bk2/shared-feature';

import { CalEventForm } from '@bk2/calevent-ui';
import { InviteesAccordion } from '@bk2/relationship-invitation-feature';
import { DocumentsAccordion } from '@bk2/document-feature';
import { CommentsAccordion } from '@bk2/comment-feature';

import { AttendeesAccordion } from './attendees-accordion';
import { CalEventStore } from './calevent.store';

@Component({
  selector: 'bk-calevent-edit-modal',
  standalone: true,
  imports: [
    Header, ChangeConfirmation,
    CalEventForm, InviteesAccordion, DocumentsAccordion, 
    CommentsAccordion, AttendeesAccordion,
    IonContent, IonCard, IonCardContent, IonAccordionGroup
],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  providers: [CalEventStore],
  template: `
    <bk-header [i18n]="{ title: headerTitle() }" [isModal]="true" />
    @if(showConfirmation()) {
      <bk-change-confirmation [i18n]="changeConfirmationI18n()" [showCancel]=true (cancelClicked)="cancel()" (okClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if(formData(); as formData) {
        <bk-calevent-form
          [formData]="formData" 
          (formDataChange)="onFormDataChange($event)"
          [currentUser]="currentUser()"
          [showForm]="showForm()"
          [types]="types()"
          [periodicities]="periodicities()"
          [allTags]="tags()" 
          [tenantId]="tenantId()"
          [locale]="locale()"
          [readOnly]="isReadOnly()"
          (calendarSelectClicked)="selectCalendar()"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
        />

        @if(!isNew()) {
          <ion-card>
            <ion-card-content class="ion-no-padding">
              <ion-accordion-group value="invitees">
                @if(calevent().isOpen) {
                  <bk-attendees-accordion [calevent]="formData" [readOnly]="isReadOnly()" />
                } 
                @else {
                  <bk-invitees-accordion [calevent]="formData" [readOnly]="isReadOnly()" />
                }
                <bk-documents-accordion [parentKey]="parentKey()" [readOnly]="isReadOnly()" />
                <bk-comments-accordion [parentKey]="parentKey()" [readOnly]="isReadOnly()" />
              </ion-accordion-group>
            </ion-card-content>
          </ion-card>
        }
      }
    </ion-content>
    
  `
})
export class CalEventEditModal {
  private modalController = inject(ModalController);
  protected readonly store = inject(CalEventStore);

  // inputs
  public calevent = input.required<CalEventModel>();
  public currentUser = input.required<UserModel>();
  public types = input.required<CategoryListModel>();
  public periodicities = input.required<CategoryListModel>();
  public tags = input.required<string>();
  public tenantId = input.required<string>();
  public locale = input.required<string>();
  public readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  public initialDirty = input<boolean>(false);

  // signals
  protected formDirty = linkedSignal(() => this.initialDirty());
  protected formValid = linkedSignal(() => this.initialDirty());
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected readonly changeConfirmationI18n = computed(() => ({
    ok: this.store.i18n.changeConfirmation_ok(),
    cancel: this.store.i18n.changeConfirmation_cancel(),
    confirmation: this.store.i18n.changeConfirmation_confirmation(),
  } as ChangeConfirmationI18n));
  protected formData = linkedSignal(() => safeStructuredClone(this.calevent()));
  protected showForm = signal(true);

  // derived signals
  protected headerTitle = computed(() => this.store.getTitleLabel(this.isReadOnly(), this.calevent().bkey));
  protected readonly parentKey = computed(() => `${CalEventModelName}.${this.calevent().bkey}`);
  protected isNew = computed(() => !this.formData()?.bkey);

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    await this.modalController.dismiss(this.formData(), 'confirm');
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.formData.set(safeStructuredClone(this.calevent()));  // reset the form
    // This destroys and recreates the <form scVestForm> → Vest fully resets
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }

  protected onFormDataChange(formData: CalEventModel): void {
    this.formData.set(formData);
  }

  protected async selectCalendar(): Promise<void> {
    const modal = await this.modalController.create({
      component: CalendarSelectModal,
      componentProps: { currentUser: this.currentUser() },
    });
    await modal.present();
    const { data: calendarKey, role } = await modal.onDidDismiss<string>();
    if (role !== 'confirm' || !calendarKey) return;
    const current = this.formData();
    if (!current || current.calendars.includes(calendarKey)) return;
    this.formData.set({ ...current, calendars: [...current.calendars, calendarKey] });
    this.formDirty.set(true);
  }
}
