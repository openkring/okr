import { Component, computed, input, output } from '@angular/core';
import { IonButton, IonCard, IonCardContent, IonIcon, IonItem, IonLabel } from '@ionic/angular';

import { SvgIconPipe } from '@okr/shared-pipes';
import { convertDateFormatToString, DateFormat, fill, getAge } from '@okr/shared-util-core';
import { applicationMailtoHref, applicationTelHref, ApplicationTaskInfo, TaskI18n } from '@okr/project-task-util';

/**
 * The applicant of an Anmeldung task, instead of the raw submission JSON: name, type, date of birth
 * with age and contact, plus «Per E-Mail antworten» (prefilled mail), «Anrufen» and «Anmeldung ändern».
 * Presentational: mail and phone are plain links, the edit is the parent's job (editClicked).
 */
@Component({
  selector: 'okr-application-task-card',
  standalone: true,
  imports: [SvgIconPipe, IonCard, IonCardContent, IonItem, IonLabel, IonIcon, IonButton],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px; } }
    .actions { display: flex; flex-wrap: wrap; gap: 4px; padding: 0 8px 8px; }
    ion-label h2 { font-size: 1.25rem; font-weight: 600; }
  `],
  template: `
    <ion-card>
      <ion-card-content class="ion-no-padding">
        <ion-item lines="none">
          <ion-icon slot="start" src="{{ 'person' | svgIcon }}" />
          <ion-label class="ion-text-wrap">
            <p>{{ title() }}</p>
            <h2>{{ fullName() }}</h2>
            @if (bornLine()) { <p>{{ bornLine() }}</p> }
          </ion-label>
        </ion-item>
        @if (info().email || info().phone) {
          <ion-item lines="none">
            <ion-label class="ion-text-wrap">
              @if (info().email) { <p>{{ info().email }}</p> }
              @if (info().phone) { <p>{{ info().phone }}</p> }
            </ion-label>
          </ion-item>
        }
        @if (info().parentEmail || info().parentPhone) {
          <ion-item lines="none">
            <ion-label class="ion-text-wrap">
              <p>{{ i18n().application_parent() }}</p>
              @if (info().parentEmail) { <p>{{ info().parentEmail }}</p> }
              @if (info().parentPhone) { <p>{{ info().parentPhone }}</p> }
            </ion-label>
          </ion-item>
        }
        <div class="actions">
          @if (mailHref()) {
            <ion-button fill="outline" size="small" [href]="mailHref()">
              <ion-icon slot="start" src="{{ 'email' | svgIcon }}" />
              {{ i18n().application_mail() }}
            </ion-button>
          }
          @if (telHref()) {
            <ion-button fill="outline" size="small" [href]="telHref()">
              <ion-icon slot="start" src="{{ 'tel' | svgIcon }}" />
              {{ i18n().application_call() }}
            </ion-button>
          }
          @if (canEdit()) {
            <ion-button fill="outline" size="small" (click)="editClicked.emit(info().submissionId)">
              <ion-icon slot="start" src="{{ 'edit' | svgIcon }}" />
              {{ i18n().application_edit() }}
            </ion-button>
          }
        </div>
      </ion-card-content>
    </ion-card>
  `,
})
export class ApplicationTaskCard {
  public readonly info = input.required<ApplicationTaskInfo>();
  public readonly i18n = input.required<TaskI18n>();
  /** signs the prefilled answer mail */
  public readonly senderName = input('');
  /** `applications` is privileged-only: the edit button is offered only to whom may read it */
  public readonly canEdit = input(false);

  public readonly editClicked = output<string>();   // the application okey

  protected readonly fullName = computed(() => `${this.info().firstName} ${this.info().lastName}`.trim());

  protected readonly title = computed(() => {
    const i18n = this.i18n();
    const kind = this.info().applicationAs;
    const kindLabel = kind === 'youth' ? i18n.application_kind_youth()
      : kind === 'adult' ? i18n.application_kind_adult()
      : kind === 'transfer' ? i18n.application_kind_transfer() : '';
    return [i18n.application_title(), kindLabel].filter(Boolean).join(' · ');
  });

  protected readonly bornLine = computed(() => {
    const dob = this.info().dateOfBirth;
    if (!dob) return '';
    const date = convertDateFormatToString(dob, DateFormat.StoreDate, DateFormat.ViewDate, false);
    const age = getAge(dob);
    if (!date) return '';
    return age < 0 ? date : fill(this.i18n().application_born(), { date, age });
  });

  protected readonly mailHref = computed(() => {
    const info = this.info();
    const body = fill(this.i18n().application_mail_body(), { firstName: info.firstName, senderName: this.senderName() }).trim();
    return applicationMailtoHref(info, this.i18n().application_mail_subject(), body);
  });

  protected readonly telHref = computed(() => applicationTelHref(this.info()));
}
