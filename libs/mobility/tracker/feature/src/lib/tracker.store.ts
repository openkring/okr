import { inject } from '@angular/core';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { patchState, signalStore, withMethods, withProps, withState } from '@ngrx/signals';

import { TransportMode } from '@okr/shared-models';
import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { DateFormat, generateRandomString, getCurrentTime, getTodayStr } from '@okr/shared-util-core';
import { NativeLocation, TrackDb, TrackerLocation, TrackService } from '@okr/mobility-tracker-data-access';
import {
  accumulateDistance, alignSections, correctedTrack, DetectionInput, extraPointsRange, LocalSection, sameTrackContent, DetectState, initialDetectState, LocalTrack, MotionActivity, needsUpload, nextSectionStartPoint,
  nextSections, resumeDecision, sessionDetectStep, StartWarning, startWarning, summarize, toTrackPoint, TRACK_PROFILES, TRACKER_I18N_KEYS, TrackerI18n,
  TrackPoint,
} from '@okr/mobility-tracker-util';

/**
 * Recording orchestration of the tracker (spec 1.121, plan 2 task 6). Every GPS fix goes straight into TrackDb;
 * detection runs on every fix and every activity event (Core Motion only reports changes, so the last activity is
 * kept). The decisions live in tracker-session.util; this store only wires plugin, database and upload.
 * On the web the plugin rejects every call: the store then shows the `notNative` warning instead of failing.
 * Every state change of the active track (start, pause, resume, stop, section switch, each fix) runs through ONE
 * promise queue, so a write never works on a stale copy of the track.
 */
export interface TrackerStoreState {
  active: LocalTrack | undefined;
  currentMode: TransportMode | undefined;
  points: number;
  distanceM: number;
  warning: StartWarning;
  proposal: TransportMode | undefined; // a change detected while detection is locked; applied only by acceptProposal()
  resumable: LocalTrack | undefined; // a track left recording/paused when the app went away
  uploadError: string | undefined;
  initialized: boolean; // init() completed: the database is open
}

const initialState: TrackerStoreState = {
  active: undefined, currentMode: undefined, points: 0, distanceM: 0, warning: 'none', proposal: undefined, resumable: undefined, uploadError: undefined, initialized: false,
};

