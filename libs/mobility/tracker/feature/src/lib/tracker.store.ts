import { inject } from '@angular/core';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { patchState, signalStore, withMethods, withProps, withState } from '@ngrx/signals';

import { TransportMode } from '@okr/shared-models';
import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { DateFormat, generateRandomString, getCurrentTime, getTodayStr } from '@okr/shared-util-core';
import { NativeLocation, TrackDb, TrackerLocation, TrackService } from '@okr/mobility-tracker-data-access';
import {
  accumulateDistance, alignSections, DetectionInput, DetectState, initialDetectState, LocalTrack, MotionActivity, needsUpload, nextSectionStartPoint,
  nextSections, resumeDecision, sessionDetectStep, StartWarning, startWarning, summarize, toTrackPoint, TRACK_PROFILES, TRACKER_I18N_KEYS, TrackerI18n,
  TrackPoint,
} from '@okr/mobility-tracker-util';

/**
 * Recording orchestration of the tracker (spec 1.121, plan 2 task 6). Every GPS fix goes straight into TrackDb;
 * detection runs on every fix and every activity event (Core Motion only reports changes, so the last activity is
 * kept). The decisions live in tracker-session.util; this store only wires plugin, database and upload.
 * On the web the plugin rejects every call: the store then shows the `notNative` warning instead of failing.
 */
interface TrackerStoreState {
  active: LocalTrack | undefined;
  currentMode: TransportMode | undefined;
  points: number;
  distanceM: number;
  warning: StartWarning;
  proposal: TransportMode | undefined; // a change detected while detection is locked; applied only by acceptProposal()
  resumable: LocalTrack | undefined; // a track left recording/paused when the app went away
  uploadError: string | undefined;
}

const initialState: TrackerStoreState = {
  active: undefined, currentMode: undefined, points: 0, distanceM: 0, warning: 'none', proposal: undefined, resumable: undefined, uploadError: undefined,
};

/** Mutable per-session bookkeeping that never renders. */
interface Session {
  detect: DetectState;
  lastPoint: TrackPoint | undefined;
  sectionHasPoints: boolean;
  lastActivity: MotionActivity | undefined;
  lastFix: NativeLocation | undefined;
  handles: PluginListenerHandle[];
  queue: Promise<void>; // fixes and section changes run strictly in order
  initialized: boolean;
}

