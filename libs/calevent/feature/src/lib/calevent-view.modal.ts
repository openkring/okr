import { Component, computed, inject, input } from '@angular/core';
import { IonAccordionGroup, IonCard, IonCardContent, IonContent, IonIcon, IonItem, IonLabel, ModalController } from '@ionic/angular/standalone';

import { CalEventModel, CalEventModelName, CategoryListModel } from '@okr/shared-models';
import { Header } from '@okr/shared-ui';
import { PartPipe, SvgIconPipe } from '@okr/shared-pipes';
import { addTime, convertDateFormatToString, DateFormat, getWeekdayI18nKey, hasRole } from '@okr/shared-util-core';
import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';

import { InviteesAccordion } from '@okr/relationship-invitation-feature';
import { DocumentsAccordion } from '@okr/content-document-feature';
import { CommentsAccordion } from '@okr/comment-feature';
import { AvatarDisplay } from '@okr/avatar-ui';

import { CALEVENT_I18N_KEYS, CaleventI18n } from '@okr/calevent-util';
import { dismissOverlay } from '@okr/shared-util-angular';

import { AttendeesAccordion } from './attendees-accordion';

function storeToView(d: string): string {
  return convertDateFormatToString(d, DateFormat.StoreDate, DateFormat.ViewDate, false);
}

