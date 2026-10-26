import { computed, inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { patchState, signalStore, withMethods, withProps, withState } from '@ngrx/signals';
import { distinctUntilChanged, filter } from 'rxjs';

import { TransportMode } from '@okr/shared-models';
import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { DateFormat, generateRandomString, getCurrentTime, getTodayStr } from '@okr/shared-util-core';
import { NativeLocation, TrackDb, TrackerLocation, TrackService } from '@okr/mobility-tracker-data-access';
import {
  accumulateDistance, alignSections, correctedTrack, DetectionInput, hasNoPoints, LocalSection, sameTrackContent, DetectState, initialDetectState, LocalTrack,
  MotionActivity, needsUpload, nextSectionStartPoint, nextSections, pendingUploadOwner, resumeDecision, sectionsAfterPause, sessionDetectStep, StartWarning, localStoreDate, trackTenants,
  startWarning, summarize, toTrackPoint, TRACK_PROFILES, TRACKER_I18N_KEYS, TrackerI18n, TrackPoint,
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
  ownerWatch: boolean; // the pending-upload loop is subscribed to the signed-in owner
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
  withProps(() => {
    const appStore = inject(AppStore);
    const i18nService = inject(I18nService);
    return {
      db: inject(TrackDb),
      trackService: inject(TrackService),
      appStore,
      i18nService,
      toastController: inject(ToastController),
      router: inject(Router),
      i18n: i18nService.translateAll(TRACKER_I18N_KEYS) as TrackerI18n,
      /** Emits an id whenever person and auth uid are both known (pendingUploadOwner); undefined while signed out. */
      owner$: toObservable(computed(() => pendingUploadOwner(appStore.currentUser()?.personKey, appStore.fbUser()?.uid))),
      session: {
        detect: initialDetectState('foot'), lastPoint: undefined, sectionHasPoints: false, lastActivity: undefined, lastFix: undefined,
        handles: [], queue: Promise.resolve(), stopping: false, init: undefined, ownerWatch: false,
      } as TrackerSession,
    };
  }),
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
     * meanwhile stays pending for its own upload. Leftover track-points docs of a shrunk track (extraPointsUpTo) are deleted in the same batch.
     */
    async function uploadTrack(t: LocalTrack, silent: boolean): Promise<boolean> {
      const personKey = store.appStore.currentUser()?.personKey;
      const uid = store.appStore.fbUser()?.uid;
      try {
        if (!personKey || !uid) throw new Error('not signed in');
        // read AND issue inside the queue: batches reach Firestore in queue order, so a later correction or an
        // archive of this track always lands after this upload (upload() has no await before its commit)
        const snap = await enqueue(async () => {
          const current = await findTrack(t.key);
          if (!current || !needsUpload(current)) return { track: current, commit: undefined };
          const points = alignSections(await store.db.points(current.key), current.sections.length);
          const commit = store.trackService.upload(current, points, { personKey, uid, tenants: trackTenants(store.appStore.tenantId(), store.appStore.currentUser()?.diaryTargets, localStoreDate(current.startedAt)) }, current.extraPointsUpTo);
          commit.catch(() => undefined); // awaited below, outside the queue (offline it resolves only on reconnect)
          return { track: current, commit };
        });
        if (!snap?.track) return false; // gone (deleted) meanwhile
        if (!snap.commit) return snap.track.uploaded;
        const uploaded = snap.track;
        await snap.commit;
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
     * A short, non-blocking toast; the text is awaited (the lazy i18n scope may not be loaded yet at app start).
     * `unless` is checked right before it shows (e.g. the person is already on the page the action leads to).
     */
    async function toast(key: string, action?: { key: string; handler: () => void; unless?: () => boolean }): Promise<void> {
      try {
        const message = await store.i18nService.translateOnce(key);
        const buttons = action ? [{ text: await store.i18nService.translateOnce(action.key), handler: action.handler }] : undefined;
        if (action?.unless?.()) return;
        const t = await store.toastController.create({ message, duration: action ? 8000 : 4000, buttons });
        await t.present();
      } catch (error) {
        console.error('TrackerStore.toast', error);
      }
    }

    /**
     * Retries every finished, not yet uploaded track, silently. All uploads are issued on the queue in order;
     * their acks are awaited in parallel (offline each resolves only on reconnect).
     */
    async function uploadPending(): Promise<void> {
      try {
        const pending = (await store.db.list()).filter(needsUpload);
        const results = await Promise.all(pending.map((t) => uploadTrack(t, true)));
        // an earlier failure (e.g. stopped before the user was loaded) is no longer true once everything went up
        if (results.every(Boolean)) patchState(store, { uploadError: undefined });
      } catch (error) {
        console.error('TrackerStore.uploadPending', error);
      }
    }

    /** Runs uploadPending once each time an owner (person + auth uid) appears — at start the user is not loaded yet. */
    function watchOwner(): void {
      if (s.ownerWatch) return;
      s.ownerWatch = true;
      store.owner$.pipe(distinctUntilChanged(), filter((id): id is string => id !== undefined)).subscribe(() => void uploadPending());
    }

    /**
     * Stops recording and marks the track done locally; resolves with its key right then. The upload runs
     * fire-and-forget: Firestore's batch.commit() resolves only on the server's ack, so offline it can hang for hours.
     * A failed upload keeps the track local (uploadError).
     */
    async function stop(): Promise<string | undefined> {
      if (!store.active()) return undefined;
      s.stopping = true;
      let done: LocalTrack | 'empty' | undefined;
      try {
        done = await enqueue(async () => {
          await stopPlugin(); // inside the queue: a queued resume cannot restart GPS afterwards
          const t = store.active();
          if (!t) return undefined;
          if (hasNoPoints(await store.db.points(t.key))) {
            // nothing recorded: drop it locally, never upload an empty trip
            await store.db.remove(t.key);
            patchState(store, { active: undefined, currentMode: undefined, proposal: undefined, uploadError: undefined });
            return 'empty' as const;
          }
          const finished: LocalTrack = { ...t, state: 'done', endedAt: Date.now() };
          await store.db.updateTrack(finished);
          patchState(store, { active: undefined, currentMode: undefined, proposal: undefined, uploadError: undefined });
          return finished;
        });
      } finally {
        s.stopping = false; // before the upload: a new track may start at once
      }
      if (done === 'empty') {
        void toast(TRACKER_I18N_KEYS.stop_empty);
        return undefined;
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
      /**
       * Opens the database and offers a resumable track: native GPS that may still run after a WebView reload (with
       * no JS listener left) is stopped first, and a toast «Öffnen» leads to /tracker. Pending uploads are retried
       * silently whenever the owner (person + auth uid) becomes known — not here: at app start nobody is signed in yet.
       */
      init(): Promise<void> {
        s.init ??= (async () => {
          await refreshWarning();
          await store.db.open();
          const tracks = await store.db.list();
          const resumable = resumeDecision(tracks);
          if (resumable && !store.active()) await stopPlugin();
          patchState(store, { resumable, initialized: true });
          watchOwner();
          if (resumable) {
            void toast(TRACKER_I18N_KEYS.resume_title, {
              key: TRACKER_I18N_KEYS.resume_open,
              handler: () => void store.router.navigate(['/tracker']),
              unless: () => store.router.url.startsWith('/tracker'),
            });
          }
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
            if (hasNoPoints(await store.db.points(old.key))) {
              await store.db.remove(old.key); // an empty leftover is discarded, like an empty stop
            } else {
              const finished: LocalTrack = { ...old, state: 'done', endedAt: old.endedAt ?? Date.now() };
              await store.db.updateTrack(finished);
              void uploadTrack(finished, true);
            }
            patchState(store, { resumable: undefined });
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
          // no line and no distance across the pause: a new section in the same mode, not seeded with the last point
          const next = sectionsAfterPause(t.sections, s.sectionHasPoints);
          const recording: LocalTrack = { ...t, state: 'recording', sections: next.sections };
          const before = { lastPoint: s.lastPoint, sectionHasPoints: s.sectionHasPoints };
          s.lastPoint = undefined;
          s.sectionHasPoints = false;
          await store.db.updateTrack(recording);
          patchState(store, { active: recording });
          if (!(await startPlugin(recording.sections[recording.sections.length - 1]?.mode ?? 'foot'))) {
            await store.db.updateTrack(t);
            patchState(store, { active: t });
            s.lastPoint = before.lastPoint; // still paused on the old sections
            s.sectionHasPoints = before.sectionHasPoints;
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
          resetSession(lastSection.mode); // lastPoint undefined: the time the app was away is a gap, like a pause
          const next = sectionsAfterPause(r.sections, lastGroup.length > 0);
          const recording: LocalTrack = { ...r, state: 'recording', sections: next.sections };
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

      /**
       * Archives the uploaded trip, issued on the queue so it lands after any upload of this track already queued
       * or issued (that upload would otherwise re-write the trip with isArchived:false). The returned promise
       * resolves only on the server's ack — callers keep it detached from the UI.
       */
      async archiveTrack(key: string, tenants?: string[]): Promise<void> {
        const issued = await enqueue(async () => {
          const done = store.trackService.archive(key, tenants);
          done.catch(() => undefined); // awaited below
          return { done };
        });
        if (!issued) throw new Error('archive not issued');
        await issued.done;
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
