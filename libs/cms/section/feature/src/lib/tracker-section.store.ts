import { computed, inject } from '@angular/core';
import { Geolocation, Position } from '@capacitor/geolocation';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { ENV } from '@bk2/shared-config';
import { TrackerSection } from '@bk2/shared-models';
import { convertToKml, downloadZipFile, error } from '@bk2/shared-util-angular';
import { warn } from '@bk2/shared-util-core';

import { SectionService } from '@bk2/cms-section-data-access';

export type TrackerState = {
  section: TrackerSection | undefined;
  watchId: string | undefined;
  state: 'idle' | 'started' | 'paused' | 'stopped';
  currentPosition: Position | undefined;
  positions: Position[];
};

export const initialState: TrackerState = {
  section: undefined,
  watchId: undefined,
  state: 'idle',
  currentPosition: undefined,
  positions: []
};

export const TrackerSectionStore = signalStore(
  withState(initialState),
  withProps(() => ({
    sectionService: inject(SectionService),
    env: inject(ENV)
  })),

  /**
   * Positional information can be returned from different locaton providers: satellite, network, passive. For the best results,
   * network and passive providers should be avoided. Accuracy from satellite providers is always the best, usually below 16 (meters)
   * or definitely below 30. Coords with accuracy higher than 30 can be discarded.
   * Reasons for higher accuracy can be: 
   * - GPS isn't available or not enabled
   * - permission was not explicitly granted
   * - on Android: high accuracy is not enabled in the device's location settings
   */
  withComputed((state) => {
    return {
      autoStart: computed(() => { return state.section()?.properties?.autostart ?? false }),
      timeout: computed(() => (state.section()?.properties?.intervalInSeconds ?? 15 * 60) * 1000),
      enableHighAccuracy: computed(() => state.section()?.properties?.enableHighAccuracy ?? true),
      maximumAge: computed(() => state.section()?.properties?.maximumAge ?? 0),
      exportFormat: computed(() => state.section()?.properties?.exportFormat ?? 'kmz'),
    };
  }),

  withMethods((store) => {
    return {
      setSection(section: TrackerSection): void {
        patchState(store, { section, state: 'idle', watchId: undefined });
        if (store.autoStart()) {
          this.start();
        }
      },

      async start(): Promise<void> {
        const watchId = store.watchId();
        if (watchId) {
          console.log('TrackerSectionStore.start: already watching position (state === paused ?)');
          console.log('started');  
        } else {
          await this.watchPosition(); // Call the watchPosition() method immediately
          console.log('started');  
        }        
        patchState(store, { state: 'started' });        
      },

      pause(): void {
        const watchId = store.watchId();
        if (watchId) {
          patchState(store, { state: 'paused' });
          console.log('paused');
        }
      },

      stop(): void {
        const watchId = store.watchId();
        if (watchId) {
          console.log('stopped');
          Geolocation.clearWatch({ id: watchId });
          patchState(store, { watchId: undefined, state: 'stopped' });
        }
      },

      reset(): void {
        console.log('reset to idle');
        patchState(store, { watchId: undefined, state: 'idle', currentPosition: undefined, positions: [] });
      },

      async watchPosition(): Promise<void> {
       /*  const permissionStatus = (await Geolocation.requestPermissions()).location;
        if (permissionStatus !== 'granted') {
          throw new Error('Geolocation is not supported by this browser: ' + permissionStatus);
        } */
       console.log('TrackerSectionStore.watchPosition: start watching position', store.enableHighAccuracy(), store.maximumAge(), store.timeout());
        const watchId = await Geolocation.watchPosition({
          enableHighAccuracy: store.enableHighAccuracy(),
          maximumAge: store.maximumAge(),
          timeout: store.timeout()
        }, (position, err) => {
          if (err) {
            patchState(store, { currentPosition: undefined });
            console.error(err);
          } else if (position) {
              if (store.state() === 'paused') return;
              patchState(store, { currentPosition: position });
              // we currently save the positions in memory
              const positions = store.positions();
              positions.push(position);
              patchState(store, { positions: positions });
              // tbd: write the position to the database (per user)
                // only keep the data for one day (with the exception of admin)
                // make the data downloadable and show it on a map
              console.log('position:', position);
            } else {
              console.error('TrackerSectionStore.watchPosition: no position');
            }
        });
        console.log('TrackerSectionStore.watchPosition: watchId: ' + watchId);
        patchState(store, { watchId });
      },

      async export(): Promise<void> {
        switch(store.exportFormat()) {
          case 'kmz': {
            const kml = convertToKml(store.positions());
            await downloadZipFile(kml, 'positions.kmz');
            break;
          }
          case 'csv': {
            warn('TrackerSectionStore.export: CSV export not yet implemented');
            break;
          }
          case 'json': {
            await downloadZipFile(JSON.stringify(store.positions()), 'positions.json');
            break;
          }
          default: {
            error(undefined, 'TrackerSectionStore.export: unsupported export format: ' + store.exportFormat());
          }
        }
      }
    };
  }),
);
