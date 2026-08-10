import { Component, computed, effect, input, linkedSignal, model, output } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonAvatar, IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonIcon, IonImg, IonItem, IonLabel, IonList, IonRow } from '@ionic/angular/standalone';

import { AvatarInfo, CategoryItemModel, CategoryListModel, LocationModel, ResourceModel, RoleName, TripModel, UserModel } from '@okr/shared-models';
import { NotesInput, NotesInputI18n, NumberInput, NumberInputI18n } from '@okr/shared-ui';
import { debugFormModel, getAvatarName, getDurationLabel, hasRole } from '@okr/shared-util-core';
import { validateVestTree } from '@okr/shared-util-angular';
import { DEFAULT_NOTES } from '@okr/shared-constants';
import { SvgIconPipe } from '@okr/shared-pipes';

import { Avatars, AvatarPipe } from '@okr/avatar-ui';
import { formatTripTime, MAX_TRIP_DISTANCE_KM, TripI18n, tripValidationSuite } from '@okr/trip-util';


@Component({
  selector: 'okr-trip-edit-form',
  standalone: true,
  imports: [
    SvgIconPipe, AvatarPipe,
    IonItem, IonLabel, IonGrid, IonRow, IonCol, IonIcon, IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonButton,
    IonList, IonAvatar, IonImg,
    NotesInput, Avatars, NumberInput
  ],
  styles: [`
    ion-thumbnail { width: 30px; height: 30px; }
    ion-avatar { width: 30px; height: 30px; }
    ion-card-header { padding: 0; }
    .title { font-size: 1.25rem; font-weight: 500; margin-left: 0; }
  `],
  template: `
    <form novalidate>

      <ion-card>
        <ion-card-content class="ion-no-padding">
          <ion-grid>
            <ion-row>
              <ion-col size="6">
                <ion-item lines="none">
                  <ion-label>{{ i18n().date() }}</ion-label>
                </ion-item>
              </ion-col>
              <ion-col size="6">
                <ion-item lines="none">
                  <ion-label>{{ duration() }}</ion-label>
                </ion-item>
              </ion-col>
            </ion-row>

            <!-- boat -->
            <ion-row>
              <ion-col size="6">
                <ion-item lines="none">
                  <ion-label>{{ i18n().boat() }}</ion-label>
                </ion-item>
              </ion-col>
              <ion-col size="6">
                <ion-item lines="none">
                  @if(formData().resource; as boat) {
                    <ion-icon slot="start" src="{{ getIcon(boat) | svgIcon }}" />
                    <ion-label>{{ boat.name2 }}</ion-label>
                    @if(!isReadOnly()) {
                      <ion-icon slot="end" src="{{'cancel-circle' | svgIcon }}" (click)="clearBoat()" />
                    }
                  } @else if(!isReadOnly()) {
                    <ion-button size="large" (click)="boatSelectClicked.emit()">
                      <ion-icon slot="start" src="{{'boat' | svgIcon }}" />
                      {{ i18n().select_boat_add() }}
                    </ion-button>
                  }
                </ion-item>
              </ion-col>
            </ion-row>

            <!-- location -->
            <ion-row>
              <ion-col size="6">
                <ion-item lines="none">
                  <ion-label>{{ i18n().location() }}</ion-label>
                </ion-item>
              </ion-col>
              <ion-col size="6">
                <ion-item lines="none">
                  @if(formData().locations.length > 0) {
                    <ion-label>{{ formData().locations[0]?.name2 }}</ion-label>
                    @if(!isReadOnly()) {
                      <ion-icon slot="end" src="{{'cancel-circle' | svgIcon }}" (click)="clearLocation()" />
                    }
                  } @else if(formData().customLocationLabel) {
                    <ion-label>{{ formData().customLocationLabel }}</ion-label>
                    @if(!isReadOnly()) {
                      <ion-icon slot="end" src="{{'cancel-circle' | svgIcon }}" (click)="clearLocation()" />
                    }
                  } @else if(!isReadOnly()) {
                    <ion-button size="large" (click)="locationSelectClicked.emit()">
                      <ion-icon slot="start" src="{{'location' | svgIcon }}" />
                      {{ i18n().select_location_add() }}
                    </ion-button>
                  }
                </ion-item>
              </ion-col>
            </ion-row>

            <!-- distance -->
            @if(formData().locations.length > 0 || formData().customLocationLabel) {
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-number-input [i18n]="distanceI18n()" [value]="distance()" (valueChange)="onDistanceChange($event)"
                    [readOnly]="isReadOnly()" [min]="1" [max]="maxDistance" [selectOnFocus]="true" />
                </ion-col>
              </ion-row>
            }
          </ion-grid>
        </ion-card-content>
      </ion-card>

      <!-- participants -->
      @if(isReadOnly()) {
        <ion-card>
          <ion-card-header>
            <ion-card-title>
              <ion-item lines="none">
                <div class="title">{{ i18n().select_participant_title() }}</div>
              </ion-item>
            </ion-card-title>
          </ion-card-header>
          <ion-card-content class="ion-no-padding">
            @if(participants().length > 0) {
              <ion-list>
                @for(participant of participants(); track participant.key) {
                  <ion-item lines="none">
                    <ion-avatar slot="start">
                      <ion-img src="{{ participant.modelType + '.' + participant.key | avatar }}" alt="Avatar" />
                    </ion-avatar>
                    <ion-label>{{ getParticipantName(participant) }}</ion-label>
                  </ion-item>
                }
              </ion-list>
            } @else {
              <ion-item lines="none">
                <ion-label>-</ion-label>
              </ion-item>
            }
          </ion-card-content>
        </ion-card>
      } @else if(currentUser(); as currentUser) {
        <okr-avatars (selectClicked)="personSelectClicked.emit()"
          [avatars]="participants()"
          (avatarsChange)="onFieldChange('participants', $event)"
          [readOnly]="isReadOnly()"
          [currentUser]="currentUser"
          [title]="i18n().select_participant_add()"
          [showButton]="true"
        />
      }

    @if(hasRole('admin')) {
      <okr-notes-input [i18n]="notesI18n()" [value]="notes()" (valueChange)="onFieldChange('notes', $event)" [readOnly]="isReadOnly()" />
    }
  `,
})
export class TripEditForm {
  // inputs
  public readonly i18n = input.required<TripI18n>();
  public readonly formData = model.required<TripModel>();
  protected readonly currentUser = input<UserModel | undefined>();
  public readonly tenantId = input.required<string>();
  public readonly mode = input.required<'add' | 'edit' | 'end' | 'view'>();
  public readonly boats = input.required<ResourceModel[]>();
  public readonly locations = input.required<LocationModel[]>();
  public readonly category = input.required<CategoryListModel>();

