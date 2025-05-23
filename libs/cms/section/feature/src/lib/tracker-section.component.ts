import { CUSTOM_ELEMENTS_SCHEMA, Component, computed, effect, inject, input } from '@angular/core';
import { IonCard, IonCardContent, IonCol, IonGrid, IonItem, IonRow } from '@ionic/angular/standalone';

import { SectionModel } from '@bk2/shared/models';
import { ButtonCopyComponent, OptionalCardHeaderComponent, SpinnerComponent } from '@bk2/shared/ui';
import { lookupAddress } from '@bk2/shared/util';
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
              @if(trackerStore.autoStart() === false && (trackerStore.state() === 'idle' || trackerStore.state() === 'paused')) {
                <ion-col size="6" size-md="4">
                  <ion-button (click)="trackerStore.start()">Start</ion-button>
                  <ion-note><small>interval: {{ trackerStore.timeout() }} msec</small></ion-note>
                </ion-col>
              }
              @if(trackerStore.state() === 'started') {
                <ion-col size="6" size-md="4">
                  <ion-button (click)="trackerStore.pause()">Pause</ion-button>                
                </ion-col>   
                <ion-col size="6" size-md="4">
                  <ion-button (click)="trackerStore.stop()">Stop</ion-button>                
                </ion-col>
              }            
              @if(trackerStore.state() === 'stopped') {
                <ion-col size="6" size-md="4">
                  <ion-button (click)="trackerStore.reset()">Reset</ion-button>                
                </ion-col>
                <ion-col size="6" size-md="4">
                  <ion-button (click)="trackerStore.export()">Export</ion-button>                
                </ion-col>
              }
            </ion-row>
            <ion-row>
              <ion-col size="12" size-md="4">
                <ion-item lines="none">
                  <ion-label>Longitude: </ion-label>
                  <ion-label>{{ longitude()}}</ion-label>
                  <bk-button-copy [value]="longitude()" />
                </ion-item>
              </ion-col>
              <ion-col size="12" size-md="4">
                <ion-item lines="none">
                  <ion-label>Latitude: </ion-label>
                  <ion-label>{{ latitude()}}</ion-label>
                  <bk-button-copy [value]="latitude()" />
                </ion-item>
              </ion-col>
              <ion-col size="12" size-md="4">
                <ion-item lines="none">
                  <ion-label>Altitude: </ion-label>
                  <ion-label>{{ altitude()}}</ion-label>
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
  public section = input<SectionModel>();
  protected trackerStore = inject(TrackerSectionStore);

  protected title = computed(() => this.section()?.title);  
  protected subTitle = computed(() => this.section()?.subTitle);

  protected currentPosition = computed(() => this.trackerStore.currentPosition());
  protected latitude = computed(() => this.currentPosition()?.coords?.latitude);
  protected longitude = computed(() => this.currentPosition()?.coords?.longitude);
  protected altitude = computed(() => this.currentPosition()?.coords?.altitude);
  protected address = computed(() => lookupAddress(this.latitude(), this.longitude()));
  protected exportFormat = computed(() => this.trackerStore.exportFormat());  

  constructor() {
    effect(() => {
      const _section = this.section();
      if (_section) {
        this.trackerStore.setSection(_section);
      }
    });
  }
}

