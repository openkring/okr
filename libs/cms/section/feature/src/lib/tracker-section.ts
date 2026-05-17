import { CUSTOM_ELEMENTS_SCHEMA, Component, computed, effect, inject, input } from '@angular/core';
import { IonCard, IonCardContent, IonCol, IonGrid, IonItem, IonRow } from '@ionic/angular/standalone';

import { TrackerSection } from '@bk2/shared-models';
import { ButtonCopyComponent, OptionalCardHeaderComponent, SpinnerComponent } from '@bk2/shared-ui';
import { lookupAddress } from '@bk2/shared-util-angular';

import { TrackerSectionStore } from './tracker-section.store';

/**
 * Tracker section first reads its configuration from section property trackerConfig.
 * Then, the tracker can be started by clicking the START button.
 * The current position is displayed and updated every interval.
 * The tracker can be stopped by clicking the STOP button.
 * When stopped, the current position is no longer updated.
 * Instead, a map is shown with all the positions.
 * The positions can be exported in KMZ format (Google Earth).
 * The data is kept for 24hours, then deleted in the database.
 * The tracker can be reset, which deletes all positions and returns to the initial state.
 * The tracker starts automatically, if trackerConfig.autostart is set to true.
 * 
 * tbd: pause tracking, add speed, heading, accuracy, altitude, altitudeAccuracy
 */
@Component({
  selector: 'bk-tracker-section',
  standalone: true,
  imports: [
    SpinnerComponent, ButtonCopyComponent,
    IonCard, IonCardContent, IonGrid, IonRow, IonCol, IonItem,
    OptionalCardHeaderComponent
],
  schemas: [ 
    CUSTOM_ELEMENTS_SCHEMA
  ],
  providers: [TrackerSectionStore],
  styles: [`
    ion-card-content { padding: 5px; }
    ion-card { padding: 0px; margin: 0px; border: 0px; box-shadow: none !important;}
  `],
  template: `
    @if(section()) {
      <ion-card>
        <bk-optional-card-header  [title]="title()" [subTitle]="subTitle()" />
        <ion-card-content>
          <ion-grid>
            <ion-row>
              @if(autoStart() === false && (state() === 'idle' || state() === 'paused')) {
                <ion-col size="6" size-md="4">
                  <ion-button (click)="start()">Start</ion-button>
                  <ion-note><small>interval: {{ timeout() }} msec</small></ion-note>
                </ion-col>
              }
              @if(state() === 'started') {
                <ion-col size="6" size-md="4">
                  <ion-button (click)="pause()">Pause</ion-button>                
                </ion-col>   
                <ion-col size="6" size-md="4">
                  <ion-button (click)="stop()">Stop</ion-button>                
                </ion-col>
              }            
              @if(state() === 'stopped') {
                <ion-col size="6" size-md="4">
                  <ion-button (click)="reset()">Reset</ion-button>                
                </ion-col>
                <ion-col size="6" size-md="4">
                  <ion-button (click)="export()">Export</ion-button>                
                </ion-col>
              }
            </ion-row>
            <ion-row>
              <ion-col size="12" size-md="4">
                <ion-item lines="none">
                  <ion-label>Longitude: </ion-label>
                  <ion-label>{{ longitude()}}</ion-label>
                  @if(!editMode()) {
                    <bk-button-copy [value]="longitude()" />
                  }
                </ion-item>
              </ion-col>
              <ion-col size="12" size-md="4">
                <ion-item lines="none">
                  <ion-label>Latitude: </ion-label>
                  <ion-label>{{ latitude()}}</ion-label>
                  @if(!editMode()) {
                    <bk-button-copy [value]="latitude()" />
                  }
                </ion-item>
              </ion-col>
              <ion-col size="12" size-md="4">
                <ion-item lines="none">
                  <ion-label>Altitude: </ion-label>
                  <ion-label>{{ altitude()}}</ion-label>
                  @if(!editMode()) {
                    <bk-button-copy [value]="altitude()" />
                  }
                </ion-item>
              </ion-col>
            </ion-row>
 
          </ion-grid>
        </ion-card-content>
      </ion-card>
    } @else {
      <bk-spinner />
    }
  `
})
export class TrackerSectionComponent {
  protected trackerStore = inject(TrackerSectionStore);

  // inputs
  public section = input<TrackerSection>();
  public editMode = input(false);

  // derived signals
  protected title = computed(() => this.section()?.title);  
  protected subTitle = computed(() => this.section()?.subTitle);

  protected currentPosition = computed(() => this.trackerStore.currentPosition());
  protected latitude = computed(() => this.currentPosition()?.coords?.latitude);
  protected longitude = computed(() => this.currentPosition()?.coords?.longitude);
  protected altitude = computed(() => this.currentPosition()?.coords?.altitude);
  protected address = computed(() => lookupAddress(this.latitude(), this.longitude()));
  protected exportFormat = computed(() => this.trackerStore.exportFormat());
  protected state = computed(() => this.trackerStore.state());
  protected timeout = computed(() => this.trackerStore.timeout());
  protected autoStart = computed(() => this.trackerStore.autoStart());

  constructor() {
    effect(() => {
      const section = this.section();
      if (section) {
        this.trackerStore.setSection(section);
      }
    });
  }

  protected start(): void {
    if (this.editMode()) return; // prevent operation in edit mode
    this.trackerStore.start();
  }

  protected pause(): void {
    if (this.editMode()) return; // prevent operation in edit mode
    this.trackerStore.pause();
  }

  protected stop(): void {
    if (this.editMode()) return; // prevent operation in edit mode
    this.trackerStore.stop();
  }

  protected reset(): void {
    if (this.editMode()) return; // prevent operation in edit mode
    this.trackerStore.reset();
  }

  protected export(): void {
    if (this.editMode()) return; // prevent operation in edit mode
    this.trackerStore.export();
  }
}
