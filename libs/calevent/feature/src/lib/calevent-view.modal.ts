import { Component, computed, inject, input } from '@angular/core';
import { IonAccordionGroup, IonCard, IonCardContent, IonContent, IonIcon, IonItem, IonLabel, ModalController } from '@ionic/angular/standalone';

import { CalEventModel, CalEventModelName, CategoryListModel } from '@bk2/shared-models';
import { Header } from '@bk2/shared-ui';
import { PartPipe, SvgIconPipe } from '@bk2/shared-pipes';
import { convertDateFormatToString, DateFormat, getWeekdayI18nKey } from '@bk2/shared-util-core';
import { addTime } from '@bk2/shared-util-core';

import { InviteesAccordion } from '@bk2/relationship-invitation-feature';
import { DocumentsAccordion } from '@bk2/document-feature';
import { CommentsAccordion } from '@bk2/comment-feature';
import { AvatarDisplay } from '@bk2/avatar-ui';

import { AttendeesAccordion } from './attendees-accordion';
import { CalEventStore } from './calevent.store';

function storeToView(d: string): string {
  return convertDateFormatToString(d, DateFormat.StoreDate, DateFormat.ViewDate, false);
}

@Component({
  selector: 'bk-calevent-view-modal',
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
    .responsible-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 4px 0; }
    .responsible-name { font-size: 0.9rem; }
  `],
  template: `
    <bk-header [title]="calevent().name" [isModal]="true" />

    <ion-content class="ion-padding">    
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
                    <p class="view-label">{{ i18n.periodicity_label() }}</p>
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
                      <bk-avatar-display [avatars]="calevent().responsiblePersons" [showName]="true" />
                    </div>
                </ion-label>
                </ion-item>
            }

            <!-- Description / notes -->
            @if(calevent().description) {
                <ion-item lines="none">
                <ion-icon slot="start" src="{{'notes' | svgIcon}}" />
                <ion-label class="ion-text-wrap">
                    <p class="view-label">{{ i18n.description() }}</p>
                    <p class="view-value">{{ calevent().description }}</p>
                </ion-label>
                </ion-item>
            }

            <!-- URL -->
            @if(calevent().url) {
                <ion-item lines="none" [href]="calevent().url" target="_blank">
                <ion-icon slot="start" src="{{'link' | svgIcon}}" />
                <ion-label>
                    <p class="view-label">{{ i18n.url() }}</p>
                    <p class="view-value">{{ calevent().url }}</p>
                </ion-label>
                </ion-item>
            }

        </ion-card-content>
      </ion-card>

      <!-- Accordions -->
      @if(calevent().bkey) {
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-accordion-group value="documents">
              @if(calevent().isOpen) {
                <bk-attendees-accordion [calevent]="calevent()" [readOnly]="true" />
              } @else {
                <bk-invitees-accordion [calevent]="calevent()" [readOnly]="true" />
              }
              <bk-documents-accordion [parentKey]="parentKey()" [readOnly]="true" />
              <bk-comments-accordion [parentKey]="parentKey()" [readOnly]="true" />
            </ion-accordion-group>
          </ion-card-content>
        </ion-card>
      }

    </ion-content>
  `
})
export class CalEventViewModal {
  private readonly modalController = inject(ModalController);
  protected readonly store = inject(CalEventStore);

  // inputs (keep signature identical so all callers continue to work unchanged)
  public calevent = input.required<CalEventModel>();
  public periodicities = input.required<CategoryListModel>();
  public locale = input.required<string>();

  protected readonly parentKey = computed(() => `${CalEventModelName}.${this.calevent().bkey}`);

  protected get i18n() { return this.store.i18n; }

  private get wdAbbr() {
    return {
      monday:    this.store.i18n.wd_monday,
      tuesday:   this.store.i18n.wd_tuesday,
      wednesday: this.store.i18n.wd_wednesday,
      thursday:  this.store.i18n.wd_thursday,
      friday:    this.store.i18n.wd_friday,
      saturday:  this.store.i18n.wd_saturday,
      sunday:    this.store.i18n.wd_sunday,
    };
  }

  private get periodicity() {
    return {
      daily:     this.store.i18n.periodicity_daily,
      workday:   this.store.i18n.periodicity_workday,
      weekly:    this.store.i18n.periodicity_weekly,
      biweekly:  this.store.i18n.periodicity_biweekly,
      monthly:   this.store.i18n.periodicity_monthly,
      quarterly: this.store.i18n.periodicity_quarterly,
      yearly:    this.store.i18n.periodicity_yearly,
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
    await this.modalController.dismiss(null, 'cancel');
  }

  public async save(): Promise<void> {
    await this.modalController.dismiss(this.calevent(), 'confirm');
  }
}