@Component({
  selector: 'okr-calevent-view-modal',
  standalone: true,
  imports: [
    PartPipe, SvgIconPipe,
    Header, AvatarDisplay, InviteesAccordion, DocumentsAccordion, CommentsAccordion, AttendeesAccordion,
    IonContent, IonCard, IonCardContent, IonAccordionGroup, IonItem, IonLabel, IonIcon,
  ],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px; } }
    .view-label { font-size: 0.9rem; color: var(--ion-color-medium); margin-bottom: 2px; }
    .view-value { font-size: 1rem; margin-bottom: 8px; }
    ion-item { --padding-start: 0; --inner-padding-end: 0; }
    .responsible-row { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; padding: 4px 0; }
    .responsible-name { font-size: 0.9rem; }
    ion-card.cancel-banner { background: var(--ion-color-danger); color: var(--ion-color-danger-contrast); }
    .cancel-title { font-weight: 600; margin: 0 0 4px; }
    .cancel-message { margin: 0; white-space: pre-wrap; }
    ion-card.lock-banner { background: var(--ion-color-warning); color: var(--ion-color-warning-contrast); }
    .lock-banner ion-card-content { display: flex; align-items: center; gap: 10px; }
    .lock-banner ion-icon { font-size: 20px; flex: 0 0 auto; }
    .lock-title { font-weight: 600; margin: 0; }
  `],
  template: `
    <okr-header [i18n]="{ title: calevent().name }" [isModal]="true" />

    <ion-content class="ion-padding">
      @if(calevent().isLocked) {
        <ion-card class="lock-banner">
          <ion-card-content>
            <ion-icon src="{{ 'lock-closed' | svgIcon }}" />
            <p class="lock-title">{{ i18n.locked_banner() }}</p>
          </ion-card-content>
        </ion-card>
      }
      @if(calevent().state === 'cancelled') {
        <ion-card class="cancel-banner">
          <ion-card-content>
            <p class="cancel-title">{{ i18n.cancel_event_banner() }}</p>
            <p class="cancel-message">{{ calevent().cancelMessage }}</p>
          </ion-card-content>
        </ion-card>
      }
      <ion-card>
        <ion-card-content>

            <!-- Date / time line -->
            <ion-item lines="none">
                <ion-icon slot="start" src="{{'calendar' | svgIcon}}" />
                <ion-label>
                <p class="view-label">{{ i18n.date() }}</p>
                <p class="view-value">{{ dateLabel() }}</p>
                </ion-label>
            </ion-item>

            <!-- Repeating series -->
            @if(periodicityLabel()) {
                <ion-item lines="none">
                <ion-icon slot="start" src="{{'repeat' | svgIcon}}" />
                <ion-label>
                    <p class="view-label">{{ i18n.periodicity_name() }}</p>
                    <p class="view-value">{{ periodicityLabel() }} {{ until() }}</p>
                </ion-label>
                </ion-item>
            }

            <!-- Location -->
            @if(calevent().locationKey) {
                <ion-item lines="none">
                <ion-icon slot="start" src="{{'location' | svgIcon}}" />
                <ion-label>
                    <p class="view-label">{{ i18n.location() }}</p>
                    <p class="view-value">{{ calevent().locationKey | part:true }}</p>
                </ion-label>
                </ion-item>
            }

            <!-- Responsible persons -->
            @if(calevent().responsiblePersons.length) {
                <ion-item lines="none">
                <ion-icon slot="start" src="{{'person' | svgIcon}}" />
                <ion-label>
                    <p class="view-label">{{ i18n.responsible() }}</p>
                    <div class="responsible-row">
                      @for(person of responsiblePersons(); track $index) {
                        <okr-avatar-display [avatars]="person" [showName]="true" />
                      }
                    </div>
                </ion-label>
                </ion-item>
            }

            <!-- Description / notes: internal data, not shown to plain registered users -->
            @if(calevent().description && expertMode()) {
                <ion-item lines="none">
                <ion-icon slot="start" src="{{'text' | svgIcon}}" />
                <ion-label class="ion-text-wrap">
                    <p class="view-label">{{ i18n.description() }}</p>
                    <p class="view-value">{{ calevent().description }}</p>
                </ion-label>
                </ion-item>
            }

            <!-- URL -->
            @if(calevent().url) {
                <ion-item lines="none" [href]="calevent().url" target="_blank" rel="noopener noreferrer">
                <ion-icon slot="start" src="{{'link' | svgIcon}}" />
                <ion-label>
                    <p class="view-label">{{ i18n.url() }}</p>
                    <p class="view-value">{{ urlLabel() }}</p>
                </ion-label>
                </ion-item>
            }

        </ion-card-content>
      </ion-card>

      <!-- Accordions -->
      @if(calevent().okey) {
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <!-- the invitees/attendees accordion is the one the user came for; documents stay collapsed -->
            <ion-accordion-group value="invitees">
              @if(calevent().isOpen) {
                <okr-attendees-accordion [calevent]="calevent()" [readOnly]="true" />
              } @else {
                <okr-invitees-accordion [calevent]="calevent()" [readOnly]="true" />
              }
              <!-- documents: only the organiser (edit modal) may add/delete; commenting is open to every registered user -->
              <okr-documents-accordion [parentKey]="parentKey()" [readOnly]="true" />
              <okr-comments-accordion [parentKey]="parentKey()" [readOnly]="false" />
            </ion-accordion-group>
          </ion-card-content>
        </ion-card>
      }

    </ion-content>
  `
})
export class CalEventViewModal {
  private readonly modalController = inject(ModalController);
  private readonly appStore = inject(AppStore);
  protected readonly i18n = inject(I18nService).translateAll(CALEVENT_I18N_KEYS) as CaleventI18n;

  // inputs (keep signature identical so all callers continue to work unchanged)
  public calevent = input.required<CalEventModel>();
  public periodicities = input.required<CategoryListModel>();
  public locale = input.required<string>();

  protected readonly parentKey = computed(() => `${CalEventModelName}.${this.calevent().okey}`);
  /** one single-element array per person, so each avatar is rendered with its name on its own line */
  protected readonly responsiblePersons = computed(() => this.calevent().responsiblePersons.map(p => [p]));
  /** the link text: the label if set, else the raw url */
  protected readonly urlLabel = computed(() => this.calevent().urlLabel || this.calevent().url);
  protected readonly expertMode = computed(() => hasRole('admin', this.appStore.currentUser()));

  private get wdAbbr() {
    return {
      monday:    this.i18n.wda_monday,
      tuesday:   this.i18n.wda_tuesday,
      wednesday: this.i18n.wda_wednesday,
      thursday:  this.i18n.wda_thursday,
      friday:    this.i18n.wda_friday,
      saturday:  this.i18n.wda_saturday,
      sunday:    this.i18n.wda_sunday,
    };
  }

  private get periodicity() {
    return {
      daily:     this.i18n.periodicity_daily,
      workdays:  this.i18n.periodicity_workdays,
      weekly:    this.i18n.periodicity_weekly,
      biweekly:  this.i18n.periodicity_biweekly,
      monthly:   this.i18n.periodicity_monthly,
      quarterly: this.i18n.periodicity_quarterly,
      yearly:    this.i18n.periodicity_yearly,
    };
  }

  /** Human-readable date/time line. */
  protected readonly dateLabel = computed((): string => {
    const e = this.calevent();
    const i18nKey = getWeekdayI18nKey(e.startDate, true);
    const day = i18nKey.split('.').pop() ?? '';
    const wdMap = this.wdAbbr;
    const wd = (wdMap as Record<string, () => string>)[day]?.() ?? '';
    const startView = storeToView(e.startDate);

    if (e.fullDay) {
      const endView = e.endDate && e.endDate !== e.startDate ? ` - ${storeToView(e.endDate)}` : '';
      return `${wd} ${startView}${endView}`;
    }

    const endTime = addTime(e.startTime, 0, e.durationMinutes);
    const timeRange = e.startTime ? ` ${e.startTime} - ${endTime}` : '';
    return `${wd} ${startView}${timeRange}`;
  });

  /** Translated periodicity label — empty when the event is not part of a series. */
  protected readonly periodicityLabel = computed((): string => {
    const e = this.calevent();
    if (!e.periodicity || e.periodicity === 'once' || e.periodicity === '') return '';
    const periodicityMap = this.periodicity;
    return (periodicityMap as Record<string, () => string>)[e.periodicity]?.() ?? '';
  });

  protected readonly until = computed(() => this.calevent().repeatUntilDate ? ` bis ${storeToView(this.calevent().repeatUntilDate)}` : '');

  public async cancel(): Promise<void> {
    await dismissOverlay(this.modalController, null, 'cancel');
  }

  public async save(): Promise<void> {
    await dismissOverlay(this.modalController, this.calevent(), 'confirm');
  }
}
