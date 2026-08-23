import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController, IonCardContent, IonCard, IonAccordionGroup, IonIcon } from '@ionic/angular/standalone';

import { CalEventModel, CalEventModelName, CategoryListModel, LocationModel, UserModel } from '@okr/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { SvgIconPipe } from '@okr/shared-pipes';
import { coerceBoolean, safeStructuredClone } from '@okr/shared-util-core';
import { CalendarSelectModal } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';

import { CalEventForm } from '@okr/calevent-ui';
import { InviteesAccordion } from '@okr/relationship-invitation-feature';
import { DocumentsAccordion } from '@okr/content-document-feature';
import { CommentsAccordion } from '@okr/comment-feature';
import { CALEVENT_I18N_KEYS, CaleventI18n, isPersonalCalevent } from '@okr/calevent-util';
import { dismissOverlay } from '@okr/shared-util-angular';

import { AttendeesAccordion } from './attendees-accordion';

@Component({
  selector: 'okr-calevent-edit-modal',
  standalone: true,
  imports: [
    Header, ChangeConfirmation, SvgIconPipe,
    CalEventForm, InviteesAccordion, DocumentsAccordion,
    CommentsAccordion, AttendeesAccordion,
    IonContent, IonCard, IonCardContent, IonAccordionGroup, IonIcon
],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px;} }
    ion-card.personal-hint {
      --background: var(--ion-color-warning-tint, #ffd534);
      --color: var(--ion-color-warning-contrast, #000);
    }
    ion-card.personal-hint ion-card-content {
      display: flex;
      gap: 10px;
      align-items: flex-start;
      font-size: 14px;
      line-height: 1.45;
    }
    ion-card.personal-hint ion-icon { font-size: 20px; flex: 0 0 auto; margin-top: 1px; }
  `],
  template: `
    <okr-header [i18n]="{ title: headerTitle() }" [isModal]="true" />
    @if(showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if(isNewPersonal()) {
        <!-- a personal event is invisible to everyone but its organiser and invitees; say so up
             front, before the user fills in a form expecting series/chat/documents -->
        <ion-card class="personal-hint">
          <ion-card-content>
            <ion-icon src="{{ 'info-circle' | svgIcon }}" />
            <span>{{ i18n.create_personal_hint() }}</span>
          </ion-card-content>
        </ion-card>
      }
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
          [locations]="locations()"
          [readOnly]="isReadOnly()"
          (calendarSelectClicked)="selectCalendar()"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
        />

        @if(!isNew()) {
          <ion-card>
            <ion-card-content class="ion-no-padding">
              <ion-accordion-group value="invitees">
                <!-- open event: attendance is self-service (attendees list).
                     closed event: attendance comes from invitations only. -->
                @if(calevent().isOpen) {
                  <okr-attendees-accordion [calevent]="formData" [currentUser]="currentUser()" [tenantId]="tenantId()" [readOnly]="isReadOnly()" />
                } @else {
                  <okr-invitees-accordion [calevent]="formData" [readOnly]="isReadOnly()" />
                }
                <!-- documents: organiser/admin only, and not supported on personal events;
                     commenting is open to every registered user -->
                @if(!isPersonal()) {
                  <okr-documents-accordion [parentKey]="parentKey()" [readOnly]="isReadOnly()" />
                }
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
  public locations = input<LocationModel[]>([]);
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
    if (key && key.length > 0) return this.i18n.update();
    return this.isPersonal() ? this.i18n.create_personal() : this.i18n.create();
  });
  /** A brand-new personal event — the only case that gets the explanatory banner. */
  protected isNewPersonal = computed(() => this.isNew() && this.isPersonal() && !this.isReadOnly());
  protected readonly parentKey = computed(() => `${CalEventModelName}.${this.calevent().okey}`);
  protected isNew = computed(() => !this.formData()?.okey);
  protected isPersonal = computed(() => isPersonalCalevent(this.calevent()));

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    await dismissOverlay(this.modalController, this.formData(), 'confirm');
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
