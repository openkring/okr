import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController, IonCardContent, IonCard, IonAccordionGroup } from '@ionic/angular/standalone';

import { CalEventModel, CalEventModelName, CategoryListModel, UserModel } from '@okr/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { coerceBoolean, safeStructuredClone } from '@okr/shared-util-core';
import { CalendarSelectModal } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';

import { CalEventForm } from '@okr/calevent-ui';
import { InviteesAccordion } from '@okr/relationship-invitation-feature';
import { DocumentsAccordion } from '@okr/document-feature';
import { CommentsAccordion } from '@okr/comment-feature';
import { CALEVENT_I18N_KEYS, CaleventI18n } from '@okr/calevent-util';

import { AttendeesAccordion } from './attendees-accordion';

@Component({
  selector: 'okr-calevent-edit-modal',
  standalone: true,
  imports: [
    Header, ChangeConfirmation,
    CalEventForm, InviteesAccordion, DocumentsAccordion,
    CommentsAccordion, AttendeesAccordion,
    IonContent, IonCard, IonCardContent, IonAccordionGroup
],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    <okr-header [i18n]="{ title: headerTitle() }" [isModal]="true" />
    @if(showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if(formData(); as formData) {
        <okr-calevent-form
          [formData]="formData"
          (formDataChange)="onFormDataChange($event)"
          [i18n]="i18n"
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
                  <okr-attendees-accordion [calevent]="formData" [currentUser]="currentUser()" [tenantId]="tenantId()" [readOnly]="isReadOnly()" />
                } 
                @else {
                  <okr-invitees-accordion [calevent]="formData" [readOnly]="isReadOnly()" />
                }
                <!-- documents: organiser/admin only; commenting is open to every registered user -->
                <okr-documents-accordion [parentKey]="parentKey()" [readOnly]="isReadOnly()" />
                <okr-comments-accordion [parentKey]="parentKey()" [readOnly]="false" />
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
  protected readonly i18n = inject(I18nService).translateAll(CALEVENT_I18N_KEYS) as CaleventI18n;

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
  protected readonly changeConfirmationI18n = computed(() => ({ cancel: this.i18n.cancel(), save: this.i18n.save()} as ChangeConfirmationI18n));
  protected formData = linkedSignal(() => safeStructuredClone(this.calevent()));
  protected showForm = signal(true);

  // derived signals
  protected headerTitle = computed(() => {
    if (this.isReadOnly()) return this.i18n.view();
    const key = this.calevent().okey;
    return (key && key.length > 0) ? this.i18n.update() : this.i18n.create();
  });
  protected readonly parentKey = computed(() => `${CalEventModelName}.${this.calevent().okey}`);
  protected isNew = computed(() => !this.formData()?.okey);

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