function profileOf(mode: TransportMode) {
  const { distanceFilter, accuracy, minIntervalMs } = TRACK_PROFILES[mode];
  return minIntervalMs === undefined ? { distanceFilter, accuracy } : { distanceFilter, accuracy, minIntervalMs };
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const TrackerStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withProps(() => ({
    db: inject(TrackDb),
    trackService: inject(TrackService),
    appStore: inject(AppStore),
    i18n: inject(I18nService).translateAll(TRACKER_I18N_KEYS) as TrackerI18n,
    session: {
      detect: initialDetectState('foot', false), lastPoint: undefined, sectionHasPoints: false, lastActivity: undefined, lastFix: undefined,
      handles: [], queue: Promise.resolve(), initialized: false,
    } as Session,
  })),
  withMethods((store) => {
    const s = store.session;

    /** Runs a task after all earlier fixes/changes; a failing task never blocks the next one. */
    function enqueue(task: () => Promise<void>): Promise<void> {
      s.queue = s.queue.then(task).catch((error: unknown) => console.error('TrackerStore', error));
      return s.queue;
    }

    async function refreshWarning(): Promise<Awaited<ReturnType<typeof TrackerLocation.permission>> | undefined> {
      let p: Awaited<ReturnType<typeof TrackerLocation.permission>> | undefined;
      if (Capacitor.isNativePlatform()) {
        try {
          p = await TrackerLocation.permission();
        } catch {
          p = undefined;
        }
      }
      patchState(store, { warning: startWarning(p) });
      return p;
    }

    async function startPlugin(mode: TransportMode): Promise<void> {
      try {
        await ensureListeners();
        await TrackerLocation.start({ ...profileOf(mode), motion: true });
      } catch (error) {
        console.error('TrackerStore.startPlugin', error);
        patchState(store, { warning: 'notNative' });
      }
    }

    async function stopPlugin(): Promise<void> {
      try {
        await TrackerLocation.stop();
      } catch {
        // web / no plugin: nothing is running
      }
    }

    async function ensureListeners(): Promise<void> {
      if (s.handles.length > 0) return;
      s.handles.push(await TrackerLocation.addListener('location', (l) => void enqueue(() => onLocation(l))));
      s.handles.push(await TrackerLocation.addListener('activity', (a) => void enqueue(() => onActivity(a))));
    }

    async function onLocation(l: NativeLocation): Promise<void> {
      const t = store.active();
      if (!t || t.state !== 'recording') return;
      const p = toTrackPoint(l);
      const prev = s.lastPoint;
      s.lastPoint = p;
      s.lastFix = l;
      s.sectionHasPoints = true;
      patchState(store, { points: store.points() + 1, distanceM: accumulateDistance(store.distanceM(), prev, p) });
      await store.db.appendPoint(t.key, t.sections.length - 1, p);
      await detect({
        activity: s.lastActivity?.type ?? 'unknown', confidence: s.lastActivity?.confidence ?? 'low',
        speedMps: l.speed, altitudeM: l.altitude, at: l.time,
      });
    }

    async function onActivity(a: MotionActivity): Promise<void> {
      s.lastActivity = a;
      if (store.active()?.state !== 'recording') return;
      await detect({
        activity: a.type, confidence: a.confidence, speedMps: s.lastFix?.speed ?? null, altitudeM: s.lastFix?.altitude ?? null, at: a.timestamp,
      });
    }

    async function detect(input: DetectionInput): Promise<void> {
      const r = sessionDetectStep(s.detect, input);
      s.detect = r.state;
      if (r.switchTo) await switchSection(r.switchTo, true);
      else if (r.proposal && r.proposal !== store.proposal()) patchState(store, { proposal: r.proposal });
    }

    /** Ends the current section and starts one in `mode` (connected by the old section's last point); new profile without a stop/start. */
    async function switchSection(mode: TransportMode, detected: boolean): Promise<void> {
      const t = store.active();
      if (!t || t.state === 'done') return;
      const next = nextSections(t.sections, mode, detected, s.sectionHasPoints);
      const track: LocalTrack = { ...t, sections: next.sections };
      await store.db.updateTrack(track);
      if (next.newSection) {
        const first = nextSectionStartPoint(s.lastPoint);
        if (first) await store.db.appendPoint(t.key, track.sections.length - 1, first);
        s.sectionHasPoints = first !== undefined;
      }
      patchState(store, { active: track, currentMode: mode, proposal: undefined });
      if (t.state === 'recording') {
        try {
          await TrackerLocation.setProfile(profileOf(mode));
        } catch (error) {
          console.error('TrackerStore.setProfile', error);
        }
      }
    }

    /** Uploads one finished local track; on success it is marked uploaded. Silent: no uploadError (retries at init). */
    async function uploadTrack(t: LocalTrack, silent: boolean): Promise<boolean> {
      const personKey = store.appStore.currentUser()?.personKey;
      const uid = store.appStore.fbUser()?.uid;
      try {
        if (!personKey || !uid) throw new Error('not signed in');
        const points = alignSections(await store.db.points(t.key), t.sections.length);
        await store.trackService.upload(t, points, { personKey, uid });
        await store.db.updateTrack({ ...t, uploaded: true });
        return true;
      } catch (error) {
        console.error('TrackerStore.upload', error);
        if (!silent) patchState(store, { uploadError: errorText(error) });
        return false;
      }
    }

    /** Stops recording, marks the track done and uploads it; a failed upload keeps it local (uploadError). */
    async function stop(): Promise<string | undefined> {
      const t = store.active();
      if (!t) return undefined;
      await stopPlugin();
      await s.queue;
      const latest = store.active() ?? t;
      const done: LocalTrack = { ...latest, state: 'done', endedAt: Date.now() };
      await store.db.updateTrack(done);
      patchState(store, { active: undefined, currentMode: undefined, proposal: undefined, uploadError: undefined });
      await uploadTrack(done, false);
      return done.key;
    }

    function resetSession(mode: TransportMode, chosenByHand: boolean): void {
      s.detect = initialDetectState(mode, chosenByHand);
      s.lastPoint = undefined;
      s.lastFix = undefined;
      s.sectionHasPoints = false;
    }

    return {
      /** Opens the database, offers a resumable track (GPS is NOT restarted) and retries pending uploads once, silently. */
      async init(): Promise<void> {
        if (s.initialized) return;
        s.initialized = true;
        await refreshWarning();
        try {
          await store.db.open();
          const tracks = await store.db.list();
          patchState(store, { resumable: resumeDecision(tracks) });
          void (async () => {
            for (const t of tracks.filter(needsUpload)) await uploadTrack(t, true);
          })();
        } catch (error) {
          console.error('TrackerStore.init', error);
        }
      },

      /** mode undefined: detect, beginning with 'foot'; a mode chosen by hand locks detection (changes become proposals). */
      async start(mode?: TransportMode): Promise<void> {
        const current = store.active();
        if (current && current.state !== 'done') return;
        const p = await refreshWarning();
        if (p && p.location !== 'always' && p.location !== 'denied') {
          try {
            await TrackerLocation.requestAlways();
          } catch {
            // the warning below still tells what is missing
          }
          await refreshWarning();
        }
        if (store.warning() === 'notNative' || store.warning() === 'locationDenied') return;
        const chosenByHand = mode !== undefined;
        const m = mode ?? 'foot';
        resetSession(m, chosenByHand);
        const label = chosenByHand ? store.i18n[`mode_${m}` as const]() : store.i18n.default_name();
        const track: LocalTrack = {
          key: generateRandomString(20),
          state: 'recording',
          uploaded: false,
          name: `${label} ${getTodayStr(DateFormat.ViewDate)} ${getCurrentTime()}`,
          startedAt: Date.now(),
          sections: [{ mode: m, detected: !chosenByHand }],
        };
        await store.db.open();
        await store.db.createTrack(track);
        patchState(store, { active: track, currentMode: m, points: 0, distanceM: 0, proposal: undefined, uploadError: undefined, resumable: undefined });
        await startPlugin(m);
      },

      async pause(): Promise<void> {
        const t = store.active();
        if (!t || t.state !== 'recording') return;
        await stopPlugin();
        await s.queue;
        const paused: LocalTrack = { ...t, state: 'paused' };
        await store.db.updateTrack(paused);
        patchState(store, { active: paused });
      },

      async resume(): Promise<void> {
        const t = store.active();
        if (!t || t.state !== 'paused') return;
        const recording: LocalTrack = { ...t, state: 'recording' };
        await store.db.updateTrack(recording);
        patchState(store, { active: recording });
        await startPlugin(t.sections[t.sections.length - 1]?.mode ?? 'foot');
      },

      stop,

      /** A mode chosen by hand: new section (detected=false), detection locked to it. */
      async changeMode(mode: TransportMode): Promise<void> {
        await enqueue(async () => {
          s.detect = initialDetectState(mode, true);
          await switchSection(mode, false);
        });
      },

      /** Applies the change detection proposed while it was locked; detection runs freely again (row/ski/ship stay locked). */
      async acceptProposal(): Promise<void> {
        await enqueue(async () => {
          const mode = store.proposal();
          if (!mode) return;
          s.detect = initialDetectState(mode, false);
          await switchSection(mode, true);
        });
      },

      dismissProposal(): void {
        patchState(store, { proposal: undefined });
      },

      /** «Weiter aufnehmen»: continues the resumable track with its last section's profile. */
      async resumeRecording(): Promise<void> {
        const r = store.resumable();
        if (!r) return;
        const groups = alignSections(await store.db.points(r.key), r.sections.length);
        const lastSection = r.sections[r.sections.length - 1] ?? { mode: 'foot' as TransportMode, detected: true };
        const lastGroup = groups[groups.length - 1] ?? [];
        resetSession(lastSection.mode, !lastSection.detected);
        s.lastPoint = lastGroup[lastGroup.length - 1];
        s.sectionHasPoints = lastGroup.length > 0;
        const recording: LocalTrack = { ...r, state: 'recording' };
        await store.db.updateTrack(recording);
        patchState(store, {
          active: recording, currentMode: lastSection.mode, resumable: undefined, proposal: undefined,
          points: groups.reduce((n, g) => n + g.length, 0),
          distanceM: groups.reduce((m, g) => m + summarize(g).distanceM, 0),
        });
        await startPlugin(lastSection.mode);
      },

      /** «Beenden»: finishes the resumable track without recording more, and uploads it. */
      async finishResumable(): Promise<string | undefined> {
        const r = store.resumable();
        if (!r) return undefined;
        patchState(store, { active: r, resumable: undefined });
        return stop();
      },

      /** «Erneut hochladen» for a finished local track. */
      async retryUpload(key: string): Promise<boolean> {
        patchState(store, { uploadError: undefined });
        const t = (await store.db.list()).find((x) => x.key === key);
        return t && needsUpload(t) ? uploadTrack(t, false) : false;
      },
    };
  }),
);