/** Mutable per-session bookkeeping that never renders. */
export interface TrackerSession {
  detect: DetectState;
  lastPoint: TrackPoint | undefined;
  sectionHasPoints: boolean;
  lastActivity: MotionActivity | undefined;
  lastFix: NativeLocation | undefined;
  handles: PluginListenerHandle[];
  queue: Promise<void>; // every change of the active track runs strictly in order
  stopping: boolean; // set by stop(): late fixes, mode changes and proposals are ignored
  init: Promise<void> | undefined; // a failed open is retried on the next init()
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
      detect: initialDetectState('foot'), lastPoint: undefined, sectionHasPoints: false, lastActivity: undefined, lastFix: undefined,
      handles: [], queue: Promise.resolve(), stopping: false, init: undefined,
    } as TrackerSession,
  })),
  withMethods((store) => {
    const s = store.session;

    /** Runs a task after all earlier ones; a failing task is logged, resolves to undefined and never blocks the next one. */
    function enqueue<T>(task: () => Promise<T>): Promise<T | undefined> {
      const run = s.queue.then(task);
      s.queue = run.then(() => undefined, (error: unknown) => console.error('TrackerStore', error));
      return run.catch(() => undefined);
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

    /** false when the plugin refused: `startFailed` on a device, `notNative` on the web. */
    async function startPlugin(mode: TransportMode): Promise<boolean> {
      try {
        await ensureListeners();
        await TrackerLocation.start({ ...profileOf(mode), motion: true });
        return true;
      } catch (error) {
        console.error('TrackerStore.startPlugin', error);
        patchState(store, { warning: Capacitor.isNativePlatform() ? 'startFailed' : 'notNative' });
        return false;
      }
    }

    async function stopPlugin(): Promise<void> {
      try {
        await TrackerLocation.stop();
      } catch {
        // web / no plugin: nothing is running
      }
    }

    // Registered once for the app's lifetime (the store is a root singleton); the handles are never removed.
    async function ensureListeners(): Promise<void> {
      if (s.handles.length > 0) return;
      s.handles.push(await TrackerLocation.addListener('location', (l) => void enqueue(() => onLocation(l))));
      s.handles.push(await TrackerLocation.addListener('activity', (a) => void enqueue(() => onActivity(a))));
    }

    async function onLocation(l: NativeLocation): Promise<void> {
      const t = store.active();
      if (!t || t.state !== 'recording' || s.stopping) return;
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
      if (store.active()?.state !== 'recording' || s.stopping) return;
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

    /**
     * Ends the current section and starts one in `mode` (connected by the old section's last point); new profile
     * without a stop/start. Runs inside the queue only; does nothing once stop() began.
     */
    async function switchSection(mode: TransportMode, detected: boolean): Promise<void> {
      const t = store.active();
      if (!t || t.state === 'done' || s.stopping) return;
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

    /** A queued mode change for the track that is active now; skipped if stop() began or another track became active. */
    function changeFor(task: () => Promise<void>): Promise<void> {
      const key = store.active()?.key;
      return enqueue(async () => {
        if (!key || s.stopping || store.active()?.key !== key) return;
        await task();
      }).then(() => undefined);
    }

    async function findTrack(key: string): Promise<LocalTrack | undefined> {
      return (await store.db.list()).find((x) => x.key === key);
    }

    /**
     * Uploads one finished local track; on success it is marked uploaded. Silent: no uploadError (retries at init).
     * The track and its points are read inside the queue (never a stale copy next to corrected points), and the
     * `uploaded` mark is written only if name and sections still equal the uploaded snapshot — a correction made
     * meanwhile stays pending for its own upload. Leftover track-points docs of a shrunk track are deleted.
     */
    async function uploadTrack(t: LocalTrack, silent: boolean): Promise<boolean> {
      const personKey = store.appStore.currentUser()?.personKey;
      const uid = store.appStore.fbUser()?.uid;
      try {
        if (!personKey || !uid) throw new Error('not signed in');
        const snap = await enqueue(async () => {
          const current = await findTrack(t.key);
          if (!current || !needsUpload(current)) return { track: current, points: undefined };
          return { track: current, points: alignSections(await store.db.points(current.key), current.sections.length) };
        });
        if (!snap?.track) return false; // gone (deleted) meanwhile
        if (!snap.points) return snap.track.uploaded;
        const uploaded = snap.track;
        await store.trackService.upload(uploaded, snap.points, { personKey, uid });
        const extra = extraPointsRange(uploaded);
        if (extra) {
          try {
            await store.trackService.deleteExtraPoints(uploaded.key, extra.from, extra.to);
          } catch (error) {
            console.error('TrackerStore.deleteExtraPoints', error); // leftovers are never read: the trip lists its sections
          }
        }
        await enqueue(async () => {
          const now = await findTrack(uploaded.key);
          if (!now || now.uploaded || !sameTrackContent(now, uploaded)) return;
          const marked: LocalTrack = { ...now, uploaded: true };
          delete marked.extraPointsUpTo;
          await store.db.updateTrack(marked);
        });
        return true;
      } catch (error) {
        console.error('TrackerStore.upload', error);
        // a late result must not touch the state of a newer track started meanwhile
        const active = store.active();
        if (!silent && (!active || active.key === t.key)) patchState(store, { uploadError: errorText(error) });
        return false;
      }
    }

    /**
     * Stops recording and marks the track done locally; resolves with its key right then. The upload runs
     * fire-and-forget: Firestore's batch.commit() resolves only on the server's ack, so offline it can hang for hours.
     * A failed upload keeps the track local (uploadError).
     */
    async function stop(): Promise<string | undefined> {
      if (!store.active()) return undefined;
      s.stopping = true;
      let done: LocalTrack | undefined;
      try {
        done = await enqueue(async () => {
          await stopPlugin(); // inside the queue: a queued resume cannot restart GPS afterwards
          const t = store.active();
          if (!t) return undefined;
          const finished: LocalTrack = { ...t, state: 'done', endedAt: Date.now() };
          await store.db.updateTrack(finished);
          patchState(store, { active: undefined, currentMode: undefined, proposal: undefined, uploadError: undefined });
          return finished;
        });
      } finally {
        s.stopping = false; // before the upload: a new track may start at once
      }
      if (!done) return undefined;
      void uploadTrack(done, false);
      return done.key;
    }

    function resetSession(mode: TransportMode): void {
      s.detect = initialDetectState(mode);
      s.lastPoint = undefined;
      s.lastFix = undefined;
      s.sectionHasPoints = false;
    }

    return {
      /** Opens the database, offers a resumable track (GPS is NOT restarted) and retries pending uploads once, silently. */
      init(): Promise<void> {
        s.init ??= (async () => {
          await refreshWarning();
          await store.db.open();
          const tracks = await store.db.list();
          patchState(store, { resumable: resumeDecision(tracks), initialized: true });
          void (async () => {
            for (const t of tracks.filter(needsUpload)) await uploadTrack(t, true);
          })();
        })().catch((error: unknown) => {
          console.error('TrackerStore.init', error);
          s.init = undefined; // a failed open is retried by the next init()
        });
        return s.init;
      },

      /**
       * mode undefined: detect, beginning with 'foot'. Only row, ski and ship lock detection (changes become proposals).
       * A track still waiting as `resumable` is finished first (done, uploaded silently).
       */
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
        await enqueue(async () => {
          const busy = store.active();
          if (busy && busy.state !== 'done') return;
          await store.db.open();
          const old = store.resumable();
          if (old) {
            const finished: LocalTrack = { ...old, state: 'done', endedAt: old.endedAt ?? Date.now() };
            await store.db.updateTrack(finished);
            patchState(store, { resumable: undefined });
            void uploadTrack(finished, true);
          }
          const chosenByHand = mode !== undefined;
          const m = mode ?? 'foot';
          resetSession(m);
          const label = chosenByHand ? store.i18n[`mode_${m}` as const]() : store.i18n.default_name();
          const track: LocalTrack = {
            key: generateRandomString(20),
            state: 'recording',
            uploaded: false,
            name: `${label} ${getTodayStr(DateFormat.ViewDate)} ${getCurrentTime()}`,
            startedAt: Date.now(),
            sections: [{ mode: m, detected: !chosenByHand }],
          };
          await store.db.createTrack(track);
          patchState(store, { active: track, currentMode: m, points: 0, distanceM: 0, proposal: undefined, uploadError: undefined });
          if (!(await startPlugin(m))) {
            // no GPS running: drop the empty track instead of leaving a ghost 'recording' one
            await store.db.remove(track.key);
            patchState(store, { active: undefined, currentMode: undefined });
          }
        });
      },

      async pause(): Promise<void> {
        if (store.active()?.state !== 'recording') return;
        await enqueue(async () => {
          const t = store.active(); // re-read: a section switch may have finished meanwhile
          if (!t || t.state !== 'recording') return;
          await stopPlugin(); // inside the queue, like the start in resume()
          const paused: LocalTrack = { ...t, state: 'paused' };
          await store.db.updateTrack(paused);
          patchState(store, { active: paused });
        });
      },

      async resume(): Promise<void> {
        await enqueue(async () => {
          const t = store.active();
          if (!t || t.state !== 'paused') return;
          const recording: LocalTrack = { ...t, state: 'recording' };
          await store.db.updateTrack(recording);
          patchState(store, { active: recording });
          if (!(await startPlugin(recording.sections[recording.sections.length - 1]?.mode ?? 'foot'))) {
            await store.db.updateTrack(t);
            patchState(store, { active: t });
          }
        });
      },

      stop,

      /** A mode chosen by hand: new section (detected=false). Detection keeps running unless the mode is row/ski/ship. */
      changeMode(mode: TransportMode): Promise<void> {
        return changeFor(async () => {
          s.detect = initialDetectState(mode);
          await switchSection(mode, false);
        });
      },

      /** Applies the change detection proposed while it was locked (row/ski/ship); the new mode decides the lock again. */
      acceptProposal(): Promise<void> {
        return changeFor(async () => {
          const mode = store.proposal();
          if (!mode) return;
          s.detect = initialDetectState(mode);
          await switchSection(mode, true);
        });
      },

      dismissProposal(): void {
        patchState(store, { proposal: undefined });
      },

      /** «Weiter aufnehmen»: continues the resumable track with its last section's profile. */
      async resumeRecording(): Promise<void> {
        await enqueue(async () => {
          const r = store.resumable();
          const busy = store.active();
          if (!r || (busy && busy.state !== 'done')) return;
          const groups = alignSections(await store.db.points(r.key), r.sections.length);
          const lastSection = r.sections[r.sections.length - 1] ?? { mode: 'foot' as TransportMode, detected: true };
          const lastGroup = groups[groups.length - 1] ?? [];
          resetSession(lastSection.mode);
          s.lastPoint = lastGroup[lastGroup.length - 1];
          s.sectionHasPoints = lastGroup.length > 0;
          const recording: LocalTrack = { ...r, state: 'recording' };
          await store.db.updateTrack(recording);
          patchState(store, {
            active: recording, currentMode: lastSection.mode, resumable: undefined, proposal: undefined,
            points: groups.reduce((n, g) => n + g.length, 0),
            distanceM: groups.reduce((m, g) => m + summarize(g).distanceM, 0),
          });
          if (!(await startPlugin(lastSection.mode))) {
            // keep it paused: the person can try again or finish it
            const paused: LocalTrack = { ...recording, state: 'paused' };
            await store.db.updateTrack(paused);
            patchState(store, { active: paused });
          }
        });
      },

      /** «Beenden»: finishes the resumable track without recording more, and uploads it. */
      async finishResumable(): Promise<string | undefined> {
        const r = store.resumable();
        if (!r || store.active()) return undefined;
        patchState(store, { active: r, resumable: undefined });
        return stop();
      },

      /**
       * Owner correction or rename of a finished local track, on the queue: points and track are rewritten
       * (`uploaded:false`), then the upload runs detached (offline it waits; init() retries it).
       * @returns false when the track is missing, not finished, or the write failed
       */
      async correct(key: string, sections: LocalSection[], name?: string): Promise<boolean> {
        const written = await enqueue(async () => {
          const current = await findTrack(key);
          if (!current || current.state !== 'done') return undefined;
          const corrected = correctedTrack(current, sections, name);
          await store.db.replacePoints(key, sections.map((x) => x.points));
          await store.db.updateTrack(corrected);
          return corrected;
        });
        if (!written) return false;
        void uploadTrack(written, true);
        return true;
      },

      /** Removes a local track (on the queue, so no upload snapshot reads it half-deleted). */
      async removeLocal(key: string): Promise<void> {
        await enqueue(() => store.db.remove(key));
      },

      /** «Erneut hochladen» for a finished local track. */
      async retryUpload(key: string): Promise<boolean> {
        patchState(store, { uploadError: undefined });
        const t = await findTrack(key);
        return t && needsUpload(t) ? uploadTrack(t, false) : false;
      },
    };
  }),
);
