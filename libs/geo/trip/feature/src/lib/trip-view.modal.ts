import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input, resource } from '@angular/core';
import { IonButton, IonCard, IonCardContent, IonContent, IonIcon, IonItem, IonLabel, IonNote, ModalController } from '@ionic/angular';

import { AvatarInfo, PersonModelName, TripModel } from '@okr/shared-models';
import { AppStore } from '@okr/shared-feature';
import { PERSON_EDIT_MODAL, PersonEditModalLoader } from '@okr/subject-person-ui';
import { Header } from '@okr/shared-ui';
import { PrettyDatePipe, SvgIconPipe } from '@okr/shared-pipes';
import { convertDateFormatToString, DateFormat, fill, getWeekdayI18nKey, isKioskOnly } from '@okr/shared-util-core';
import { AlertService, downloadFile, resourceParams } from '@okr/shared-util-angular';
import { I18nService, TranslatePipe } from '@okr/shared-i18n';
import { AvatarDisplay } from '@okr/avatar-ui';
import { buildGpx, crewToLocalSections, gpxFileName, isShareCancel, TRACKER_I18N_KEYS, TrackerI18n } from '@okr/mobility-tracker-util';
import type { CrewTrackSection, GetLogbuchTrackRes } from '@okr/mobility-tracker-util';
import { TrackMap, TrackMapSection, TrackSectionRow, TrackSections } from '@okr/mobility-tracker-ui';
import { LogbuchTrackService } from '@okr/trip-data-access';

import { crewTrackDeadline, formatTripTime, TRIP_I18N_KEYS, TripI18n } from '@okr/trip-util';
import { GpxInfoModal } from './gpx-info.modal';

type CrewTrackOk = Extract<GetLogbuchTrackRes, { state: 'ok' }>;

/** A crew section as a row of the read-only section list: rowing figures only on a row section. */
function crewSectionRow(s: CrewTrackSection): TrackSectionRow {
  const row: TrackSectionRow = { mode: s.mode, distanceM: s.distanceM, durationS: s.durationS, detected: false };
  if (s.mode !== 'row') return row;
  return {
    ...row, splitAvgS: s.splitAvgS, splitBestS: s.splitBestS, strokes: s.strokes, strokeRateAvg: s.strokeRateAvg, strokeRateMax: s.strokeRateMax,
  };
}

