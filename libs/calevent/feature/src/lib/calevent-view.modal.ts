import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { IonAccordionGroup, IonCard, IonCardContent, IonContent, IonIcon, IonItem, IonLabel, ModalController } from '@ionic/angular/standalone';

import { CalEventModel, CalEventModelName, CategoryListModel, UserModel } from '@bk2/shared-models';
import { HeaderComponent } from '@bk2/shared-ui';
import { TranslatePipe } from '@bk2/shared-i18n';
import { PartPipe, SvgIconPipe } from '@bk2/shared-pipes';
import { convertDateFormatToString, DateFormat, getCatAbbreviation, getWeekdayI18nKey } from '@bk2/shared-util-core';
import { addTime } from '@bk2/shared-util-core';

import { InviteesAccordionComponent } from '@bk2/relationship-invitation-feature';
import { DocumentsAccordionComponent } from '@bk2/document-feature';
import { CommentsAccordionComponent } from '@bk2/comment-feature';
import { AttendeesAccordionComponent } from './attendees-accordion';
import { AvatarDisplayComponent } from '@bk2/avatar-ui';

function storeToView(d: string): string {
  return convertDateFormatToString(d, DateFormat.StoreDate, DateFormat.ViewDate, false);
}

@Component({
  selector: 'bk-calevent-view-modal',
  standalone: true,
  imports: [
    AsyncPipe, TranslatePipe, PartPipe, SvgIconPipe,
    HeaderComponent, AvatarDisplayComponent,
    InviteesAccordionComponent, DocumentsAccordionComponent,
    CommentsAccordionComponent, AttendeesAccordionComponent,
    IonContent, IonCard, IonCardContent, IonAccordionGroup,
    IonItem, IonLabel, IonIcon,
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
                <p class="view-label">{{ '@calevent.field.date' | translate | async }}</p>
                <p class="view-value">{{ dateLabel() }}</p>
                </ion-label>
            </ion-item>

            <!-- Repeating series -->
            @if(periodicityLabel()) {
                <ion-item lines="none">
                <ion-icon slot="start" src="{{'repeat' | svgIcon}}" />
                <ion-label>
                    <p class="view-label">{{ '@calevent.field.periodicity' | translate | async }}</p>
                    <p class="view-value">{{ periodicityLabel() | translate | async }} {{ until() }}</p>
                </ion-label>
                </ion-item>
            }

            <!-- Location -->
            @if(calevent().locationKey) {
                <ion-item lines="none">
                <ion-icon slot="start" src="{{'location' | svgIcon}}" />
                <ion-label>
                    <p class="view-label">{{ '@calevent.field.location' | translate | async }}</p>
                    <p class="view-value">{{ calevent().locationKey | part:true }}</p>
                </ion-label>
                </ion-item>
            }

            <!-- Responsible persons -->
            @if(calevent().responsiblePersons.length) {
                <ion-item lines="none">
                <ion-icon slot="start" src="{{'person' | svgIcon}}" />
                <ion-label>
                    <p class="view-label">{{ '@calevent.field.responsiblePersons' | translate | async }}</p>
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
                    <p class="view-label">{{ '@calevent.field.description' | translate | async }}</p>
                    <p class="view-value">{{ calevent().description }}</p>
                </ion-label>
                </ion-item>
            }

            <!-- URL -->
            @if(calevent().url) {
                <ion-item lines="none" [href]="calevent().url" target="_blank">
                <ion-icon slot="start" src="{{'link' | svgIcon}}" />
                <ion-label>
                    <p class="view-label">{{ '@calevent.field.url' | translate | async }}</p>
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

  // inputs (keep signature identical so all callers continue to work unchanged)
  public calevent = input.required<CalEventModel>();
  public periodicities = input.required<CategoryListModel>();
  public locale = input.required<string>();

  protected readonly parentKey = computed(() => `${CalEventModelName}.${this.calevent().bkey}`);
  protected readonly label = computed(() => `@calevent.periodicity.${this.periodicityLabel()}.label`);

  /** Human-readable date/time line. */
  protected readonly dateLabel = computed((): string => {
    const e = this.calevent();
    // Resolve weekday abbreviation from de.json via a simple inline map
    // (avoids async pipe in computed — weekday is fixed per locale)
    const wd = this.weekdayAbbr(e.startDate);
    const startView = storeToView(e.startDate);

    if (e.fullDay) {
      const endView = e.endDate && e.endDate !== e.startDate ? ` - ${storeToView(e.endDate)}` : '';
      return `${wd} ${startView}${endView}`;
    }

    const endTime = addTime(e.startTime, 0, e.durationMinutes);
    const timeRange = e.startTime ? ` ${e.startTime} - ${endTime}` : '';
    return `${wd} ${startView}${timeRange}`;
  });

  /** "periodicity bis dd.mm.yyyy" — only when the event is part of a series. */
  protected readonly periodicityLabel = computed((): string => {
    const e = this.calevent();
    if (!e.periodicity || e.periodicity === 'once' || e.periodicity === '') return '';
    return `@calevent.periodicity.${e.periodicity}.label`;
  });

  protected readonly until = computed(() => this.calevent().repeatUntilDate ? ` bis ${storeToView(this.calevent().repeatUntilDate)}` : '');

  /** German weekday abbreviations inline — avoids async pipe dependency. */
  private weekdayAbbr(storeDate: string): string {
    const key = getWeekdayI18nKey(storeDate, true);
    const map: Record<string, string> = {
      'calevent.weekDayAbbreviation.monday':    'Mo',
      'calevent.weekDayAbbreviation.tuesday':   'Di',
      'calevent.weekDayAbbreviation.wednesday': 'Mi',
      'calevent.weekDayAbbreviation.thursday':  'Do',
      'calevent.weekDayAbbreviation.friday':    'Fr',
      'calevent.weekDayAbbreviation.saturday':  'Sa',
      'calevent.weekDayAbbreviation.sunday':    'So',
    };
    return map[key] ?? '';
  }

  public async cancel(): Promise<void> {
    await this.modalController.dismiss(null, 'cancel');
  }

  public async save(): Promise<void> {
    await this.modalController.dismiss(this.calevent(), 'confirm');
  }
}