  // outputs
  public dirty = output<boolean>();
  public valid = output<boolean>();
  public personSelectClicked = output<void>();
  public boatSelectClicked = output<void>();
  public locationSelectClicked = output<void>();

  // signal form — wraps formData with Vest validation
  protected readonly tripForm = form(this.formData, (path) =>
    validateVestTree(path, tripValidationSuite),
  );

  constructor() {
    effect(() => this.valid.emit(this.tripForm().valid()));
  }

  // derived
  protected isReadOnly = computed(() => this.mode() === 'view');
  protected duration = computed(() =>
    getDurationLabel(this.formData().startDate, this.formData().startTime, this.formData().endTime)
  );
  protected selectedLocationKey = computed(() => this.formData().locations?.[0] ?? '');
  protected notes = linkedSignal(() => this.formData().notes ?? DEFAULT_NOTES);
  protected notesI18n = computed(() => ({ name: 'notes', label: this.i18n().notes_label(), placeholder: this.i18n().notes_placeholder() } as NotesInputI18n));
  protected participants = linkedSignal(() => this.formData()?.participants ?? []);
  // no `?? 0` fallback: a cleared field must stay empty instead of snapping back to a value
  protected distance = computed(() => this.formData().distance);

  protected distanceI18n = computed(() => ({
    name: 'distance',
    label: this.i18n().distance_label(),
    placeholder: this.i18n().distance_placeholder(),
    helper: this.i18n().distance_helper()
  } as NumberInputI18n));

  // constants
  protected formatTime = formatTripTime;
  protected readonly maxDistance = MAX_TRIP_DISTANCE_KM;

  protected onFieldChange(fieldName: string, fieldValue: string | string[] | number | boolean | AvatarInfo | AvatarInfo[] | undefined): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
    debugFormModel<TripModel>('TripEditForm', this.formData(), this.currentUser());
  }

  /** Caps the distance at MAX_TRIP_DISTANCE_KM silently — no validation warning, the value just stops growing. */
  protected onDistanceChange(distance: number): void {
    this.onFieldChange('distance', distance == null ? distance : Math.min(distance, MAX_TRIP_DISTANCE_KM));
  }

  protected clearBoat(): void {
    this.onFieldChange('resource', undefined);
  }

  protected clearLocation(): void {
    this.onFieldChange('locations', []);
    this.onFieldChange('customLocationLabel', '');
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }

  protected getParticipantName(participant: AvatarInfo): string {
    return getAvatarName(participant, this.currentUser()?.nameDisplay);
  }

  protected getIcon(boat: AvatarInfo): string {
    const itemName = boat.type === 'rboat' ? boat.subType : boat.type;
    return this.getCategoryItem(this.category(), itemName)?.icon ?? '';
  }

  protected getCategoryItem(cat: CategoryListModel, itemName?: string): CategoryItemModel | undefined {
    return cat ? cat.items.find(i => i.name === itemName) : undefined;
  }
}