/** Read-only trip representation for registered users — the counterpart of okr-calevent-view-modal. */
@Component({
  selector: 'okr-trip-view-modal',
  standalone: true,
  imports: [
    AsyncPipe, PrettyDatePipe, SvgIconPipe, TranslatePipe,
    Header, AvatarDisplay, TrackMap, TrackSections,
    IonContent, IonCard, IonCardContent, IonItem, IonLabel, IonIcon, IonButton, IonNote,
  ],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px; } }
    .view-label { font-size: 0.9rem; color: var(--ion-color-medium); margin-bottom: 2px; }
    .view-value { font-size: 1rem; margin-bottom: 8px; }
    ion-item { --padding-start: 0; --inner-padding-end: 0; }
    .participant-row { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; padding: 4px 0; }
    .participant { cursor: pointer; }
    .participant ::ng-deep ion-chip ion-label small { font-size: 1rem; }
    .crew-track-title { font-size: 1.1rem; font-weight: 600; margin: 0 0 8px; color: var(--ion-text-color); }
    okr-track-map { --okr-track-map-height: 220px; border-radius: 8px; }
    .gpx-row { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; margin-top: 8px; }
    .deadline { display: block; font-size: 0.9rem; margin-top: 4px; }
  `],
  template: `
    <okr-header [i18n]="{ title: trip().name }" [isModal]="true" />

    <ion-content class="ion-padding">
      <ion-card>
        <ion-card-content>

          <ion-item lines="none">
            <ion-icon slot="start" src="{{'calendar' | svgIcon}}" />
            <ion-label>
              <p class="view-label">{{ i18n.date() }}</p>
              <p class="view-value">{{ weekdayKey() | translate | async }}, {{ trip().startDate | prettyDate }}{{ timeRange() }}</p>
            </ion-label>
          </ion-item>

          @if(trip().resource?.name2) {
            <ion-item lines="none">
              <ion-icon slot="start" src="{{'boat' | svgIcon}}" />
              <ion-label>
                <p class="view-label">{{ i18n.boat() }}</p>
                <p class="view-value">{{ trip().resource?.name2 }}</p>
              </ion-label>
            </ion-item>
          }

          @if(trip().participants.length) {
            <ion-item lines="none">
              <ion-icon slot="start" src="{{'people' | svgIcon}}" />
              <ion-label>
                <p class="view-label">{{ i18n.participants() }}</p>
                <div class="participant-row">
                  @for(participant of participants(); track $index) {
                    <!-- tapping a crew member opens their (read-only) person modal -->
                    <div class="participant" (click)="openPerson(participant[0])">
                      <okr-avatar-display [avatars]="participant" [showName]="true" />
                    </div>
                  }
                </div>
              </ion-label>
            </ion-item>
          }

          @if(locationLabel()) {
            <ion-item lines="none">
              <ion-icon slot="start" src="{{'location' | svgIcon}}" />
              <ion-label class="ion-text-wrap">
                <p class="view-label">{{ i18n.location() }}</p>
                <p class="view-value">{{ locationLabel() }}</p>
              </ion-label>
            </ion-item>
          }

          <ion-item lines="none">
            <ion-icon slot="start" src="{{'target' | svgIcon}}" />
            <ion-label>
              <p class="view-label">{{ i18n.distance_label() }}</p>
              <p class="view-value">{{ trip().distance }} km</p>
            </ion-label>
          </ion-item>

          @if(trip().notes) {
            <ion-item lines="none">
              <ion-icon slot="start" src="{{'notes' | svgIcon}}" />
              <ion-label class="ion-text-wrap">
                <p class="view-label">{{ i18n.notes_label() }}</p>
                <p class="view-value">{{ trip().notes }}</p>
              </ion-label>
            </ion-item>
          }

        </ion-card-content>
      </ion-card>

      <!-- the crew route (spec 1.123 §5): only a crew member of a linked trip gets it; anything else shows nothing -->
      @if (crewTrack(); as ct) {
        <ion-card>
          <ion-card-content>
            <h2 class="crew-track-title">{{ i18n.track_route_title() }}</h2>
            <okr-track-map [sections]="mapSections()" [live]="false" />
            <okr-track-sections [sections]="sectionRows()" [i18n]="trackerI18n" [readonly]="true" />
            <div class="gpx-row">
              <ion-button fill="outline" (click)="downloadGpx(ct)">
                <ion-icon slot="start" src="{{'download' | svgIcon}}" />
                {{ i18n.track_gpx_download() }}
              </ion-button>
              <ion-button fill="clear" (click)="openGpxInfo()" [attr.aria-label]="i18n.track_info_title()">
                <ion-icon slot="icon-only" src="{{'info-circle' | svgIcon}}" />
              </ion-button>
            </div>
            <ion-note class="deadline">{{ deadlineNote() }}</ion-note>
          </ion-card-content>
        </ion-card>
      }
    </ion-content>
  `
})
export class TripViewModal {
  private readonly modalController = inject(ModalController);
  private readonly appStore = inject(AppStore);
  private readonly personEditModal = inject<PersonEditModalLoader | null>(PERSON_EDIT_MODAL, { optional: true });
  private readonly logbuchTrackService = inject(LogbuchTrackService);
  private readonly alertService = inject(AlertService);
  private readonly i18nService = inject(I18nService);
  protected readonly i18n = this.i18nService.translateAll(TRIP_I18N_KEYS) as TripI18n;
  protected readonly trackerI18n = this.i18nService.translateAll(TRACKER_I18N_KEYS) as TrackerI18n;

  public trip = input.required<TripModel>();

  /**
   * Ask for the crew route only when the trip has one and the viewer is on its crew (by personKey, never by role,
   * never the kiosk): everyone else makes no call at all. Value-compared, so a new currentUser reference with the
   * same person does not call again.
   */
  private readonly crewTrackParams = resourceParams(() => {
    const trip = this.trip();
    const user = this.appStore.currentUser();
    const personKey = user?.personKey;
    if (!trip.trackKey || !trip.okey || !personKey || isKioskOnly(user)) return undefined;
    if (!trip.participants.some(p => p.key === personKey)) return undefined;
    return { tenantId: this.appStore.tenantId(), tripKey: trip.okey };
  });
  private readonly crewTrackResource = resource({
    params: this.crewTrackParams,
    loader: ({ params }) => this.logbuchTrackService.get(params.tenantId, params.tripKey),
  });
  /** the route when the callable granted it; none / gone / denied / an error all render nothing */
  protected readonly crewTrack = computed<CrewTrackOk | undefined>(() => {
    if (!this.crewTrackResource.hasValue()) return undefined;
    const res = this.crewTrackResource.value();
    return res.state === 'ok' && res.sections.length > 0 ? res : undefined;
  });
  private readonly localSections = computed(() => crewToLocalSections(this.crewTrack()?.sections ?? []));
  protected readonly mapSections = computed<TrackMapSection[]>(() => this.localSections().map(s => ({ mode: s.mode, points: s.points })));
  protected readonly sectionRows = computed(() => (this.crewTrack()?.sections ?? []).map(crewSectionRow));
  /** «Verfügbar bis …»: the callable's deadline, else the trip's own; an open trip has none yet */
  protected readonly deadlineNote = computed(() => {
    const deadline = this.crewTrack()?.deadline || crewTrackDeadline(this.trip());
    if (!deadline) return this.i18n.track_deadline_open();
    return fill(this.i18n.track_deadline_date(), { date: convertDateFormatToString(deadline, DateFormat.StoreDate, DateFormat.ViewDate, false) });
  });

  protected async downloadGpx(track: CrewTrackOk): Promise<void> {
    const url = URL.createObjectURL(new Blob([buildGpx(track.name, this.localSections())], { type: 'application/gpx+xml' }));
    try {
      await downloadFile(url, gpxFileName(track.name));
    } catch (error) {
      if (isShareCancel(error)) return; // the share sheet was just closed
      console.error('TripViewModal.downloadGpx', error);
      await this.alertService.showToast(this.i18n.track_gpx_error());
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  protected async openGpxInfo(): Promise<void> {
    const modal = await this.modalController.create({ component: GpxInfoModal });
    await modal.present();
  }

  protected readonly weekdayKey = computed(() => getWeekdayI18nKey(this.trip().startDate, false));
  /** one single-element array per person, so each avatar is rendered with its name on its own line */
  protected readonly participants = computed(() => this.trip().participants.map(p => [p]));
  protected readonly locationLabel = computed(() => {
    const t = this.trip();
    return t.locations.map(l => l.name2 || l.name1).filter(Boolean).join(' – ') || t.customLocationLabel;
  });
  /**
   * Opens the tapped crew member in the person modal, always read-only: this view is the one the
   * whole club sees, and it must not become a back door into editing someone else's record.
   */
  protected async openPerson(participant?: AvatarInfo): Promise<void> {
    if (participant?.modelType !== PersonModelName || !this.personEditModal) return;
    const person = this.appStore.getPerson(participant.key);
    if (!person) return;
    const PersonEditModal = await this.personEditModal();
    const modal = await this.modalController.create({
      component: PersonEditModal,
      componentProps: {
        person,
        currentUser: this.appStore.currentUser(),
        tagModel: PersonModelName,
        tenantId: this.appStore.tenantId(),
        genders: this.appStore.getCategory('gender'),
        readOnly: true,
      },
    });
    await modal.present();
    await modal.onDidDismiss();
  }

  protected readonly timeRange = computed(() => {
    const t = this.trip();
    const start = formatTripTime(t.startTime);
    if (!start) return '';
    const end = formatTripTime(t.endTime);
    return end ? `, ${start} - ${end}` : `, ${start}`;
  });
}
